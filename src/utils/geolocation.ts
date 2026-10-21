/**
 * Geolocation and Italian Region Detection Service
 * Detects the user's Italian region using browser geolocation and reverse geocoding,
 * with fast caching and instant geometric fallback.
 */

const STORAGE_KEY = 'fitet_detected_region';

// Coordinates of approximate centroids for Italian administrative regions
const REGION_CENTROIDS: { name: string; lat: number; lon: number }[] = [
  { name: 'Abruzzo', lat: 42.35, lon: 13.40 },
  { name: 'Basilicata', lat: 40.64, lon: 15.80 },
  { name: 'Calabria', lat: 38.90, lon: 16.60 },
  { name: 'Campania', lat: 40.83, lon: 14.25 },
  { name: 'Emilia Romagna', lat: 44.49, lon: 11.34 },
  { name: 'Friuli Venezia Giulia', lat: 46.06, lon: 13.23 },
  { name: 'Lazio', lat: 41.90, lon: 12.50 },
  { name: 'Liguria', lat: 44.41, lon: 8.93 },
  { name: 'Lombardia', lat: 45.47, lon: 9.19 },
  { name: 'Marche', lat: 43.61, lon: 13.51 },
  { name: 'Molise', lat: 41.56, lon: 14.66 },
  { name: 'Piemonte', lat: 45.07, lon: 7.68 },
  { name: 'Puglia', lat: 41.12, lon: 16.86 },
  { name: 'Sardegna', lat: 40.12, lon: 9.01 },
  { name: 'Sicilia', lat: 37.59, lon: 14.01 },
  { name: 'Toscana', lat: 43.77, lon: 11.25 },
  { name: 'Trentino', lat: 46.07, lon: 11.12 },
  { name: 'Alto Adige', lat: 46.60, lon: 11.50 },
  { name: 'Umbria', lat: 43.11, lon: 12.39 },
  { name: "Valle d'Aosta", lat: 45.74, lon: 7.32 },
  { name: 'Veneto', lat: 45.44, lon: 12.33 },
];

/**
 * Gets the closest Italian region name based on geometric distance to centroids.
 */
export function getClosestItalianRegion(lat: number, lon: number): string {
  let closest = 'Calabria';
  let minDistanceSq = Infinity;
  for (const r of REGION_CENTROIDS) {
    const dLat = r.lat - lat;
    const dLon = r.lon - lon;
    const d2 = dLat * dLat + dLon * dLon;
    if (d2 < minDistanceSq) {
      minDistanceSq = d2;
      closest = r.name;
    }
  }
  return closest;
}

/**
 * Matches any raw region name or administrative description to the exact FITeT catalog region.
 */
export function matchCatalogRegion(rawName: string, adminDetails?: string[]): string {
  const norm = (rawName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    norm.includes('trentin') ||
    norm.includes('alto adige') ||
    norm.includes('sudtirol') ||
    norm.includes('bolzano') ||
    norm.includes('bozen')
  ) {
    if (norm.includes('bolzano') || norm.includes('bozen') || norm.includes('sudtirol')) {
      return 'Alto Adige';
    }
    if (adminDetails && adminDetails.some((a) => /bolzano|bozen|südtirol|sudtirol/i.test(a))) {
      return 'Alto Adige';
    }
    return 'Trentino';
  }
  if (norm.includes('emilia')) return 'Emilia Romagna';
  if (norm.includes('friuli')) return 'Friuli Venezia Giulia';
  if (norm.includes('valle d') || norm.includes('aosta')) return "Valle d'Aosta";
  if (norm.includes('abruzzo')) return 'Abruzzo';
  if (norm.includes('basilicata')) return 'Basilicata';
  if (norm.includes('calabria')) return 'Calabria';
  if (norm.includes('campania')) return 'Campania';
  if (norm.includes('lazio')) return 'Lazio';
  if (norm.includes('liguria')) return 'Liguria';
  if (norm.includes('lombard')) return 'Lombardia';
  if (norm.includes('marche')) return 'Marche';
  if (norm.includes('molise')) return 'Molise';
  if (norm.includes('piemonte') || norm.includes('piedmont')) return 'Piemonte';
  if (norm.includes('puglia') || norm.includes('apulia')) return 'Puglia';
  if (norm.includes('sardegna') || norm.includes('sardinia')) return 'Sardegna';
  if (norm.includes('sicil')) return 'Sicilia';
  if (norm.includes('toscan') || norm.includes('tuscany')) return 'Toscana';
  if (norm.includes('umbria')) return 'Umbria';
  if (norm.includes('venet')) return 'Veneto';

  return 'Calabria';
}

/**
 * Performs reverse geocoding from latitude and longitude to an Italian region name.
 */
export async function reverseGeocodeToRegion(lat: number, lon: number): Promise<string> {
  // Strategy 1: BigDataCloud free client-side API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=it`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const subdivision = data.principalSubdivision || '';
      const adminNames = Array.isArray(data.localityInfo?.administrative)
        ? data.localityInfo.administrative.map((a: { name?: string }) => a.name || '')
        : [];

      if (subdivision) {
        return matchCatalogRegion(subdivision, adminNames);
      }
    }
  } catch {
    // Ignore and proceed to fallback
  }

  // Strategy 2: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=it`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const state = data.address?.state || data.address?.county || '';
      if (state) {
        return matchCatalogRegion(state);
      }
    }
  } catch {
    // Ignore and proceed to centroid fallback
  }

  // Strategy 3: Nearest centroid fallback
  return getClosestItalianRegion(lat, lon);
}

/**
 * Returns the cached detected region from localStorage, or 'Calabria' if not yet detected.
 */
export function getCachedUserRegion(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {
      // Storage access error or private browsing
    }
  }
  return 'Calabria';
}

/**
 * Attempts to detect the user's Italian region using browser geolocation.
 * Caches the detected region in localStorage and returns the detected region name.
 */
export function detectUserRegion(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const region = await reverseGeocodeToRegion(latitude, longitude);
          if (region) {
            try {
              localStorage.setItem(STORAGE_KEY, region);
            } catch {
              // Ignore localStorage error
            }
            resolve(region);
            return;
          }
        } catch {
          // Geocode error
        }
        resolve(null);
      },
      () => {
        // Permission denied or unavailable
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 1000 * 60 * 60 * 24, // 24 hours cache for position
      }
    );
  });
}
