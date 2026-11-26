/**
 * Utility di normalizzazione testo per i parser FITeT.
 */

/**
 * Abbrevia "Dilettantistica" / "Dilettantistico" in "D." nei nomi di società e squadre
 * (es. "A.S. Dilettantistica TT Luzzi" -> "A.S. D. TT Luzzi").
 */
export function formatSocietyName(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/\bDilettantistic[ao]\b\.?/gi, 'D.')
    .replace(/\s+/g, ' ')
    .trim();
}
