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
}

export const trafficSourceService = new TrafficSourceService();
