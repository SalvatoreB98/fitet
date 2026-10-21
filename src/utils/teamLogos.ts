/**
 * Mapping loghi e foto ufficiali delle società sportive FITeT
 */

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

export function getTeamLogoUrl(teamName?: string, directLogoUrl?: string): string {
  if (directLogoUrl) return directLogoUrl;
  if (!teamName) return 'https://portale.fitet.org/images/societa/img_generica.jpg';

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

  // 3. Fallback keywords
  if (norm.includes('LUZZI')) return 'https://portale.fitet.org/images/societa/3260.jpg';
  if (norm.includes('CASTROVILLARI')) return 'https://portale.fitet.org/images/societa/3164.jpg';
  if (norm.includes('COSENZA') || norm.includes('PETROLO') || norm.includes('PIROSSIGENO')) {
    return 'https://portale.fitet.org/images/societa/2904.jpg';
  }

  // Immagine generica ufficiale federale FITeT
  return 'https://portale.fitet.org/images/societa/img_generica.jpg';
}
