import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export type TrafficDeviceType = 'mobile' | 'desktop';

export interface TrafficSourceRecord {
  source: string;
  utmMedium?: string | null;
  referrer?: string | null;
  landingPath: string;
  deviceType: TrafficDeviceType;
}

export interface TrafficSourcesSummary {
  total: number;
  sources: Array<{ target: string; count: number }>;
  mediums: Array<{ target: string; count: number }>;
  referrers: Array<{ target: string; count: number }>;
  landingPaths: Array<{ target: string; count: number }>;
  devices: Array<{ target: string; count: number }>;
}

const MAX_SOURCE_LEN = 100;
const MAX_MEDIUM_LEN = 64;
const MAX_REFERRER_LEN = 300;
const MAX_PATH_LEN = 200;

export function detectDeviceType(userAgent: string): TrafficDeviceType {
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent || '')
    ? 'mobile'
    : 'desktop';
}

export function sanitizeSource(raw: unknown): string {
  if (typeof raw !== 'string') return 'direct';
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, MAX_SOURCE_LEN);
  return clean || 'direct';
}

export function sanitizeUtmMedium(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, MAX_MEDIUM_LEN);
  return clean || null;
}

export function sanitizeReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const clean = `${parsed.origin}${parsed.pathname}`.slice(0, MAX_REFERRER_LEN);
    return clean;
  } catch {
    return trimmed.slice(0, MAX_REFERRER_LEN);
  }
}

export function sanitizeLandingPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed) return '/';
  const pathOnly = trimmed.split('?')[0].split('#')[0] || '/';
  const normalized = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return normalized.slice(0, MAX_PATH_LEN) || '/';
}

class TrafficSourceService {
  private client: SupabaseClient | null = null;
  private dailyAggregation = new Map<string, number>();

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  private logStructured(date: string, entry: TrafficSourceRecord): void {
    const aggKey = `${date}:${entry.source}:${entry.deviceType}`;
    const count = (this.dailyAggregation.get(aggKey) || 0) + 1;
    this.dailyAggregation.set(aggKey, count);

    console.log(
      JSON.stringify({
        event: 'traffic_source',
        date,
        source: entry.source,
        utmMedium: entry.utmMedium || null,
        landingPath: entry.landingPath,
        deviceType: entry.deviceType,
        dailyCount: count,
      })
    );
  }

  async recordTrafficSource(entry: TrafficSourceRecord): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    if (!this.client) {
      this.logStructured(today, entry);
      return;
    }

    try {
      const { error } = await this.client.from('traffic_sources').insert({
        date: today,
        source: entry.source,
        utm_medium: entry.utmMedium || null,
        referrer: entry.referrer || null,
        landing_path: entry.landingPath,
        device_type: entry.deviceType,
      });

      if (error) {
        console.warn('[TrafficSourceService] Errore inserimento Supabase, fallback su log:', error.message);
        this.logStructured(today, entry);
      }
    } catch (err: any) {
      console.warn('[TrafficSourceService] Eccezione Supabase, fallback su log:', err?.message || err);
      this.logStructured(today, entry);
    }
  }

  async getTrafficSources(startDate: string, endDate: string): Promise<TrafficSourcesSummary> {
    if (!this.client) {
      return {
        total: 0,
        sources: [],
        mediums: [],
        referrers: [],
        landingPaths: [],
        devices: [],
      };
    }

    try {
      const pageSize = 1000;
      const maxPages = 50;
      const allRows: Array<{
        source: string;
        utm_medium: string | null;
        referrer: string | null;
        landing_path: string;
        device_type: string;
        date: string;
      }> = [];

      for (let page = 0; page < maxPages; page++) {
        const from = page * pageSize;
        const { data, error } = await this.client
          .from('traffic_sources')
          .select('source, utm_medium, referrer, landing_path, device_type, date')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.warn('[TrafficSourceService] Errore lettura traffic_sources:', error.message);
          break;
        }

        const batch = (data || []) as typeof allRows;
        allRows.push(...batch);
        if (batch.length < pageSize) break;
      }

      const sourceMap = new Map<string, number>();
      const mediumMap = new Map<string, number>();
      const referrerMap = new Map<string, number>();
      const landingMap = new Map<string, number>();
      const deviceMap = new Map<string, number>();

      for (const row of allRows) {
        const s = (row.source || 'direct').trim().toLowerCase();
        sourceMap.set(s, (sourceMap.get(s) || 0) + 1);

        let m = (row.utm_medium || '').trim().toLowerCase();
        if (!m) {
          if (s === 'direct') m = 'direct';
          else if (['google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'yandex'].includes(s)) m = 'organic';
          else if (['facebook', 'instagram', 'twitter', 't.co', 'linkedin', 'tiktok', 'youtube'].includes(s)) m = 'social';
          else if (['whatsapp', 'telegram'].includes(s)) m = 'messaging';
          else m = 'referral';
        }
        mediumMap.set(m, (mediumMap.get(m) || 0) + 1);

        const ref = (row.referrer || '').trim();
        const refLabel = ref || '(diretto / nessuno)';
        referrerMap.set(refLabel, (referrerMap.get(refLabel) || 0) + 1);

        const lp = (row.landing_path || '/').trim();
        landingMap.set(lp, (landingMap.get(lp) || 0) + 1);

        const dev = (row.device_type || 'desktop').trim().toLowerCase();
        deviceMap.set(dev, (deviceMap.get(dev) || 0) + 1);
      }

      const toSorted = (map: Map<string, number>, limit = 20) =>
        Array.from(map.entries())
          .map(([target, count]) => ({ target, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);

      return {
        total: allRows.length,
        sources: toSorted(sourceMap),
        mediums: toSorted(mediumMap),
        referrers: toSorted(referrerMap),
        landingPaths: toSorted(landingMap),
        devices: toSorted(deviceMap),
      };
    } catch (err: any) {
      console.warn('[TrafficSourceService] Eccezione lettura traffic_sources:', err?.message || err);
      return {
        total: 0,
        sources: [],
        mediums: [],
        referrers: [],
        landingPaths: [],
        devices: [],
      };
    }
  }
}

export const trafficSourceService = new TrafficSourceService();
