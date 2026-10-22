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

  getViews(key: string): number {
    if (!key) return 0;
    return this.viewsMap[key.toLowerCase().trim()] || 0;
  }

  incrementViews(key: string): number {
    if (!key) return 0;
    const clean = key.toLowerCase().trim();
    const current = this.viewsMap[clean] || 0;
    const next = current + 1;
    this.viewsMap[clean] = next;
    this.save();
    return next;
  }
}

export const viewsService = new ViewsService();
