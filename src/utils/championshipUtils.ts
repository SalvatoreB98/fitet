import { ChampionshipItem } from '../types/fitet';

export type SerieGroupKey = 'serie_a' | 'serie_b' | 'serie_c' | 'serie_d' | 'altri';

export interface SerieGroupConfig {
  key: SerieGroupKey;
  title: string;
  sub: string;
  icon: string;
  accent: string;
  accentBg: string;
  order: number;
}

export const SERIE_CONFIGS: Record<SerieGroupKey, SerieGroupConfig> = {
  serie_a: {
    key: 'serie_a',
    title: 'Serie A',
    sub: 'Massima Divisione Nazionale (A1, A2)',
    icon: 'bi-trophy-fill',
    accent: '#2563eb',
    accentBg: 'rgba(37, 99, 235, 0.12)',
    order: 1,
  },
  serie_b: {
    key: 'serie_b',
    title: 'Serie B',
    sub: 'Campionati Nazionali (B1, B2)',
    icon: 'bi-award-fill',
    accent: '#0284c7',
    accentBg: 'rgba(2, 132, 199, 0.12)',
    order: 2,
  },
  serie_c: {
    key: 'serie_c',
    title: 'Serie C',
    sub: 'Campionati Nazionali & Regionali (C1, C2)',
    icon: 'bi-shield-shaded',
    accent: '#b45309',
    accentBg: 'rgba(245, 158, 11, 0.12)',
    order: 3,
  },
  serie_d: {
    key: 'serie_d',
    title: 'Serie D',
    sub: 'Campionati Regionali & Territoriali (D1, D2, D3)',
    icon: 'bi-diagram-3-fill',
    accent: '#059669',
    accentBg: 'rgba(5, 150, 105, 0.12)',
    order: 4,
  },
  altri: {
    key: 'altri',
    title: 'Coppe & Altri Campionati',
    sub: 'Coppa Italia, Tornei a Squadre, Paralimpici',
    icon: 'bi-stars',
    accent: '#7c3aed',
    accentBg: 'rgba(124, 58, 237, 0.12)',
    order: 5,
  },
};

export function getChampionshipSerieKey(c: Partial<ChampionshipItem>): SerieGroupKey {
  const normCat = (c.categoria || '').trim().toUpperCase();
  const normName = (c.nome || '').trim().toUpperCase();

  // Serie A
  if (
    normCat === 'SERIE A' ||
    normCat === 'A' ||
    /\bA\s*[\/-]?\s*[12]\b/i.test(normName) ||
    /\bSERIE\s+A\b/i.test(normName) ||
    /^A[12]\b/i.test(normName)
  ) {
    return 'serie_a';
  }

  // Serie B
  if (
    normCat === 'SERIE B' ||
    normCat === 'B' ||
    /\bB\s*[\/-]?\s*[12]\b/i.test(normName) ||
    /\bSERIE\s+B\b/i.test(normName) ||
    /^B[12]\b/i.test(normName)
  ) {
    return 'serie_b';
  }

  // Serie C
  if (
    normCat === 'SERIE C1' ||
    normCat === 'C/2' ||
    normCat === 'C2' ||
    normCat === 'C' ||
    normCat === 'C2/A' ||
    normCat === 'C2/B' ||
    /\bC\s*[\/-]?\s*[12]\b/i.test(normName) ||
    /\bSERIE\s+C\b/i.test(normName) ||
    /^C[12]\b/i.test(normName)
  ) {
    return 'serie_c';
  }

  // Serie D
  if (
    normCat.startsWith('D') ||
    /\bD\s*[\/-]?\s*[1234]\b/i.test(normName) ||
    /\bSERIE\s+D\b/i.test(normName) ||
    /^D[1234]\b/i.test(normName)
  ) {
    return 'serie_d';
  }

  return 'altri';
}

/**
 * Rimuove il prefisso ridondante dal nome del campionato se già mostrato nel cat-badge.
 * Es. "D/1 Gir. Nord" con categoria "D/1" -> "Gir. Nord"
 * Es. "Serie A - A/1 Gir.U" con categoria "Serie A" -> "A/1 Gir.U"
 * Es. "C/2 Gir. B" con categoria "C/2" -> "Gir. B"
 */
export function cleanChampionshipCardName(nome?: string, categoria?: string): string {
  if (!nome) return '';
  const trimmedNome = nome.trim();
  const trimmedCat = (categoria || '').trim();

  if (!trimmedCat) return trimmedNome;

  const catWithoutSlash = trimmedCat.replace('/', '');
  const catWithSlash = trimmedCat.includes('/')
    ? trimmedCat
    : trimmedCat.replace(/^([a-zA-Z]+)(\d+)$/, '$1/$2');

  const catVariants = Array.from(
    new Set([
      trimmedCat,
      catWithoutSlash,
      catWithSlash,
      trimmedCat.replace(/^Serie\s+/i, ''),
      `Serie ${trimmedCat.replace(/^Serie\s+/i, '')}`,
    ])
  ).filter(Boolean);

  // Ordina per lunghezza decrescente per rimuovere prima i prefissi più specifici
  catVariants.sort((a, b) => b.length - a.length);

  for (const variant of catVariants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}\\s*(?:[-–—:/]\\s*|\\s+)`, 'i');
    if (regex.test(trimmedNome)) {
      const cleaned = trimmedNome.replace(regex, '').trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }

  return trimmedNome;
}
