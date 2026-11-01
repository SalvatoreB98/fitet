/**
 * Privacy-First Region Storage Service
 * Replaces GPS and external reverse-geocoding APIs with zero-tracking,
 * GDPR-compliant local storage and manual user region selection.
 */

export const STORAGE_KEY = 'fitet_user_region';
const LEGACY_STORAGE_KEY = 'fitet_detected_region';
const REGION_EVENT_NAME = 'fitet_user_region_changed';

export const ITALIAN_REGIONS: string[] = [
  'Abruzzo',
  'Alto Adige',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia Romagna',
  'Friuli Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
];

/**
 * Converte il nome di una regione in uno slug URL-friendly (es. "Valle d'Aosta" -> "valle-d-aosta", "Emilia Romagna" -> "emilia-romagna")
 */
export function regionToSlug(region: string): string {
  return region
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Risolve uno slug URL nel nome ufficiale della regione FITeT (es. "marche" -> "Marche")
 */
export function slugToRegion(slug: string): string | null {
  if (!slug) return null;
  const normalized = regionToSlug(decodeURIComponent(slug).trim());
  for (const reg of ITALIAN_REGIONS) {
    if (regionToSlug(reg) === normalized) {
      return reg;
    }
  }
  return null;
}

/**
 * Estrae la regione attiva dall'URL corrente (es. /regioni/marche o ?regione=marche)
 */
export function getRegionFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/(?:regioni|regione)\/([^/?#]+)/i);
  if (match && match[1]) {
    const resolved = slugToRegion(match[1]);
    if (resolved) return resolved;
  }
  const params = new URLSearchParams(window.location.search);
  const regParam = params.get('regione') || params.get('region');
  if (regParam) {
    return slugToRegion(regParam);
  }
  return null;
}

/**
 * Genera i metadati SEO (Title, H1, Description, Canonical) mirati per una regione
 */
export function getRegionSeoMeta(region: string) {
  const slug = regionToSlug(region);
  const title = `Portale Risultati FITeT ${region} – Classifiche e Gironi D1, C2`;
  const h1 = `Portale Risultati FITeT ${region} – Classifiche e Gironi`;
  const description = `Consulta risultati, classifiche e gironi FITeT ${region} (Serie C2, D1, D2, D3) e schede atleta in tempo reale. Interfaccia moderna, veloce e ottimizzata per smartphone.`;
  const canonical = `https://portale-risultati-tt.it/regioni/${slug}`;
  return { slug, title, h1, description, canonical };
}

/**
 * Returns the manually selected region from localStorage, or empty string if not configured.
 */
export function getCachedUserRegion(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {
      // Storage access error or private browsing
    }
  }
  return '';
}

/**
 * Sets the user's preferred region and emits an update event to all active components.
 */
export function setUserRegion(region: string): void {
  if (typeof window === 'undefined') return;
  const clean = region.trim();
  try {
    if (clean && clean !== 'Tutti' && clean !== 'Nazionale') {
      localStorage.setItem(STORAGE_KEY, clean);
      // Clean up legacy key
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota error
  }

  window.dispatchEvent(
    new CustomEvent(REGION_EVENT_NAME, {
      detail: { region: clean },
    })
  );
}

/**
 * Subscribes to region changes (cross-tab and in-tab).
 */
export function subscribeToUserRegion(callback: (region: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = () => callback(getCachedUserRegion());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) {
      callback(getCachedUserRegion());
    }
  };

  window.addEventListener(REGION_EVENT_NAME, handleUpdate);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(REGION_EVENT_NAME, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Privacy-first replacement for legacy detectUserRegion:
 * Returns the user's manually chosen region without any GPS prompt or external API calls.
 */
export function detectUserRegion(): Promise<string | null> {
  return Promise.resolve(getCachedUserRegion() || null);
}

