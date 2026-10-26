/**
 * Venue Offline Cache (Weak Venue Connection System)
 * Progettato per consentire la piena consultazione di campionati, classifiche,
 * calendari, schede atleti e referti anche all'interno di palestre e palazzetti
 * con segnale cellulare debole, intermittente o assente (Edge / 3G / No Service).
 */

const CACHE_PREFIX = 'fitet_venue_cache_';
const CACHE_META_KEY = 'fitet_venue_cache_manifest';

export interface VenueCacheEntry<T> {
  data: T;
  cachedAt: string; // ISO string
  cachedTimeFormatted: string;
  label?: string;
  type: 'dashboard' | 'atleta' | 'referto' | 'squadra' | 'campionati' | 'ranking';
}

interface CacheManifestItem {
  key: string;
  type: string;
  label?: string;
  cachedAt: string;
}

const formatDateTime = (date: Date): string => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${min} del ${d}/${m}`;
};

function getManifest(): Record<string, CacheManifestItem> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveManifest(manifest: Record<string, CacheManifestItem>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(manifest));
  } catch (e) {
    console.warn('[VenueCache] Impossibile salvare manifest cache:', e);
  }
}

/**
 * Salva i dati in cache locale per consultazione offline in palestra
 */
export function saveVenueCache<T>(
  key: string,
  data: T,
  type: VenueCacheEntry<T>['type'],
  label?: string
): void {
  if (typeof window === 'undefined' || !data) return;

  const now = new Date();
  const entry: VenueCacheEntry<T> = {
    data,
    cachedAt: now.toISOString(),
    cachedTimeFormatted: formatDateTime(now),
    label,
    type,
  };

  const storageKey = `${CACHE_PREFIX}${key}`;

  try {
    localStorage.setItem(storageKey, JSON.stringify(entry));

    // Aggiorna manifest
    const manifest = getManifest();
    manifest[key] = {
      key,
      type,
      label,
      cachedAt: entry.cachedAt,
    };
    saveManifest(manifest);

    // Emetti evento per notificare i listener
    window.dispatchEvent(new CustomEvent('fitet-venue-cache-updated', { detail: { key, type } }));
  } catch (err: any) {
    // Gestione quota storage superata: rimuovi le voci più vecchie e riprova
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      evictOldCacheEntries();
      try {
        localStorage.setItem(storageKey, JSON.stringify(entry));
      } catch {
        console.warn('[VenueCache] Storage pieno anche dopo pulizia.');
      }
    }
  }
}

/**
 * Recupera i dati salvati per una chiave
 */
export function getVenueCache<T>(key: string): VenueCacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  const storageKey = `${CACHE_PREFIX}${key}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as VenueCacheEntry<T>;
  } catch (err) {
    console.warn(`[VenueCache] Errore lettura cache per "${key}":`, err);
    return null;
  }
}

/**
 * Verifica se una chiave è presente in cache
 */
export function hasVenueCache(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${CACHE_PREFIX}${key}`) !== null;
}

/**
 * Rimuove le voci più vecchie in caso di quota piena
 */
function evictOldCacheEntries(): void {
  try {
    const manifest = getManifest();
    const items = Object.values(manifest).sort(
      (a, b) => new Date(a.cachedAt).getTime() - new Date(b.cachedAt).getTime()
    );

    // Elimina il 25% delle voci più vecchie (escludendo se possibile i campionati)
    const toRemove = items.slice(0, Math.max(1, Math.floor(items.length * 0.25)));
    for (const item of toRemove) {
      localStorage.removeItem(`${CACHE_PREFIX}${item.key}`);
      delete manifest[item.key];
    }
    saveManifest(manifest);
  } catch (e) {
    console.warn('[VenueCache] Errore durante evict:', e);
  }
}

/**
 * Restituisce un riassunto dei dati salvati in locale per la palestra
 */
export function getVenueCacheSummary(): {
  totalItems: number;
  championshipsCount: number;
  athletesCount: number;
  matchesCount: number;
  lastUpdated: string | null;
} {
  const manifest = getManifest();
  const items = Object.values(manifest);

  let championshipsCount = 0;
  let athletesCount = 0;
  let matchesCount = 0;
  let latestDate: Date | null = null;

  for (const item of items) {
    if (item.type === 'dashboard') championshipsCount++;
    else if (item.type === 'atleta') athletesCount++;
    else if (item.type === 'referto') matchesCount++;

    const itemDate = new Date(item.cachedAt);
    if (!latestDate || itemDate > latestDate) {
      latestDate = itemDate;
    }
  }

  return {
    totalItems: items.length,
    championshipsCount,
    athletesCount,
    matchesCount,
    lastUpdated: latestDate ? formatDateTime(latestDate) : null,
  };
}

/**
 * Pulisce l'intera cache locale dei dati venue
 */
export function clearAllVenueCache(): void {
  if (typeof window === 'undefined') return;
  const manifest = getManifest();
  for (const key of Object.keys(manifest)) {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  }
  localStorage.removeItem(CACHE_META_KEY);
  window.dispatchEvent(new CustomEvent('fitet-venue-cache-updated', { detail: { cleared: true } }));
}
