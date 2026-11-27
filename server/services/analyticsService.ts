import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { trafficSourceService, type TrafficSourcesSummary } from './trafficSourceService';

dotenv.config();

export type AnalyticsMetricType = 'page' | 'visitor' | 'click' | 'flow';
export type AnalyticsDimensionType = 'country' | 'device' | 'os' | 'browser' | 'mode';

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

export type HourlyMetricKey = 'pages' | 'visitors' | 'clicks';

/**
 * Aggregazione giorno/ora (fuso Europe/Rome) per capire quando gli utenti
 * visitano il portale e quando aprono più pagine.
 * `heatmap` ha 168 valori: indice = giornoSettimana (0 = lunedì) * 24 + ora.
 */
export interface HourlySchedule {
  available: boolean;
  tableMissing: boolean;
  timezone: string;
  days: number;
  /** Quante volte ogni giorno della settimana (0 = lunedì) compare nel periodo. */
  weekdayDayCounts: number[];
  heatmap: Record<HourlyMetricKey, number[]>;
  byHour: Record<HourlyMetricKey, number[]>;
  byWeekday: Record<HourlyMetricKey, number[]>;
}

/**
 * Dimensioni aggregate di un visitatore, calcolate lato server.
 * `mode` distingue l'uso come PWA installata dall'uso nel browser.
 */
export interface VisitorDimensions {
  country?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
  mode?: 'PWA' | 'Browser' | string | null;
}

export interface AnalyticsDimensions {
  countries: TargetCountItem[];
  devices: TargetCountItem[];
  operatingSystems: TargetCountItem[];
  browsers: TargetCountItem[];
  modes: TargetCountItem[];
  /** Visitatori del periodo per cui è disponibile almeno una dimensione (denominatore delle percentuali). */
  trackedVisitors: number;
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
  dimensions: AnalyticsDimensions;
  clickFlows: ClickFlowEdge[];
  flowGraph: {
    nodes: ClickFlowNode[];
    edges: ClickFlowEdge[];
  };
  topPaths: MultiStepJourney[];
  trafficSources: TrafficSourcesSummary;
  hourlySchedule: HourlySchedule;
}

interface DailyAnalyticsRow {
  date: string;
  type: string;
  target: string;
  count: number;
}

interface HourlyAnalyticsRow {
  date: string;
  hour: number;
  pages: number;
  visitors: number;
  clicks: number;
}

const HOURLY_METRIC_KEYS = ['pages', 'visitors', 'clicks'] as const;

const MAX_TYPE_LEN = 32;
const MAX_TARGET_LEN = 200;
const ANALYTICS_START_DATE = '2026-11-04';
const BASELINE_VISITORS_BY_DATE: Record<string, number> = {
  '2026-11-04': 49,
  '2026-11-05': 75,
  '2026-11-06': 64,
  '2026-11-07': 101,
  '2026-11-08': 192,
  '2026-11-09': 165,
  '2026-11-10': 95,
};
const BASELINE_PAGES_BY_DATE: Record<string, number> = {
  '2026-11-04': 148,
  '2026-11-05': 365,
  '2026-11-06': 248,
  '2026-11-07': 419,
  '2026-11-08': 835,
  '2026-11-09': 750,
  '2026-11-10': 353,
};
const BASELINE_NOV11_PAGES_OFFSET = 154;

function getUtcDateString(offsetDays = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Data e ora locali Europe/Rome, usate per collocare gli eventi nella fascia oraria
 * corretta indipendentemente dal fuso del server (Railway gira in UTC).
 */
function getRomeDateHour(now = new Date()): { date: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = Math.min(23, Math.max(0, parseInt(get('hour'), 10) || 0));
    if (!year || !month || !day) throw new Error('data non valida');
    return { date: `${year}-${month}-${day}`, hour };
  } catch {
    return { date: getUtcDateString(0), hour: now.getUTCHours() };
  }
}

/** Indice giorno settimana con lunedì = 0 (coerente con l'heatmap). */
function weekdayIndexFromIso(dateStr: string): number {
  const iso = String(dateStr || '').slice(0, 10);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  return (d.getUTCDay() + 6) % 7;
}

function enumerateUtcDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
    return [endDate];
  }
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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
  private memoryHourly = new Map<string, HourlyAnalyticsRow>();
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
      // Limite di sicurezza sulla mappa in-memory per prevenire memory leak in locale
      if (this.memoryFallback.size >= 500) {
        const oldest = this.memoryFallback.keys().next().value;
        if (oldest !== undefined) this.memoryFallback.delete(oldest);
      }
      this.memoryFallback.set(key, { date, type, target, count: 1 });
    }
  }

  /** Fallback locale dell'aggregazione oraria (solo senza credenziali Supabase). */
  private incrementMemoryHourly(kind: 'page' | 'visitor' | 'click'): void {
    const { date, hour } = getRomeDateHour();
    const key = `${date}|${hour}`;
    let row = this.memoryHourly.get(key);
    if (!row) {
      row = { date, hour, pages: 0, visitors: 0, clicks: 0 };
      this.memoryHourly.set(key, row);
    }
    if (kind === 'page') row.pages += 1;
    else if (kind === 'visitor') row.visitors += 1;
    else row.clicks += 1;

    // Pulizia occasionale delle righe più vecchie per non far crescere la mappa.
    if (this.memoryHourly.size > 5000) {
      const cutoff = getUtcDateString(-60);
      for (const [k, value] of this.memoryHourly) {
        if (value.date < cutoff) this.memoryHourly.delete(k);
      }
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
      if (cleanType === 'page' || cleanType === 'click') {
        this.incrementMemoryHourly(cleanType);
      }
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

    // Pulizia chiavi dei giorni precedenti in memoria o cap massimo
    if (this.memoryVisitors.size >= 5000) {
      this.memoryVisitors.clear();
    } else {
      for (const k of this.memoryVisitors) {
        if (!k.startsWith(`${today}|`)) this.memoryVisitors.delete(k);
      }
    }

    if (!this.supabase) {
      this.memoryVisitors.add(dedupKey);
      this.incrementMemoryFallback('visitor', 'unique');
      this.incrementMemoryHourly('visitor');
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
   * Registra le dimensioni del visitatore (paese, dispositivo, OS, browser, modalità PWA)
   * tramite RPC Postgres `track_visitor_dimensions`.
   *
   * La RPC conta le dimensioni una sola volta per visitatore/giorno, così i totali
   * restano coerenti con il KPI dei visitatori unici. Se la migrazione SQL non è
   * ancora stata applicata la chiamata fallisce in modo silenzioso (best effort).
   */
  async trackVisitorDimensions(visitorHash: string, dimensions: VisitorDimensions): Promise<void> {
    const cleanHash = sanitizeMetricValue(visitorHash, 64);
    if (!cleanHash) return;

    const clean = {
      country: sanitizeMetricValue(dimensions.country ?? '', 32),
      device: sanitizeMetricValue(dimensions.device ?? '', 32),
      os: sanitizeMetricValue(dimensions.os ?? '', 32),
      browser: sanitizeMetricValue(dimensions.browser ?? '', 32),
      mode: sanitizeMetricValue(dimensions.mode ?? '', 32),
    };

    if (!clean.country && !clean.device && !clean.os && !clean.browser && !clean.mode) {
      return;
    }

    if (!this.supabase) {
      if (clean.country) this.incrementMemoryFallback('country', clean.country);
      if (clean.device) this.incrementMemoryFallback('device', clean.device);
      if (clean.os) this.incrementMemoryFallback('os', clean.os);
      if (clean.browser) this.incrementMemoryFallback('browser', clean.browser);
      if (clean.mode) this.incrementMemoryFallback('mode', clean.mode);
      return;
    }

    try {
      const { error } = await this.supabase.rpc('track_visitor_dimensions', {
        p_visitor_hash: cleanHash,
        p_country: clean.country || null,
        p_device: clean.device || null,
        p_os: clean.os || null,
        p_browser: clean.browser || null,
        p_mode: clean.mode || null,
      });

      if (error) {
        // PGRST202 / 42883 = funzione inesistente: migrazione supabase/analytics_dimensions.sql non applicata
        if (
          error.code === '42883' ||
          error.code === 'PGRST202' ||
          /does not exist|schema cache|find the function/i.test(error.message)
        ) {
          console.warn(
            '[AnalyticsService] RPC track_visitor_dimensions non disponibile: esegui supabase/analytics_dimensions.sql per abilitare paese/dispositivo/OS/browser/PWA.'
          );
        } else {
          console.warn('[AnalyticsService] Errore RPC track_visitor_dimensions:', error.message);
        }
      }
    } catch (err: any) {
      console.warn('[AnalyticsService] Eccezione RPC track_visitor_dimensions:', err?.message || err);
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
   * Legge tutte le righe dell'intervallo paginando le risposte di Supabase.
   * Senza paginazione PostgREST restituisce al massimo 1000 righe per richiesta,
   * troncando i giorni più recenti dell'intervallo.
   */
  private async fetchAllDailyRows(
    startDate: string,
    endDate: string
  ): Promise<DailyAnalyticsRow[]> {
    if (!this.supabase) return [];

    const pageSize = 1000;
    const maxPages = 200;
    const allRows: DailyAnalyticsRow[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize;
      const { data, error } = await this.supabase
        .from('daily_analytics')
        .select('date, type, target, count')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('type', { ascending: true })
        .order('target', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Lettura daily_analytics fallita: ${error.message}`);
      }

      const batch = (data || []) as DailyAnalyticsRow[];
      allRows.push(...batch);

      if (batch.length < pageSize) break;
    }

    return allRows;
  }

  /**
   * Legge le righe dell'aggregazione oraria. Se la migrazione
   * `supabase/hourly_analytics.sql` non è ancora stata applicata la tabella
   * manca: in quel caso non blocchiamo la dashboard ma segnaliamo `tableMissing`.
   */
  private async fetchAllHourlyRows(
    startDate: string,
    endDate: string
  ): Promise<{ rows: HourlyAnalyticsRow[]; tableMissing: boolean }> {
    if (!this.supabase) return { rows: [], tableMissing: false };

    const pageSize = 1000;
    const maxPages = 200;
    const allRows: HourlyAnalyticsRow[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize;
      const { data, error } = await this.supabase
        .from('hourly_analytics')
        .select('date, hour, pages, visitors, clicks')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('hour', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          /could not find the table|does not exist|schema cache/i.test(error.message)
        ) {
          return { rows: allRows, tableMissing: true };
        }
        throw new Error(`Lettura hourly_analytics fallita: ${error.message}`);
      }

      const batch = (data || []) as unknown as HourlyAnalyticsRow[];
      allRows.push(...batch);

      if (batch.length < pageSize) break;
    }

    return { rows: allRows, tableMissing: false };
  }

  /** Costruisce le matrici giorno × ora usate dalla heatmap della dashboard. */
  private buildHourlySchedule(
    rows: HourlyAnalyticsRow[],
    startDate: string,
    endDate: string,
    tableMissing: boolean
  ): HourlySchedule {
    const dates = enumerateUtcDates(startDate, endDate);
    const weekdayDayCounts = new Array<number>(7).fill(0);
    for (const dateStr of dates) {
      weekdayDayCounts[weekdayIndexFromIso(dateStr)] += 1;
    }

    const heatmap: Record<HourlyMetricKey, number[]> = {
      pages: new Array<number>(168).fill(0),
      visitors: new Array<number>(168).fill(0),
      clicks: new Array<number>(168).fill(0),
    };
    const byHour: Record<HourlyMetricKey, number[]> = {
      pages: new Array<number>(24).fill(0),
      visitors: new Array<number>(24).fill(0),
      clicks: new Array<number>(24).fill(0),
    };
    const byWeekday: Record<HourlyMetricKey, number[]> = {
      pages: new Array<number>(7).fill(0),
      visitors: new Array<number>(7).fill(0),
      clicks: new Array<number>(7).fill(0),
    };

    for (const row of rows) {
      const hour = Math.min(23, Math.max(0, Math.trunc(Number(row.hour) || 0)));
      const weekday = weekdayIndexFromIso(row.date);
      const heatmapIndex = weekday * 24 + hour;

      for (const key of HOURLY_METRIC_KEYS) {
        const value = Math.max(0, Math.trunc(Number(row[key]) || 0));
        if (value === 0) continue;
        heatmap[key][heatmapIndex] += value;
        byHour[key][hour] += value;
        byWeekday[key][weekday] += value;
      }
    }

    return {
      available: rows.length > 0,
      tableMissing,
      timezone: 'Europe/Rome',
      days: dates.length,
      weekdayDayCounts,
      heatmap,
      byHour,
      byWeekday,
    };
  }

  /**
   * Restituisce i dati aggregati degli ultimi N giorni (default 30, supporta 7 o 30)
   * inclusi grafici giornalieri, top pagine, top click e flusso di navigazione utenti.
   */
  async getAnalytics(requestedDays = 30): Promise<AnalyticsSummary> {
    const rangeDays = requestedDays <= 7 ? 7 : 30;
    const endDate = getUtcDateString(0);
    const romeToday = getRomeDateHour().date;
    const hourlyEndDate = romeToday > endDate ? romeToday : endDate;
    const rawStartDate = getUtcDateString(-(rangeDays - 1));
    const clampedStartDate = rawStartDate < ANALYTICS_START_DATE ? ANALYTICS_START_DATE : rawStartDate;
    const startDate = clampedStartDate > endDate ? endDate : clampedStartDate;

    let rows: DailyAnalyticsRow[] = [];
    let hourlyRows: HourlyAnalyticsRow[] = [];
    let hourlyTableMissing = false;
    const trafficSourcesPromise = trafficSourceService.getTrafficSources(startDate, endDate);

    if (this.supabase) {
      // Supabase/PostgREST tronca ogni risposta a `db-max-rows` (default 1000).
      // Con una singola select senza range i giorni più recenti (in coda all'ordinamento)
      // sparivano silenziosamente: la dashboard mostrava 0 click sull'ultimo giorno.
      // Paginiamo quindi l'intero intervallo con un ordinamento stabile (PK date+type+target).
      // L'aggregazione oraria è opzionale: se la migrazione non è applicata la
      // dashboard continua a funzionare e mostra un avviso dedicato.
      const [dailyRows, hourlyResult] = await Promise.all([
        this.fetchAllDailyRows(startDate, endDate),
        this.fetchAllHourlyRows(startDate, hourlyEndDate).catch((err: any) => {
          console.warn('[AnalyticsService] Aggregazione oraria non disponibile:', err?.message || err);
          return { rows: [] as HourlyAnalyticsRow[], tableMissing: true };
        }),
      ]);
      rows = dailyRows;
      hourlyRows = hourlyResult.rows;
      hourlyTableMissing = hourlyResult.tableMissing;
    } else {
      rows = Array.from(this.memoryFallback.values()).filter(
        (r) => r.date >= startDate && r.date <= endDate
      );
      hourlyRows = Array.from(this.memoryHourly.values()).filter(
        (r) => r.date >= startDate && r.date <= hourlyEndDate
      );
    }

    const trafficSources = await trafficSourcesPromise;

    // Costruisci tutti i giorni dell'intervallo dal startDate (min 4 novembre) fino a oggi
    const dailyMap = new Map<string, { pages: number; visitors: number; clicks: number }>();
    for (const dateStr of enumerateUtcDates(startDate, endDate)) {
      dailyMap.set(dateStr, { pages: 0, visitors: 0, clicks: 0 });
    }

    const pageCounts = new Map<string, number>();
    const clickCounts = new Map<string, number>();
    const flowCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();
    const osCounts = new Map<string, number>();
    const browserCounts = new Map<string, number>();
    const modeCounts = new Map<string, number>();

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
      } else if (row.type === 'country') {
        countryCounts.set(row.target, (countryCounts.get(row.target) || 0) + count);
      } else if (row.type === 'device') {
        deviceCounts.set(row.target, (deviceCounts.get(row.target) || 0) + count);
      } else if (row.type === 'os') {
        osCounts.set(row.target, (osCounts.get(row.target) || 0) + count);
      } else if (row.type === 'browser') {
        browserCounts.set(row.target, (browserCounts.get(row.target) || 0) + count);
      } else if (row.type === 'mode') {
        modeCounts.set(row.target, (modeCounts.get(row.target) || 0) + count);
      }
    }

    // Applica i dati storici di partenza (4-10 novembre) se il DB non li contiene ancora
    for (const [dateStr, dayBucket] of dailyMap.entries()) {
      const baselineVisitors = BASELINE_VISITORS_BY_DATE[dateStr];
      if (baselineVisitors !== undefined && dayBucket.visitors < baselineVisitors) {
        totalVisitors += baselineVisitors - dayBucket.visitors;
        dayBucket.visitors = baselineVisitors;
      }

      const baselinePages = BASELINE_PAGES_BY_DATE[dateStr];
      if (baselinePages !== undefined && dayBucket.pages < baselinePages) {
        totalPages += baselinePages - dayBucket.pages;
        dayBucket.pages = baselinePages;
      } else if (dateStr === '2026-11-11') {
        dayBucket.pages += BASELINE_NOV11_PAGES_OFFSET;
        totalPages += BASELINE_NOV11_PAGES_OFFSET;
      }
    }

    const dailySeries: DailySeriesPoint[] = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      pages: val.pages,
      visitors: val.visitors,
      clicks: val.clicks,
    }));

    const actualDays = Math.max(dailySeries.length, 1);

    let peakDay: { date: string; total: number } | null = null;
    for (const pt of dailySeries) {
      const total = pt.visitors + pt.pages + pt.clicks;
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

    // Dimensioni visitatori: oltre le 15 voci sommo il resto in "Altro" per non perdere il totale
    const toDimensionItems = (map: Map<string, number>, limit = 15): TargetCountItem[] => {
      const sorted = Array.from(map.entries())
        .map(([target, count]) => ({ target, count }))
        .sort((a, b) => b.count - a.count);
      if (sorted.length <= limit) return sorted;
      const head = sorted.slice(0, limit - 1);
      const rest = sorted.slice(limit - 1).reduce((sum, item) => sum + item.count, 0);
      return [...head, { target: 'Altro', count: rest }];
    };

    const dimensions: AnalyticsDimensions = {
      countries: toDimensionItems(countryCounts, 20),
      devices: toDimensionItems(deviceCounts),
      operatingSystems: toDimensionItems(osCounts),
      browsers: toDimensionItems(browserCounts),
      modes: toDimensionItems(modeCounts),
      trackedVisitors: Array.from(modeCounts.values()).reduce((sum, value) => sum + value, 0),
    };

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
      rangeDays: actualDays,
      startDate,
      endDate,
      totals: {
        pages: totalPages,
        visitors: totalVisitors,
        clicks: totalClicks,
        flows: totalFlows,
        avgPagesPerDay: Math.round((totalPages / actualDays) * 10) / 10,
        avgVisitorsPerDay: Math.round((totalVisitors / actualDays) * 10) / 10,
        avgClicksPerDay: Math.round((totalClicks / actualDays) * 10) / 10,
        peakDay,
      },
      dailySeries,
      topPages,
      topClicks,
      dimensions,
      clickFlows,
      flowGraph: {
        nodes,
        edges: graphEdges,
      },
      topPaths,
      trafficSources,
      hourlySchedule: this.buildHourlySchedule(
        hourlyRows,
        startDate,
        hourlyEndDate,
        hourlyTableMissing
      ),
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

