import fs from 'fs';
import path from 'path';

class ViewsService {
  private filePath: string;
  private viewsMap: Record<string, number> = {};

  constructor() {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const dir = isServerless ? path.join('/tmp', 'fitet_cache') : path.resolve(process.cwd(), 'server', 'cache');
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn('Views directory init fallback to memory-only:', err);
    }
    this.filePath = path.join(dir, 'athlete_views.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.viewsMap = JSON.parse(raw);
      }
    } catch {
      this.viewsMap = {};
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.viewsMap, null, 2), 'utf8');
    } catch (err) {
      console.warn('Error saving athlete views:', err);
    }
  }

  private getKvConfig() {
    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (kvUrl && kvToken) {
      return { url: kvUrl, token: kvToken };
    }
    return null;
  }

  async getViews(key: string): Promise<number> {
    if (!key) return 0;
    const clean = key.toLowerCase().trim();

    // 1. Prova Vercel KV / Upstash Redis se configurato
    const kv = this.getKvConfig();
    if (kv) {
      try {
        const res = await fetch(`${kv.url}/get/athlete_views:${encodeURIComponent(clean)}`, {
          headers: { Authorization: `Bearer ${kv.token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data && data.result !== null && data.result !== undefined) {
            return parseInt(data.result, 10) || 0;
          }
          return 0;
        }
      } catch (err) {
        console.warn('Vercel KV get error, fallback to local:', err);
      }
    }

    // 2. Fallback su memoria / cache locale
    return this.viewsMap[clean] || 0;
  }

  async incrementViews(key: string): Promise<number> {
    if (!key) return 0;
    const clean = key.toLowerCase().trim();

    // 1. Prova Vercel KV / Upstash Redis se configurato (atomico e globale su tutte le lambda)
    const kv = this.getKvConfig();
    if (kv) {
      try {
        const res = await fetch(`${kv.url}/incr/athlete_views:${encodeURIComponent(clean)}`, {
          headers: { Authorization: `Bearer ${kv.token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data && typeof data.result === 'number') {
            return data.result;
          }
        }
      } catch (err) {
        console.warn('Vercel KV incr error, fallback to local:', err);
      }
    }

    // 2. Fallback su memoria / cache locale
    const current = this.viewsMap[clean] || 0;
    const next = current + 1;
    this.viewsMap[clean] = next;
    this.save();
    return next;
  }
}

export const viewsService = new ViewsService();
