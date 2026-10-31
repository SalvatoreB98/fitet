import { TorneoItem } from '../types/fitet';
import { REGIONS_COMIT } from '../constants/regions';
import {
  ITALY_CITY_COORDS,
  ITALY_CITY_TO_REGION,
  ITALY_PROVINCE_COORDS,
  ITALY_PROVINCE_TO_REGION,
  ITALY_REGION_BBOX,
  ITALY_REGION_COORDS,
  projectItalyPoint,
} from '../data/italyGeo';

const REGION_FILTER_KEYS: Record<string, string> = {
  'trentino alto adige': 'trentino-alto-adige',
  trentino: 'trentino-alto-adige',
  'alto adige': 'trentino-alto-adige',
  'valle d aosta': 'valle-d-aosta',
  'friuli venezia giulia': 'friuli-venezia-giulia',
  'emilia romagna': 'emilia-romagna',
};

const CITY_ALIASES: Record<string, string> = {
  'reggio calabria': 'reggio di calabria',
  sermide: 'sermide e felonica',
  's giovanni lupatoto': 'san giovanni lupatoto',
  's. giovanni lupatoto': 'san giovanni lupatoto',
};

const REGION_CANONICAL_NAMES: Record<string, string> = {
  'trentino alto adige': 'Trentino-Alto Adige',
  trentino: 'Trentino-Alto Adige',
  'alto adige': 'Trentino-Alto Adige',
  'valle d aosta': "Valle d'Aosta",
  'friuli venezia giulia': 'Friuli Venezia Giulia',
  'emilia romagna': 'Emilia Romagna',
};

const ITALY_CENTER: [number, number] = [12.5, 42.5];

export interface TorneoPlace {
  city: string;
  provinceCode: string | null;
  region: string;
  key: string;
  label: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
}

export function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeCityName(value: string): string {
  const normalized = normalizeText(value);
  return CITY_ALIASES[normalized] || normalized;
}

export function getRegionFilterKey(region: string | null | undefined): string {
  const normalized = normalizeText(region || '');
  if (!normalized) return '';
  return REGION_FILTER_KEYS[normalized] || normalized.replace(/\s+/g, '-');
}

export function regionMatches(
  regionA: string | null | undefined,
  regionB: string | null | undefined
): boolean {
  const keyA = getRegionFilterKey(regionA);
  const keyB = getRegionFilterKey(regionB);
  return Boolean(keyA && keyB && keyA === keyB);
}

export function getCanonicalRegionName(region: string | null | undefined): string {
  const normalized = normalizeText(region || '');
  return REGION_CANONICAL_NAMES[normalized] || (region || '').trim();
}

export function getRegionBbox(region: string | null | undefined): string | null {
  if (!region) return null;
  const canonical = getCanonicalRegionName(region);
  if (ITALY_REGION_BBOX[canonical]) return ITALY_REGION_BBOX[canonical];
  const normalized = normalizeText(region);
  for (const [key, bbox] of Object.entries(ITALY_REGION_BBOX)) {
    if (normalizeText(key) === normalized) return bbox;
  }
  return null;
}

export function resolveTorneoRegion(
  torneo: TorneoItem,
  sectionRegionName?: string
): string {
  let region = torneo.regione?.trim();
  if (!region && torneo.com > 0) {
    region = REGIONS_COMIT.find((item) => item.id === torneo.com)?.name;
  }
  if (!region) {
    region = sectionRegionName || 'Nazionale';
  }
  if (region.toLowerCase().includes('nazionale') || torneo.com === 0) {
    return 'Nazionale';
  }
  return region;
}

export function isTorneoNational(
  torneo: TorneoItem,
  sectionRegionName?: string
): boolean {
  if (torneo.com === 0 || torneo.com === 30) return true;
  const reg = (torneo.regione || sectionRegionName || '').toLowerCase();
  return reg.includes('nazionale') || reg === 'italia';
}

/**
 * Risolve la regione geografica reale in cui si svolge il torneo
 * (a partire dal campo luogo: comune/provincia).
 * Riconosce la regione sia per i tornei regionali sia per quelli nazionali
 * (es. "Terni" -> "Umbria", "Spezzano Albanese (CS)" -> "Calabria",
 * "Casamassima (BA)" -> "Puglia", "Bardonecchia (TO)" -> "Piemonte").
 */
export function getTorneoHostRegion(
  torneo: TorneoItem,
  fallbackRegion?: string
): string {
  let reg = torneo.regione?.trim();
  if (!reg && torneo.com > 0 && torneo.com !== 30) {
    reg = REGIONS_COMIT.find((item) => item.id === torneo.com)?.name;
  }
  if (reg && !reg.toLowerCase().includes('nazionale') && reg.toLowerCase() !== 'italia') {
    return getCanonicalRegionName(reg);
  }

  const { city, provinceCode } = parseLuogo(torneo.luogo);

  if (provinceCode && ITALY_PROVINCE_TO_REGION[provinceCode]) {
    return ITALY_PROVINCE_TO_REGION[provinceCode];
  }

  const cityKey = normalizeCityName(city);
  if (cityKey && ITALY_CITY_TO_REGION[cityKey]) {
    return ITALY_CITY_TO_REGION[cityKey];
  }

  if (fallbackRegion && !fallbackRegion.toLowerCase().includes('nazionale')) {
    return getCanonicalRegionName(fallbackRegion);
  }

  return 'Nazionale';
}

/**
 * Determina se un torneo appartiene a una regione o si svolge in quella regione.
 * Include anche i tornei che sono nazionali ma che si svolgono (o sono stati svolti) lì.
 */
export function torneoMatchesRegion(
  torneo: TorneoItem,
  targetRegion: string | null | undefined,
  assignedRegion?: string
): boolean {
  if (!targetRegion) return true;

  if (assignedRegion && regionMatches(assignedRegion, targetRegion)) return true;
  if (torneo.regione && regionMatches(torneo.regione, targetRegion)) return true;
  if (torneo.com > 0 && torneo.com !== 30) {
    const comitName = REGIONS_COMIT.find((r) => r.id === torneo.com)?.name;
    if (regionMatches(comitName, targetRegion)) return true;
  }

  const host = getTorneoHostRegion(torneo, assignedRegion);
  return regionMatches(host, targetRegion);
}

interface ParsedLuogo {
  city: string;
  provinceCode: string | null;
}

export function parseLuogo(luogo: string): ParsedLuogo {
  const cleaned = String(luogo || '')
    .replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*/, '')
    .trim();
  const match = cleaned.match(/^(.*?)\s*\(([A-Za-z]{2})\)\s*$/);
  if (match) {
    return {
      city: match[1].trim(),
      provinceCode: match[2].toUpperCase(),
    };
  }
  return { city: cleaned, provinceCode: null };
}

function getCoordinates(
  city: string,
  provinceCode: string | null,
  region: string
): [number, number] {
  const cityKey = normalizeCityName(city);
  const regionKey = getCanonicalRegionName(region);

  if (provinceCode) {
    const cityWithProvince = ITALY_CITY_COORDS[`${cityKey}|${provinceCode}`];
    if (cityWithProvince) return cityWithProvince;
  }

  const cityCoords = ITALY_CITY_COORDS[cityKey];
  if (cityCoords) return cityCoords;

  if (provinceCode) {
    const provinceCoords = ITALY_PROVINCE_COORDS[provinceCode];
    if (provinceCoords) return provinceCoords;
  }

  const regionCoords = ITALY_REGION_COORDS[regionKey];
  if (regionCoords) return regionCoords;

  return ITALY_CENTER;
}

/**
 * Risolve la posizione geografica di un torneo a partire dal campo `luogo`
 * (es. "Moncalieri (TO)", "Milano", "26/02/2027 - Terni").
 * La regione restituita è la regione geografica effettiva in cui si svolge il torneo.
 */
export function getTorneoPlace(torneo: TorneoItem, region?: string): TorneoPlace {
  const hostRegion = getTorneoHostRegion(torneo, region);
  const effectiveRegion =
    hostRegion !== 'Nazionale'
      ? hostRegion
      : region && region !== 'Nazionale'
        ? region
        : 'Nazionale';
  const { city, provinceCode } = parseLuogo(torneo.luogo);
  const safeCity = city || 'Italia';
  const [lon, lat] = getCoordinates(safeCity, provinceCode, effectiveRegion);
  const { x, y } = projectItalyPoint(lon, lat);

  return {
    city: safeCity,
    provinceCode,
    region: effectiveRegion,
    key: `${lon.toFixed(4)}|${lat.toFixed(4)}`,
    label: provinceCode ? `${safeCity} (${provinceCode})` : safeCity,
    lon,
    lat,
    x,
    y,
  };
}
