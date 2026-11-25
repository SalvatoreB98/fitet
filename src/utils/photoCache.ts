/**
 * In-memory & session cache for athlete photos from FITeT.
 * Prevents redundant HTTP fetches, screen flickers, and repeated 404s.
 */

const SESSION_KEY_OK = 'fitet_photos_ok';
const SESSION_KEY_ERR = 'fitet_photos_err';
const MAX_STORED = 400;
const MAX_KEEP_ALIVE = 150;

// In-memory sets for instant synchronous status check
const loadedSet = new Set<string>();
const errorSet = new Set<string>();

// Keep-alive references to HTMLImageElement to preserve decoded memory textures in browser
const imageKeepAliveCache = new Map<string, HTMLImageElement>();

// In-flight preload promises to avoid duplicate simultaneous network requests
const inFlightPreloads = new Map<string, Promise<boolean>>();

// Normalizer: extracts athlete ID from standard FITeT photo URLs for compact storage
export function extractPhotoKey(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/images\/atleti\/([^/?#]+)/i);
  if (match) return match[1].toLowerCase();
  return trimmed;
}

// Initialize from sessionStorage on client load
if (typeof window !== 'undefined') {
  try {
    const okRaw = sessionStorage.getItem(SESSION_KEY_OK);
    if (okRaw) {
      const parsed: string[] = JSON.parse(okRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach((k) => {
          if (typeof k === 'string') loadedSet.add(k);
        });
      }
    }
    const errRaw = sessionStorage.getItem(SESSION_KEY_ERR);
    if (errRaw) {
      const parsed: string[] = JSON.parse(errRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach((k) => {
          if (typeof k === 'string') errorSet.add(k);
        });
      }
    }
  } catch {
    // sessionStorage might be restricted or throw in private browsing
  }
}

let persistTimeout: number | null = null;
function persistCacheDebounced(): void {
  if (typeof window === 'undefined') return;
  if (persistTimeout) return;
  persistTimeout = window.setTimeout(() => {
    persistTimeout = null;
    try {
      const okList = Array.from(loadedSet).slice(-MAX_STORED);
      sessionStorage.setItem(SESSION_KEY_OK, JSON.stringify(okList));
      const errList = Array.from(errorSet).slice(-MAX_STORED);
      sessionStorage.setItem(SESSION_KEY_ERR, JSON.stringify(errList));
    } catch {
      // Storage quota exceeded or disabled
    }
  }, 1000);
}

/** Check synchronously if a photo was already loaded successfully */
export function isPhotoLoaded(url?: string | null): boolean {
  const key = extractPhotoKey(url);
  if (!key) return false;
  return loadedSet.has(key);
}

/** Check synchronously if a photo is known to be missing (404/broken) */
export function isPhotoError(url?: string | null): boolean {
  const key = extractPhotoKey(url);
  if (!key) return false;
  return errorSet.has(key);
}

/** Mark photo URL as loaded and retain Image in memory cache */
export function markPhotoLoaded(url?: string | null): void {
  const key = extractPhotoKey(url);
  if (!key) return;
  loadedSet.add(key);
  errorSet.delete(key);

  if (typeof window !== 'undefined' && url) {
    if (!imageKeepAliveCache.has(key)) {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      imageKeepAliveCache.set(key, img);

      if (imageKeepAliveCache.size > MAX_KEEP_ALIVE) {
        const firstKey = imageKeepAliveCache.keys().next().value;
        if (firstKey) imageKeepAliveCache.delete(firstKey);
      }
    }
  }

  persistCacheDebounced();
}

/** Mark photo URL as failed/not found */
export function markPhotoError(url?: string | null): void {
  const key = extractPhotoKey(url);
  if (!key) return;
  errorSet.add(key);
  loadedSet.delete(key);
  imageKeepAliveCache.delete(key);
  persistCacheDebounced();
}

/** Preload photo via browser Image constructor */
export function preloadPhoto(url?: string | null): Promise<boolean> {
  const key = extractPhotoKey(url);
  if (!key || !url) return Promise.resolve(false);

  if (loadedSet.has(key)) return Promise.resolve(true);
  if (errorSet.has(key)) return Promise.resolve(false);

  const existing = inFlightPreloads.get(key);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      markPhotoLoaded(url);
      inFlightPreloads.delete(key);
      resolve(true);
    };
    img.onerror = () => {
      markPhotoError(url);
      inFlightPreloads.delete(key);
      resolve(false);
    };
    img.src = url;
  });

  inFlightPreloads.set(key, promise);
  return promise;
}

/** Resolve canonical FITeT photo URL for an athlete ID */
export function getAthletePhotoUrl(
  idOrObj?: string | number | { id?: string | number; fotoUrl?: string } | null
): string | null {
  if (!idOrObj) return null;
  if (typeof idOrObj === 'object') {
    if (idOrObj.fotoUrl) return idOrObj.fotoUrl;
    if (idOrObj.id) {
      const sId = String(idOrObj.id).trim();
      if (/^\d+$/.test(sId)) {
        return `https://portale.fitet.org/images/atleti/${sId}.jpg`;
      }
    }
    return null;
  }
  const s = String(idOrObj).trim();
  if (/^\d+$/.test(s)) {
    return `https://portale.fitet.org/images/atleti/${s}.jpg`;
  }
  return null;
}
