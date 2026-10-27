import { ChampionshipItem } from '../types/fitet';
import { getChampionshipGender } from './championshipUtils';

/**
 * Normalizes a string for search by lowercasing and removing diacritics/accents.
 */
export function normalizeForSearch(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Multi-token search for championships.
 * Splits search query by whitespace and ensures every token matches across
 * championship name, region, category, and ID.
 * Accurately normalizes variations like "D1", "D/1", "D\1", "D 1", "C2", "C/2", etc.
 */
export function searchCampionati(campionati: ChampionshipItem[], query: string): ChampionshipItem[] {
  let cleanedQuery = (query || '').trim();
  if (!cleanedQuery) return campionati;

  // Unify separated letter and digit patterns: e.g. "D 1" -> "D1", "C 2" -> "C2", "B 1" -> "B1"
  cleanedQuery = cleanedQuery.replace(/\b([a-zA-Z])\s+(\d+)\b/g, '$1$2');

  const rawTokens = cleanedQuery.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return campionati;

  const normalizedTokens = rawTokens.map((t) => {
    const norm = normalizeForSearch(t);
    // Remove slashes, backslashes, hyphens, dots, underscores
    const compact = norm.replace(/[/\s\\-_.]+/g, '');
    const isSingleLetter = norm.length === 1 && /[a-z]/i.test(norm);
    return { norm, compact, isSingleLetter };
  });

  return campionati.filter((c) => {
    const isFem = getChampionshipGender(c) === 'F';
    const genderTerms = isFem ? 'femminile donne femm' : 'maschile';
    const raw = `${c.nome} ${c.regione} ${c.categoria} ${c.id} ${genderTerms}`;
    const normTarget = normalizeForSearch(raw);
    const noSlashTarget = normTarget.replace(/[/\\]+/g, '');
    const spacedTarget = normTarget.replace(/[/\\]+/g, ' ');

    return normalizedTokens.every((tok) => {
      if (tok.isSingleLetter) {
        // Match single letter at word/punctuation boundaries (e.g. "Gir. A", "Serie A", "A/1", "A -")
        const regex = new RegExp(`(?:^|[^a-z0-9])${tok.norm}(?:[^a-z0-9]|$)`, 'i');
        return regex.test(normTarget) || regex.test(spacedTarget);
      }

      return (
        normTarget.includes(tok.norm) ||
        noSlashTarget.includes(tok.norm) ||
        (tok.compact && noSlashTarget.includes(tok.compact)) ||
        spacedTarget.includes(tok.norm)
      );
    });
  });
}
