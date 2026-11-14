import { TorneoMatchItem } from '../types/fitet';

/**
 * Forma minima di un turno di tabellone usata dagli helper di ordinamento.
 * `TorneoBracket.tsx` e `TorneiTab.tsx` condividono la stessa logica per evitare
 * che i vari punti dell'app ordinino i turni in modo diverso.
 */
export interface BracketRoundLike {
  tab?: number;
  turno?: number;
  roundLabel: string;
  matches: TorneoMatchItem[];
}

/**
 * FITeT numera i turni dal più basso (64esimi = 3) al più alto (Finale = 9),
 * quindi `turno` crescente equivale a "dal primo turno alla finale".
 * Questa mappa è solo il fallback per i payload che non hanno `turno`.
 */
const LABEL_RANK_PATTERNS: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /128\s*(?:esimi|esimo|\^|°)/i, rank: 2 },
  { pattern: /64\s*(?:esimi|esimo|\^|°)/i, rank: 3 },
  { pattern: /32\s*(?:esimi|esimo|\^|°)/i, rank: 4 },
  { pattern: /sedicesimi/i, rank: 5 },
  { pattern: /16\s*(?:esimi|esimo|\^|°)/i, rank: 5 },
  { pattern: /ottavi/i, rank: 6 },
  { pattern: /8\s*(?:esimi|esimo|\^|°)/i, rank: 6 },
  { pattern: /quarti/i, rank: 7 },
  { pattern: /semi/i, rank: 8 },
  { pattern: /finale/i, rank: 9 },
];

/**
 * Rank del turno: più alto = turno più avanzato (Finale = 9).
 * Usa prima `turno` (dato canonico FITeT), poi il nome del turno.
 */
export function getBracketRoundRank(round: BracketRoundLike): number {
  const turno = Number(round.turno);
  if (Number.isFinite(turno) && turno > 0) {
    return turno;
  }

  const label = (round.roundLabel || '').trim();
  if (label) {
    for (const { pattern, rank } of LABEL_RANK_PATTERNS) {
      if (pattern.test(label)) return rank;
    }
  }

  return 0;
}

function hasPlayedMatches(round: BracketRoundLike): boolean {
  return Array.isArray(round.matches) && round.matches.length > 0;
}

/**
 * Ordina i turni dal primo disputato (es. ottavi) alla finale.
 *
 * L'ordinamento precedente usava il numero di partite, ma con i bye due turni
 * consecutivi possono avere lo stesso numero di incontri (es. quarti 2 e
 * semifinali 2): in quel caso l'ordine diventava casuale e quarti/semifinali
 * (o ottavi/quarti) finivano invertiti. `turno` invece è sempre monotono.
 */
export function sortBracketRounds<T extends BracketRoundLike>(rounds: T[]): T[] {
  return [...rounds].sort((a, b) => {
    const rankA = getBracketRoundRank(a);
    const rankB = getBracketRoundRank(b);

    if (rankA !== rankB) return rankA - rankB;

    // Fallback per round senza `turno`/label riconoscibile: più partite = turno precedente.
    if (a.matches.length !== b.matches.length) {
      return b.matches.length - a.matches.length;
    }

    return (a.roundLabel || '').localeCompare(b.roundLabel || '', 'it');
  });
}

/**
 * Se la gara espone più tabelloni (`tab` diversi, es. principale e
 * consolazione), il bracket non deve mescolarli. Sceglie il tabellone
 * principale: quello con più incontri, poi quello più avanzato, poi il primo.
 */
export function selectMainTabRounds<T extends BracketRoundLike>(rounds: T[]): T[] {
  const populated = rounds.filter(hasPlayedMatches);
  if (populated.length <= 1) return populated;

  const groups = new Map<number, T[]>();
  populated.forEach((round) => {
    const tab = typeof round.tab === 'number' ? round.tab : 1;
    const list = groups.get(tab);
    if (list) list.push(round);
    else groups.set(tab, [round]);
  });

  if (groups.size <= 1) return populated;

  let bestTab = 1;
  let bestMatches = -1;
  let bestRank = -1;

  groups.forEach((list, tab) => {
    const totalMatches = list.reduce((sum, r) => sum + r.matches.length, 0);
    const maxRank = list.reduce((max, r) => Math.max(max, getBracketRoundRank(r)), 0);

    if (
      totalMatches > bestMatches ||
      (totalMatches === bestMatches && maxRank > bestRank) ||
      (totalMatches === bestMatches && maxRank === bestRank && tab < bestTab)
    ) {
      bestTab = tab;
      bestMatches = totalMatches;
      bestRank = maxRank;
    }
  });

  return groups.get(bestTab) || populated;
}

/**
 * Indice del match del turno successivo che contiene il vincitore.
 * Con i bye l'indice non è sempre `floor(idx / 2)`: il match successivo può
 * essere alimentato da un solo incontro giocato. Cerchiamo quindi il vincitore
 * per nome, usando l'indice teorico solo come fallback/limite.
 */
export function findNextRoundMatchIndex(
  nextRound: { matches: TorneoMatchItem[] } | null | undefined,
  winnerName: string | null,
  fallbackIndex: number
): number {
  const matches = nextRound?.matches || [];
  if (matches.length === 0) return Math.max(0, fallbackIndex);

  const clampedFallback = Math.min(Math.max(0, fallbackIndex), matches.length - 1);

  if (winnerName) {
    let bestIndex = -1;
    matches.forEach((match, index) => {
      if (match.atleta1 !== winnerName && match.atleta2 !== winnerName) return;
      if (
        bestIndex === -1 ||
        Math.abs(index - fallbackIndex) < Math.abs(bestIndex - fallbackIndex)
      ) {
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) return bestIndex;
  }

  return clampedFallback;
}

export function getMatchWinnerName(match: TorneoMatchItem): string | null {
  if (match.vincitore === 1) return match.atleta1 || null;
  if (match.vincitore === 2) return match.atleta2 || null;
  return null;
}

/**
 * Calcola la riga di ogni match nelle colonne del tabellone.
 *
 * Con un tabellone "pieno" il risultato coincide con la classica spaziatura
 * 1, 3, 5, ... → 2, 6, 10, ... → 4, 12, ... → 8.
 * Con i bye, invece, il genitore viene centrato sui figli realmente presenti
 * (riconosciuti tramite il vincitore), evitando che un turno risulti spostato
 * rispetto al turno che lo alimenta.
 */
export function computeBracketRows(rounds: BracketRoundLike[]): number[][] {
  if (rounds.length === 0) return [];

  const rows: number[][] = [];
  const firstCount = rounds[0].matches.length || 1;
  rows.push(rounds[0].matches.map((_, index) => index * 2 + 1));

  for (let roundIndex = 1; roundIndex < rounds.length; roundIndex++) {
    const previousRound = rounds[roundIndex - 1];
    const currentRound = rounds[roundIndex];
    const previousRows = rows[roundIndex - 1];

    const childRows: number[][] = currentRound.matches.map(() => []);

    previousRound.matches.forEach((match, matchIndex) => {
      const winner = getMatchWinnerName(match);
      let targetIndex = winner
        ? currentRound.matches.findIndex(
            (parent) => parent.atleta1 === winner || parent.atleta2 === winner
          )
        : -1;

      if (targetIndex < 0) targetIndex = Math.floor(matchIndex / 2);
      if (targetIndex < 0 || targetIndex >= currentRound.matches.length) return;

      childRows[targetIndex].push(previousRows[matchIndex]);
    });

    const currentRows: number[] = [];
    let minRow = 1;

    currentRound.matches.forEach((_, matchIndex) => {
      const children = childRows[matchIndex];
      let row: number;

      if (children.length > 0) {
        row = Math.round(children.reduce((sum, value) => sum + value, 0) / children.length);
      } else {
        // Turno senza legami ricostruibili: distribuisce le card sull'altezza del tabellone.
        row = Math.round(((matchIndex + 0.5) * (firstCount * 2)) / currentRound.matches.length);
      }

      row = Math.max(row, minRow);
      currentRows.push(row);
      minRow = row + 2;
    });

    rows.push(currentRows);
  }

  return rows;
}

