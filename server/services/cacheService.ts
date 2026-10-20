import fs from 'fs';
import path from 'path';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export class CacheService {
  private cacheDir: string;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

  constructor() {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    this.cacheDir = isServerless
      ? path.join('/tmp', 'fitet_cache')
      : path.resolve(process.cwd(), 'server', 'cache');

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Cache directory initialization fallback to memory-only:', err);
    }
  }

  /**
   * Retrieves an item from memory or disk if not expired.
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // Check memory cache first
    const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (now - memEntry.timestamp < memEntry.ttlMs) {
        return memEntry.data;
      }
      this.memoryCache.delete(key);
    }

    // Check disk cache
    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const fileEntry: CacheEntry<T> = JSON.parse(fileContent);
        if (now - fileEntry.timestamp < fileEntry.ttlMs) {
          // Re-populate memory cache
          this.memoryCache.set(key, fileEntry);
          return fileEntry.data;
        }
      } catch (err) {
        console.warn(`Error reading disk cache for key ${key}:`, err);
      }
    }

    return null;
  }

  /**
   * Stores an item with a given TTL in milliseconds in both memory and disk.
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    };

    this.memoryCache.set(key, entry);

    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
    } catch (err) {
      console.warn(`Error saving disk cache for key ${key}:`, err);
    }
  }

  /**
   * Deletes a cache key or clears all cache
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  clear(): void {
    this.memoryCache.clear();
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(this.cacheDir, file));
          } catch {}
        }
      }
    }
  }
}

export const cacheService = new CacheService();
