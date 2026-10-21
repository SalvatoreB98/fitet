/**
 * Mapping loghi e foto ufficiali delle società sportive FITeT
 */
export function getTeamLogoUrl(teamName?: string): string {
  if (!teamName) return 'https://portale.fitet.org/images/societa/img_generica.jpg';

  const norm = teamName.toUpperCase();

  // ASD Tennistavolo Nuova Luzzi (ID: 3260)
  if (norm.includes('LUZZI')) {
    return 'https://portale.fitet.org/images/societa/3260.jpg';
  }

  // Tennistavolo Castrovillari (ID: 3164)
  if (norm.includes('CASTROVILLARI')) {
    return 'https://portale.fitet.org/images/societa/3164.jpg';
  }

  // TT Petrolo / Pirossigeno Cosenza (ID: 2904)
  if (norm.includes('COSENZA') || norm.includes('PETROLO') || norm.includes('PIROSSIGENO')) {
    return 'https://portale.fitet.org/images/societa/2904.jpg';
  }

  // Immagine generica ufficiale federale FITeT
  return 'https://portale.fitet.org/images/societa/img_generica.jpg';
}
