import fs from 'fs';
import path from 'path';
import { getRuntimeCacheDir } from './runtimeCacheDir';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export interface CacheOptions {
  /** If true, the data will only be written/read from disk and not stored in V8 heap memory */
  skipMemory?: boolean;
}

export class CacheService {
  private cacheDir: string;
  private legacyCacheDir: string;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
  private maxMemoryEntries: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(maxMemoryEntries = 200) {
    this.maxMemoryEntries = Number(process.env.CACHE_MAX_MEMORY_ENTRIES) || maxMemoryEntries;
    this.cacheDir = getRuntimeCacheDir();
    this.legacyCacheDir = path.resolve(process.cwd(), 'server', 'cache');

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Cache directory initialization fallback to memory-only:', err);
    }

    // Timer periodico per epurare voci scadute ed evitare accumulo silenzioso di RAM
    this.cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, 10 * 60 * 1000); // ogni 10 minuti

    // Consente a Node di terminare normalmente senza restare bloccato dal timer
    if (this.cleanupTimer?.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Elimina le voci scadute sia dalla memoria RAM che dalla cartella cache temporanea.
   */
  public purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp >= entry.ttlMs) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Assicura che la dimensione della cache in memoria rispetti la capienza massima (LRU).
   */
  private enforceMemoryLimit(): void {
    while (this.memoryCache.size > this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.memoryCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Retrieves an item from memory or disk if not expired.
   */
  get<T>(key: string, options?: CacheOptions): T | null {
    const now = Date.now();

    // Check memory cache first (se non esplicitamente bypassato)
    if (!options?.skipMemory) {
      const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
      if (memEntry) {
        if (now - memEntry.timestamp < memEntry.ttlMs) {
          // LRU refresh: sposta la voce in cima (eliminando e reinserendo)
          this.memoryCache.delete(key);
          this.memoryCache.set(key, memEntry);
          return memEntry.data;
        }
        this.memoryCache.delete(key);
      }
    }

    // Check primary disk cache (node_modules/.cache/fitet_cache)
    let filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (!fs.existsSync(filePath)) {
      // Fallback check to legacy directory (server/cache)
      const legacyPath = path.join(this.legacyCacheDir, `${encodeURIComponent(key)}.json`);
      if (fs.existsSync(legacyPath)) {
        filePath = legacyPath;
      }
    }

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const fileEntry: CacheEntry<T> = JSON.parse(fileContent);
        if (now - fileEntry.timestamp < fileEntry.ttlMs) {
          // Re-populate memory cache solo se consentito
          if (!options?.skipMemory) {
            this.memoryCache.set(key, fileEntry);
            this.enforceMemoryLimit();
          }
          return fileEntry.data;
        } else {
          // File scaduto: pulizia preventiva su disco
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      } catch (err) {
        console.warn(`Error reading disk cache for key ${key}:`, err);
      }
    }

    return null;
  }

  /**
   * Stores an item with a given TTL in milliseconds in disk and conditionally in memory.
   */
  set<T>(key: string, data: T, ttlMs: number, options?: CacheOptions): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    };

    if (!options?.skipMemory) {
      // LRU update
      this.memoryCache.delete(key);
      this.memoryCache.set(key, entry);
      this.enforceMemoryLimit();
    }

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
    const legacyPath = path.join(this.legacyCacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.unlinkSync(legacyPath);
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
