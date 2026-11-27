/**
 * Mapping loghi e foto ufficiali delle società sportive FITeT
 */

const SOCIETY_STOPWORDS = new Set([
  'ASD',
  'APD',
  'USD',
  'ACSD',
  'SSD',
  'GSD',
  'GS',
  'US',
  'AS',
  'CSI',
  'PGS',
  'CUS',
  'CRAL',
  'CIRCOLO',
  'POLISPORTIVA',
  'POL',
  'DILETTANTISTICA',
  'SPORTIVA',
  'ASSOCIAZIONE',
  'TENNISTAVOLO',
  'TENNIS',
  'TAVOLO',
  'TT',
  'PING',
  'PONG',
  'CLUB',
  'SRL',
  'SPA',
  'ONLUS',
]);

export function normalizeCoreSocietyName(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/["'“”‘’]/g, ' ')
    .replace(/\b([A-Z])\.(?=[A-Z]\.|\s|$)/g, '$1')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  while (rawTokens.length > 1 && /^[A-F]$/.test(rawTokens[rawTokens.length - 1])) {
    rawTokens.pop();
  }

  const coreTokens = rawTokens.filter((tok) => !SOCIETY_STOPWORDS.has(tok) && tok.length > 1);
  return (coreTokens.length > 0 ? coreTokens : rawTokens).join(' ');
}

const dynamicTeamLogos: Record<string, string> = {
  'ASD TENNISTAVOLO NUOVA LUZZI': 'https://portale.fitet.org/images/societa/3260.jpg',
  'TENNISTAVOLO CASTROVILLARI': 'https://portale.fitet.org/images/societa/3164.jpg',
  'TT PETROLO COSENZA': 'https://portale.fitet.org/images/societa/2904.jpg',
  'PIROSSIGENO COSENZA': 'https://portale.fitet.org/images/societa/2904.jpg',
};

/**
 * Registers logos returned by the server
 */
export function registerTeamLogos(teams: Array<{ nome: string; logoUrl?: string }>) {
  if (!Array.isArray(teams)) return;
  for (const t of teams) {
    if (t.nome && t.logoUrl) {
      dynamicTeamLogos[t.nome.toUpperCase().trim()] = t.logoUrl;
    }
  }
}

export function extractSocietyIdFromLogo(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  const match = logoUrl.match(/\/societa\/(\d+)\.(?:jpg|jpeg|png|gif|webp)(?:\?.*)?$/i);
  return match && match[1] ? match[1] : null;
}

export function getTeamLogoUrl(teamName?: string, directLogoUrl?: string): string {
  if (directLogoUrl) return directLogoUrl;
  if (!teamName) return '/generica.webp';

  const norm = teamName.toUpperCase().trim();

  // 1. Exact match in dynamic registry
  if (dynamicTeamLogos[norm]) {
    return dynamicTeamLogos[norm];
  }

  // 2. Partial match in dynamic registry
  for (const [k, url] of Object.entries(dynamicTeamLogos)) {
    if (norm.includes(k) || k.includes(norm)) {
      return url;
    }
  }

  // 3. Normalized core name match (strips A.S.D., T.T., Tennistavolo, trailing "A"/"B")
  const coreQuery = normalizeCoreSocietyName(norm);
  if (coreQuery.length >= 3) {
    const hasWholePhrase = (haystack: string, needle: string) =>
      haystack === needle || ` ${haystack} `.includes(` ${needle} `);
    for (const [k, url] of Object.entries(dynamicTeamLogos)) {
      const coreKey = normalizeCoreSocietyName(k);
      if (
        coreKey &&
        (coreKey === coreQuery ||
          (coreKey.length >= 4 &&
            coreQuery.length >= 4 &&
            (hasWholePhrase(coreKey, coreQuery) || hasWholePhrase(coreQuery, coreKey))))
      ) {
        return url;
      }
    }
  }

  // 4. Fallback keywords
  if (norm.includes('LUZZI')) return 'https://portale.fitet.org/images/societa/3260.jpg';
  if (norm.includes('CASTROVILLARI')) return 'https://portale.fitet.org/images/societa/3164.jpg';
  if (norm.includes('COSENZA') || norm.includes('PETROLO') || norm.includes('PIROSSIGENO')) {
    return 'https://portale.fitet.org/images/societa/2904.jpg';
  }

  // Immagine generica ufficiale federale FITeT
  return '/generica.webp';
}

export function resolveCachedSocietyId(
  teamOrSocietyName?: string | null,
  directLogoUrl?: string | null
): string | null {
  const fromDirect = extractSocietyIdFromLogo(directLogoUrl);
  if (fromDirect) return fromDirect;
  if (!teamOrSocietyName) return null;
  const resolvedLogo = getTeamLogoUrl(teamOrSocietyName);
  return extractSocietyIdFromLogo(resolvedLogo);
}
