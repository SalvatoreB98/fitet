import {
  DettaglioAtleta,
  PartitaCampionatoAtleta,
  PartitaRankingCampionato,
  PartitaRankingTorneo,
} from '../types/fitet';

export interface EnrichedRankingCampionatoMatch extends PartitaRankingCampionato {
  giornata?: number;
  sets?: string[];
  isFromLiveGirone?: boolean;
}

export interface AthleteFormBadge {
  esito: 'V' | 'S';
  data: string;
  avversario: string;
  evento?: string;
  isVittoria: boolean;
  risultatoSet?: string;
  giornata?: number;
}

export interface AggregatedAthleteStats {
  partiteGiocate: number;
  partiteVinte: number;
  partitePerse: number;
  percentualePositiva: number;
  campionatoGiocate: number;
  campionatoVinte: number;
  campionatoPerse: number;
  campionatoPercentuale: number;
  torneiGiocate: number;
  torneiVinte: number;
  torneiPerse: number;
  matchedRankingByGironeIndex: Array<PartitaRankingCampionato | undefined>;
  extraGironeMatches: PartitaCampionatoAtleta[];
  mergedCampionatoMatches: EnrichedRankingCampionatoMatch[];
  badges: AthleteFormBadge[];
}

const normOpp = (s?: string): string =>
  (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const isSameOpponent = (aRaw?: string, bRaw?: string): boolean => {
  const a = normOpp(aRaw);
  const b = normOpp(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  return false;
};

/**
 * Aggrega senza duplicazioni né omissioni le partite provenienti dalla scheda
 * ranking FITeT (#fragment-1 / #fragment-3) e le partite live del campionato
 * (/api/atleta-campionato-partite), ricalcolando il totale aggiornato.
 */
export const parseMatchDateValue = (value?: string): number => {
  if (!value) return 0;
  const s = value.trim();

  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }

  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  return 0;
};

export function aggregateAthleteMatchStats(
  atleta: DettaglioAtleta | null | undefined,
  campionatoPartite?: PartitaCampionatoAtleta[] | null,
  fallbackCampNome?: string | null
): AggregatedAthleteStats {
  const rankingCampionato: PartitaRankingCampionato[] =
    atleta?.partiteRanking?.campionato || [];
  const rankingTornei: PartitaRankingTorneo[] =
    atleta?.partiteRanking?.tornei || [];
  const gironeMatches: PartitaCampionatoAtleta[] = campionatoPartite || [];

  const usedRankingIdx = new Set<number>();
  const matchedRankingByGironeIndex: Array<PartitaRankingCampionato | undefined> = [];
  const matchedGironeByRankingIndex = new Map<number, PartitaCampionatoAtleta>();
  const extraGironeMatches: PartitaCampionatoAtleta[] = [];

  for (let idx = 0; idx < gironeMatches.length; idx++) {
    const m = gironeMatches[idx];
    const targetOpp = normOpp(m.avversario);

    // 1. Match esatto su nome avversario normalizzato + stesso esito (V/S)
    let matchIdx = rankingCampionato.findIndex(
      (rm, rIdx) =>
        !usedRankingIdx.has(rIdx) &&
        normOpp(rm.avversario) === targetOpp &&
        rm.isVittoria === m.isVittoria
    );

    // 2. Match parziale su nome avversario (>= 4 caratteri) + stesso esito (V/S)
    if (matchIdx === -1) {
      matchIdx = rankingCampionato.findIndex(
        (rm, rIdx) =>
          !usedRankingIdx.has(rIdx) &&
          isSameOpponent(rm.avversario, m.avversario) &&
          rm.isVittoria === m.isVittoria
      );
    }

    // 3. Fallback: match esatto su nome avversario anche se l'esito differisse
    if (matchIdx === -1) {
      matchIdx = rankingCampionato.findIndex(
        (rm, rIdx) =>
          !usedRankingIdx.has(rIdx) && normOpp(rm.avversario) === targetOpp
      );
    }

    if (matchIdx !== -1) {
      usedRankingIdx.add(matchIdx);
      matchedRankingByGironeIndex[idx] = rankingCampionato[matchIdx];
      matchedGironeByRankingIndex.set(matchIdx, m);
    } else {
      matchedRankingByGironeIndex[idx] = undefined;
      extraGironeMatches.push(m);
    }
  }

  const defaultCampLabel =
    fallbackCampNome ||
    atleta?.campionatoAttuale?.nome ||
    rankingCampionato[0]?.campionato ||
    'Campionato';

  // Costruisce la lista unificata e deduplicata delle partite di campionato:
  // - Tutte le partite di rankingCampionato (arricchite coi set del girone se abbinate)
  // - Più le nuove partite del girone (extraGironeMatches) non ancora presenti nel ranking
  const mergedCampionatoMatches: EnrichedRankingCampionatoMatch[] = [
    ...rankingCampionato.map((rm, rIdx) => {
      const matchedGirone = matchedGironeByRankingIndex.get(rIdx);
      return {
        ...rm,
        risultatoSet: rm.risultatoSet || matchedGirone?.risultatoSet,
        giornata: matchedGirone?.giornata,
        sets: matchedGirone?.sets,
        isVittoria: matchedGirone ? matchedGirone.isVittoria : rm.isVittoria,
      };
    }),
    ...extraGironeMatches.map((m) => ({
      data: m.data || `G${m.giornata}`,
      campionato: defaultCampLabel,
      punti: undefined as unknown as number,
      risultato: m.isVittoria ? 'V' : 'S',
      sesso: '',
      stato: 'G',
      avversario: m.avversario,
      risultatoSet: m.risultatoSet,
      isVittoria: m.isVittoria,
      giornata: m.giornata,
      sets: m.sets,
      isFromLiveGirone: true,
    })),
  ];

  const campionatoGiocate = mergedCampionatoMatches.length;
  const campionatoVinte = mergedCampionatoMatches.filter((m) => m.isVittoria).length;
  const campionatoPerse = campionatoGiocate - campionatoVinte;
  const campionatoPercentuale =
    campionatoGiocate > 0 ? Math.round((campionatoVinte / campionatoGiocate) * 100) : 0;

  const torneiGiocate = rankingTornei.length;
  const torneiVinte = rankingTornei.filter((m) => m.isVittoria).length;
  const torneiPerse = torneiGiocate - torneiVinte;

  const parsedRankingCount = rankingCampionato.length + rankingTornei.length;
  const riepilogoGiocate = atleta?.riepilogo?.partiteGiocate ?? 0;
  const riepilogoVinte = atleta?.riepilogo?.partiteVinte ?? 0;
  const riepilogoPerse = atleta?.riepilogo?.partitePerse ?? 0;

  let partiteGiocate = campionatoGiocate + torneiGiocate;
  let partiteVinte = campionatoVinte + torneiVinte;
  let partitePerse = campionatoPerse + torneiPerse;

  // Se l'iframe #fragment-3 non avesse restituito le partite ma #fragment-1 ha un riepilogo valido,
  // usa il riepilogo come base e somma solo le nuove partite extra del girone non conteggiate.
  if (parsedRankingCount === 0 && riepilogoGiocate > partiteGiocate) {
    const extraWins = extraGironeMatches.filter((m) => m.isVittoria).length;
    const extraLosses = extraGironeMatches.length - extraWins;
    partiteGiocate = riepilogoGiocate + extraGironeMatches.length;
    partiteVinte = riepilogoVinte + extraWins;
    partitePerse = riepilogoPerse + extraLosses;
  } else if (riepilogoGiocate > parsedRankingCount && parsedRankingCount > 0) {
    // Caso raro in cui #fragment-1 include partite non elencate in #fragment-3
    const extraWins = extraGironeMatches.filter((m) => m.isVittoria).length;
    const extraLosses = extraGironeMatches.length - extraWins;
    partiteGiocate = riepilogoGiocate + extraGironeMatches.length;
    partiteVinte = riepilogoVinte + extraWins;
    partitePerse = riepilogoPerse + extraLosses;
  }

  const percentualePositiva =
    partiteGiocate > 0
      ? Math.round((partiteVinte / partiteGiocate) * 100)
      : atleta?.riepilogo?.percentualePositiva ?? 0;

  // Calcolo badges forma recente (le ultime 5 di tutte le partite, dal meno recente al più recente)
  let maxRankingDateTs = 0;
  for (const rm of rankingCampionato) {
    const ts = parseMatchDateValue(rm.data);
    if (ts > maxRankingDateTs) maxRankingDateTs = ts;
  }
  for (const tm of rankingTornei) {
    const ts = parseMatchDateValue(tm.data);
    if (ts > maxRankingDateTs) maxRankingDateTs = ts;
  }

  interface MatchWithScore extends AthleteFormBadge {
    sortScore: number;
  }

  const allMatchesWithScore: MatchWithScore[] = [];
  let seqOrder = 0;

  for (const m of mergedCampionatoMatches) {
    let ts = parseMatchDateValue(m.data);
    if (ts === 0 || m.isFromLiveGirone) {
      // Le partite live del girone non ancora a ranking sono cronologicamente successive
      const base = maxRankingDateTs > 0 ? maxRankingDateTs : Date.now() - 30 * 86400000;
      ts = base + (m.giornata || 1) * 86400000 + seqOrder;
    }
    allMatchesWithScore.push({
      esito: m.isVittoria ? 'V' : 'S',
      data: m.data || (m.giornata ? `G${m.giornata}` : ''),
      avversario: m.avversario,
      evento: m.campionato,
      isVittoria: Boolean(m.isVittoria),
      risultatoSet: m.risultatoSet,
      giornata: m.giornata,
      sortScore: ts,
    });
    seqOrder++;
  }

  for (const m of rankingTornei) {
    const ts = parseMatchDateValue(m.data) || seqOrder;
    allMatchesWithScore.push({
      esito: m.isVittoria ? 'V' : 'S',
      data: m.data,
      avversario: m.avversario,
      evento: m.torneo || m.gara || 'Torneo',
      isVittoria: Boolean(m.isVittoria),
      risultatoSet: m.risultatoSet,
      sortScore: ts,
    });
    seqOrder++;
  }

  allMatchesWithScore.sort((a, b) => a.sortScore - b.sortScore);

  const badges: AthleteFormBadge[] = allMatchesWithScore
    .slice(-5)
    .map(({ sortScore, ...badge }) => badge);

  return {
    partiteGiocate,
    partiteVinte,
    partitePerse,
    percentualePositiva,
    campionatoGiocate,
    campionatoVinte,
    campionatoPerse,
    campionatoPercentuale,
    torneiGiocate,
    torneiVinte,
    torneiPerse,
    matchedRankingByGironeIndex,
    extraGironeMatches,
    mergedCampionatoMatches,
    badges,
  };
}

