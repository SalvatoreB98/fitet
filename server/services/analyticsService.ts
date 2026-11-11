import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export type AnalyticsMetricType = 'page' | 'visitor' | 'click' | 'flow';

export interface DailySeriesPoint {
  date: string;
  pages: number;
  visitors: number;
  clicks: number;
}

export interface TargetCountItem {
  target: string;
  count: number;
}

export interface ClickFlowEdge {
  from: string;
  to: string;
  label: string;
  count: number;
  shareFromSource: number;
}

export interface ClickFlowNode {
  id: string;
  totalIn: number;
  totalOut: number;
}

export interface MultiStepJourney {
  steps: string[];
  label: string;
  estimatedCount: number;
}

export interface AnalyticsSummary {
  configured: boolean;
  rangeDays: number;
  startDate: string;
  endDate: string;
  totals: {
    pages: number;
    visitors: number;
    clicks: number;
    flows: number;
    avgPagesPerDay: number;
    avgVisitorsPerDay: number;
    avgClicksPerDay: number;
    peakDay: { date: string; total: number } | null;
  };
  dailySeries: DailySeriesPoint[];
  topPages: TargetCountItem[];
  topClicks: TargetCountItem[];
  clickFlows: ClickFlowEdge[];
  flowGraph: {
    nodes: ClickFlowNode[];
    edges: ClickFlowEdge[];
  };
  topPaths: MultiStepJourney[];
}

interface DailyAnalyticsRow {
  date: string;
  type: string;
  target: string;
  count: number;
}

const MAX_TYPE_LEN = 32;
const MAX_TARGET_LEN = 200;

function getUtcDateString(offsetDays = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function sanitizeMetricValue(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Normalizza un path HTTP per evitare duplicati o parametri query potenzialmente sensibili.
 */
export function normalizeAnalyticsPagePath(rawPath: string): string {
  const clean = (rawPath || '/').split('?')[0].split('#')[0].trim();
  if (!clean || clean === '/') return '/';
  const collapsed = clean.replace(/\/{2,}/g, '/');
  return (collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed).slice(
    0,
    MAX_TARGET_LEN
  );
}

/**
 * AnalyticsService - Tracciamento GDPR-compliant su Supabase.
 *
 * Non utilizza cookie, non salva indirizzi IP, non usa localStorage/sessionStorage
 * identificativi e aggrega i contatori per giorno tramite la RPC `increment_metric`.
 */
class AnalyticsService {
  private supabase: SupabaseClient | null = null;
  // Fallback in-memory solo per ambiente locale privo di credenziali Supabase
  private memoryFallback = new Map<string, DailyAnalyticsRow>();
  private memoryVisitors = new Set<string>();
  private ephemeralVisitorSalt = crypto.randomBytes(32).toString('hex');

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      try {
        this.supabase = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        console.log('✅ [AnalyticsService] Supabase connesso.');
      } catch (err) {
        console.error('❌ [AnalyticsService] Errore inizializzazione Supabase:', err);
        this.supabase = null;
      }
    } else {
      console.warn('⚠️ [AnalyticsService] Credenziali Supabase mancanti: fallback in memoria locale.');
    }
  }

  isConfigured(): boolean {
    return this.supabase !== null;
  }

  private incrementMemoryFallback(type: string, target: string): void {
    const date = getUtcDateString(0);
    const key = `${date}|${type}|${target}`;
    const existing = this.memoryFallback.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      this.memoryFallback.set(key, { date, type, target, count: 1 });
    }
  }

  /**
   * Chiama la RPC Postgres `increment_metric(p_type, p_target)` senza mai lanciare eccezioni bloccanti.
   */
  async incrementMetric(type: AnalyticsMetricType | string, target: string): Promise<void> {
    const cleanType = sanitizeMetricValue(type, MAX_TYPE_LEN);
    const cleanTarget = sanitizeMetricValue(target, MAX_TARGET_LEN);
    if (!cleanType || !cleanTarget) return;

    if (!this.supabase) {
      this.incrementMemoryFallback(cleanType, cleanTarget);
      return;
    }

    try {
      const { error } = await this.supabase.rpc('increment_metric', {
        p_type: cleanType,
        p_target: cleanTarget,
      });

      if (error) {
        console.warn(`[AnalyticsService] Errore RPC increment_metric (${cleanType}, ${cleanTarget}):`, error.message);
      }
    } catch (err: any) {
      console.warn('[AnalyticsService] Eccezione RPC increment_metric:', err?.message || err);
    }
  }

  /**
   * Calcola un hash HMAC giornaliero anonimo e irreversibile per contare i visitatori unici
   * senza salvare IP né usare cookie (il salt ruota ogni giorno UTC).
   */
  computeDailyVisitorHash(ip: string, userAgent: string): string {
    const today = getUtcDateString(0);
    const baseSalt =
      process.env.ANALYTICS_SALT ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CRON_SECRET ||
      this.ephemeralVisitorSalt;
    return crypto
      .createHmac('sha256', `${baseSalt}:${today}`)
      .update(`${ip}|${userAgent}`, 'utf8')
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Registra un visitatore unico giornaliero tramite RPC Postgres `track_daily_visitor`.
   */
  async trackDailyVisitor(visitorHash: string): Promise<void> {
    const cleanHash = sanitizeMetricValue(visitorHash, 64);
    if (!cleanHash) return;

    const today = getUtcDateString(0);
    const dedupKey = `${today}|${cleanHash}`;
    if (this.memoryVisitors.has(dedupKey)) {
      return;
    }

    // Pulizia chiavi dei giorni precedenti in memoria
    for (const k of this.memoryVisitors) {
      if (!k.startsWith(`${today}|`)) this.memoryVisitors.delete(k);
    }

    if (!this.supabase) {
      this.memoryVisitors.add(dedupKey);
      this.incrementMemoryFallback('visitor', 'unique');
      return;
    }

    try {
      const { error } = await this.supabase.rpc('track_daily_visitor', {
        p_visitor_hash: cleanHash,
      });
      if (error) {
        console.warn('[AnalyticsService] Errore RPC track_daily_visitor:', error.message);
      } else {
        this.memoryVisitors.add(dedupKey);
      }
    } catch (err: any) {
      console.warn('[AnalyticsService] Eccezione RPC track_daily_visitor:', err?.message || err);
    }
  }

  /**
   * Registra un click (o azione UI) e, se presente lo step di provenienza `from`,
   * incrementa anche il relativo arco di flusso `from -> target`.
   */
  async recordClick(
    target: string,
    from?: string | null,
    metricType: 'click' | 'page' = 'click'
  ): Promise<void> {
    const cleanTarget = sanitizeMetricValue(target, MAX_TARGET_LEN);
    if (!cleanTarget) return;

    const cleanFrom = sanitizeMetricValue(from ?? '', 90);
    const tasks: Promise<void>[] = [this.incrementMetric(metricType, cleanTarget)];

    if (cleanFrom && cleanFrom !== cleanTarget) {
      const flowTarget = `${cleanFrom} -> ${cleanTarget}`.slice(0, MAX_TARGET_LEN);
      tasks.push(this.incrementMetric('flow', flowTarget));
    }

    await Promise.all(tasks);
  }

  /**
   * Restituisce i dati aggregati degli ultimi N giorni (default 30, supporta 7 o 30)
   * inclusi grafici giornalieri, top pagine, top click e flusso di navigazione utenti.
   */
  async getAnalytics(requestedDays = 30): Promise<AnalyticsSummary> {
    const rangeDays = requestedDays <= 7 ? 7 : 30;
    const endDate = getUtcDateString(0);
    const startDate = getUtcDateString(-(rangeDays - 1));

    let rows: DailyAnalyticsRow[] = [];

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('daily_analytics')
        .select('date, type, target, count')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) {
        throw new Error(`Lettura daily_analytics fallita: ${error.message}`);
      }
      rows = (data || []) as DailyAnalyticsRow[];
    } else {
      rows = Array.from(this.memoryFallback.values()).filter(
        (r) => r.date >= startDate && r.date <= endDate
      );
    }

    // Costruisci tutti i giorni dell'intervallo per avere una serie continua
    const dailyMap = new Map<string, { pages: number; visitors: number; clicks: number }>();
    for (let i = rangeDays - 1; i >= 0; i--) {
      dailyMap.set(getUtcDateString(-i), { pages: 0, visitors: 0, clicks: 0 });
    }

    const pageCounts = new Map<string, number>();
    const clickCounts = new Map<string, number>();
    const flowCounts = new Map<string, number>();

    let totalPages = 0;
    let totalVisitors = 0;
    let totalClicks = 0;
    let totalFlows = 0;

    for (const row of rows) {
      const count = Number(row.count) || 0;
      if (count <= 0) continue;

      const dayBucket = dailyMap.get(row.date);
      if (row.type === 'page') {
        totalPages += count;
        if (dayBucket) dayBucket.pages += count;
        pageCounts.set(row.target, (pageCounts.get(row.target) || 0) + count);
      } else if (row.type === 'visitor') {
        totalVisitors += count;
        if (dayBucket) dayBucket.visitors += count;
      } else if (row.type === 'click') {
        totalClicks += count;
        if (dayBucket) dayBucket.clicks += count;
        clickCounts.set(row.target, (clickCounts.get(row.target) || 0) + count);
      } else if (row.type === 'flow') {
        totalFlows += count;
        flowCounts.set(row.target, (flowCounts.get(row.target) || 0) + count);
      }
    }

    const dailySeries: DailySeriesPoint[] = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      pages: val.pages,
      visitors: val.visitors,
      clicks: val.clicks,
    }));

    let peakDay: { date: string; total: number } | null = null;
    for (const pt of dailySeries) {
      const total = pt.pages + pt.clicks;
      if (total > 0 && (!peakDay || total > peakDay.total)) {
        peakDay = { date: pt.date, total };
      }
    }

    const toSortedTop = (map: Map<string, number>, limit: number): TargetCountItem[] =>
      Array.from(map.entries())
        .map(([target, count]) => ({ target, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    const topPages = toSortedTop(pageCounts, 15);
    const topClicks = toSortedTop(clickCounts, 15);

    // Elaborazione flussi "from -> to"
    const rawFlowPairs: Array<{ from: string; to: string; label: string; count: number }> = [];
    const outgoingBySource = new Map<string, number>();

    for (const [label, count] of flowCounts.entries()) {
      const sepIdx = label.indexOf(' -> ');
      if (sepIdx === -1) continue;
      const from = label.slice(0, sepIdx).trim();
      const to = label.slice(sepIdx + 4).trim();
      if (!from || !to) continue;
      rawFlowPairs.push({ from, to, label, count });
      outgoingBySource.set(from, (outgoingBySource.get(from) || 0) + count);
    }

    rawFlowPairs.sort((a, b) => b.count - a.count);

    const clickFlows: ClickFlowEdge[] = rawFlowPairs.slice(0, 30).map((edge) => {
      const sourceTotal = outgoingBySource.get(edge.from) || edge.count;
      return {
        ...edge,
        shareFromSource: Math.round((edge.count / sourceTotal) * 100),
      };
    });

    // Grafo nodi + archi principali (top 18 archi per leggibilità visiva)
    const graphEdges = clickFlows.slice(0, 18);
    const nodeMap = new Map<string, ClickFlowNode>();
    for (const edge of graphEdges) {
      if (!nodeMap.has(edge.from)) {
        nodeMap.set(edge.from, { id: edge.from, totalIn: 0, totalOut: 0 });
      }
      if (!nodeMap.has(edge.to)) {
        nodeMap.set(edge.to, { id: edge.to, totalIn: 0, totalOut: 0 });
      }
      nodeMap.get(edge.from)!.totalOut += edge.count;
      nodeMap.get(edge.to)!.totalIn += edge.count;
    }

    const nodes = Array.from(nodeMap.values()).sort(
      (a, b) => b.totalOut + b.totalIn - (a.totalOut + a.totalIn)
    );

    // Ricostruzione dei percorsi multi-step più frequenti (catene A -> B -> C -> D)
    const topPaths = buildTopMultiStepPaths(rawFlowPairs.slice(0, 40));

    return {
      configured: this.isConfigured(),
      rangeDays,
      startDate,
      endDate,
      totals: {
        pages: totalPages,
        visitors: totalVisitors,
        clicks: totalClicks,
        flows: totalFlows,
        avgPagesPerDay: Math.round((totalPages / rangeDays) * 10) / 10,
        avgVisitorsPerDay: Math.round((totalVisitors / rangeDays) * 10) / 10,
        avgClicksPerDay: Math.round((totalClicks / rangeDays) * 10) / 10,
        peakDay,
      },
      dailySeries,
      topPages,
      topClicks,
      clickFlows,
      flowGraph: {
        nodes,
        edges: graphEdges,
      },
      topPaths,
    };
  }
}

function buildTopMultiStepPaths(
  edges: Array<{ from: string; to: string; count: number }>
): MultiStepJourney[] {
  if (edges.length === 0) return [];

  const adj = new Map<string, Array<{ to: string; count: number }>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push({ to: e.to, count: e.count });
  }
  for (const list of adj.values()) {
    list.sort((a, b) => b.count - a.count);
  }

  const seenLabels = new Set<string>();
  const journeys: MultiStepJourney[] = [];

  for (const seed of edges.slice(0, 15)) {
    const steps = [seed.from, seed.to];
    let minCount = seed.count;
    let current = seed.to;

    for (let depth = 0; depth < 2; depth++) {
      const nextCandidates = (adj.get(current) || []).filter((n) => !steps.includes(n.to));
      if (nextCandidates.length === 0) break;
      const bestNext = nextCandidates[0];
      steps.push(bestNext.to);
      minCount = Math.min(minCount, bestNext.count);
      current = bestNext.to;
    }

    const label = steps.join(' → ');
    if (steps.length >= 2 && !seenLabels.has(label)) {
      seenLabels.add(label);
      journeys.push({
        steps,
        label,
        estimatedCount: minCount,
      });
    }
  }

  return journeys.sort((a, b) => b.estimatedCount - a.estimatedCount).slice(0, 10);
}

export const analyticsService = new AnalyticsService();

