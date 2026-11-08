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
  };
}

