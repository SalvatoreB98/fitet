import {
  AtletaSquadraDettaglio,
  GiornataCalendario,
  PartitaCalendario,
  SquadraClassifica,
  TeamMatchAIPlayerInput,
  TeamMatchFormulaInfo,
} from '../types/fitet';

export interface EvaluatedPlayer extends TeamMatchAIPlayerInput {
  isDoppio: boolean;
  fotoUrl: string | null;
  setDiff: number;
  puntiDiff: number;
  tierLabel: string;
  tierTone: 'top' | 'solid' | 'mid' | 'reserve';
}

export function normalizeTeamNameKey(name?: string | null): string {
  return (name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findStandingForTeam(
  classifica: SquadraClassifica[] | undefined,
  teamName: string
): SquadraClassifica | null {
  if (!classifica || classifica.length === 0) return null;
  const target = normalizeTeamNameKey(teamName);
  if (!target) return null;

  const exact = classifica.find((s) => normalizeTeamNameKey(s.nome) === target);
  if (exact) return exact;

  return (
    classifica.find((s) => {
      const k = normalizeTeamNameKey(s.nome);
      return k.includes(target) || target.includes(k);
    }) || null
  );
}

export function normalizePlayerWinPct(a: AtletaSquadraDettaglio): number {
  let pct = Number(a.percentualeVittorie) || 0;
  if (pct > 100) {
    if (a.partiteDisputate > 0) {
      pct = Math.round((a.partiteVinte / a.partiteDisputate) * 1000) / 10;
    } else {
      while (pct > 100) pct /= 10;
    }
  }
  return Math.max(0, Math.min(100, pct));
}

export function inferChampionshipFormula(
  calendario: GiornataCalendario[],
  formulaId?: number
): TeamMatchFormulaInfo {
  const played: PartitaCalendario[] = [];
  for (const g of calendario) {
    for (const p of g.partiteAndata || []) {
      if (p.disputato && p.puntiCasa !== null && p.puntiOspite !== null) played.push(p);
    }
    for (const p of g.partiteRitorno || []) {
      if (p.disputato && p.puntiCasa !== null && p.puntiOspite !== null) played.push(p);
    }
  }

  const sampleScores = played.slice(-8).map((p) => `${p.puntiCasa}-${p.puntiOspite}`);

  // Nei campionati FITeT attuali si disputano sempre tutti e 7 gli incontri:
  // 6 singolari + 1 doppio = 7 incontri totali (risultato finale sempre somma 7: 7-0, 6-1, 5-2, 4-3 e viceversa).
  return {
    formulaId,
    label: 'Mini-Swaythling con Doppio (7 incontri completi: 6 singolari + 1 doppio)',
    expectedTotalMatches: 7,
    winningThreshold: 4,
    drawsPossible: false,
    hasDoubles: true,
    sampleScores: sampleScores.length > 0 ? sampleScores : ['7-0', '6-1', '5-2', '4-3'],
  };
}

export interface SwaythlingScheduleSlot {
  numero: number;
  slotLabel: string;
  isDoppio: boolean;
  atletaCasa: string;
  atletaOspite: string;
}

/**
 * Genera la sequenza ufficiale degli incontri in base alla formula del campionato
 * e alle formazioni ABC (casa) / XYZ (ospite) + eventuale coppia di doppio.
 */
export function buildSwaythlingSchedule(
  formulaInfo: TeamMatchFormulaInfo,
  homeSingles: [string, string, string],
  awaySingles: [string, string, string],
  homeDoubles: [string, string],
  awayDoubles: [string, string]
): SwaythlingScheduleSlot[] {
  const [A, B, C] = homeSingles;
  const [X, Y, Z] = awaySingles;
  const homeD = `${homeDoubles[0]} / ${homeDoubles[1]}`;
  const awayD = `${awayDoubles[0]} / ${awayDoubles[1]}`;

  if (formulaInfo.expectedTotalMatches === 7 && formulaInfo.hasDoubles) {
    return [
      { numero: 1, slotLabel: 'Doppio', isDoppio: true, atletaCasa: homeD, atletaOspite: awayD },
      { numero: 2, slotLabel: 'A vs Y', isDoppio: false, atletaCasa: A, atletaOspite: Y },
      { numero: 3, slotLabel: 'B vs X', isDoppio: false, atletaCasa: B, atletaOspite: X },
      { numero: 4, slotLabel: 'C vs Z', isDoppio: false, atletaCasa: C, atletaOspite: Z },
      { numero: 5, slotLabel: 'A vs X', isDoppio: false, atletaCasa: A, atletaOspite: X },
      { numero: 6, slotLabel: 'C vs Y', isDoppio: false, atletaCasa: C, atletaOspite: Y },
      { numero: 7, slotLabel: 'B vs Z', isDoppio: false, atletaCasa: B, atletaOspite: Z },
    ];
  }

  if (formulaInfo.expectedTotalMatches === 6) {
    return [
      { numero: 1, slotLabel: 'A vs Y', isDoppio: false, atletaCasa: A, atletaOspite: Y },
      { numero: 2, slotLabel: 'B vs X', isDoppio: false, atletaCasa: B, atletaOspite: X },
      { numero: 3, slotLabel: 'C vs Z', isDoppio: false, atletaCasa: C, atletaOspite: Z },
      { numero: 4, slotLabel: 'A vs X', isDoppio: false, atletaCasa: A, atletaOspite: X },
      { numero: 5, slotLabel: 'C vs Y', isDoppio: false, atletaCasa: C, atletaOspite: Y },
      { numero: 6, slotLabel: 'B vs Z', isDoppio: false, atletaCasa: B, atletaOspite: Z },
    ];
  }

  if (formulaInfo.expectedTotalMatches === 5) {
    return [
      { numero: 1, slotLabel: 'A vs X', isDoppio: false, atletaCasa: A, atletaOspite: X },
      { numero: 2, slotLabel: 'B vs Y', isDoppio: false, atletaCasa: B, atletaOspite: Y },
      { numero: 3, slotLabel: 'Doppio', isDoppio: true, atletaCasa: homeD, atletaOspite: awayD },
      { numero: 4, slotLabel: 'A vs Y', isDoppio: false, atletaCasa: A, atletaOspite: Y },
      { numero: 5, slotLabel: 'B vs X', isDoppio: false, atletaCasa: B, atletaOspite: X },
    ];
  }

  // Swaythling classico 9 singolari (vince chi arriva a 5)
  return [
    { numero: 1, slotLabel: 'A vs X', isDoppio: false, atletaCasa: A, atletaOspite: X },
    { numero: 2, slotLabel: 'B vs Y', isDoppio: false, atletaCasa: B, atletaOspite: Y },
    { numero: 3, slotLabel: 'C vs Z', isDoppio: false, atletaCasa: C, atletaOspite: Z },
    { numero: 4, slotLabel: 'B vs X', isDoppio: false, atletaCasa: B, atletaOspite: X },
    { numero: 5, slotLabel: 'A vs Z', isDoppio: false, atletaCasa: A, atletaOspite: Z },
    { numero: 6, slotLabel: 'C vs Y', isDoppio: false, atletaCasa: C, atletaOspite: Y },
    { numero: 7, slotLabel: 'B vs Z', isDoppio: false, atletaCasa: B, atletaOspite: Z },
    { numero: 8, slotLabel: 'C vs X', isDoppio: false, atletaCasa: C, atletaOspite: X },
    { numero: 9, slotLabel: 'A vs Y', isDoppio: false, atletaCasa: A, atletaOspite: Y },
  ];
}

export function computeEvaluatedRoster(
  atleti: AtletaSquadraDettaglio[],
  referenceMaxPoints?: number
): EvaluatedPlayer[] {
  const singles = atleti.filter((a) => !a.isDoppio);
  const maxPtsInTeam = Math.max(
    referenceMaxPoints || 0,
    ...singles.map((a) => a.rankPunti || 0),
    1000
  );

  return singles
    .map((a) => {
      const pct = normalizePlayerWinPct(a);
      const totalSets = a.setVinti + a.setPersi;
      const setRatio = totalSets > 0 ? (a.setVinti / totalSets) * 100 : pct;
      const totalPts = a.puntiVinti + a.puntiPersi;
      const rallyRatio = totalPts > 0 ? (a.puntiVinti / totalPts) * 100 : 50;
      const rankScore = a.rankPunti !== null ? Math.min(100, (a.rankPunti / maxPtsInTeam) * 100) : 35;

      let evaluationScore: number;
      if (a.partiteDisputate === 0) {
        evaluationScore = Math.round(rankScore * 0.75);
      } else {
        const activityFactor = Math.min(1, a.partiteDisputate / 6);
        const rawPerf = pct * 0.44 + setRatio * 0.22 + rallyRatio * 0.14 + rankScore * 0.2;
        evaluationScore = Math.round(rawPerf * (0.78 + 0.22 * activityFactor));
      }
      evaluationScore = Math.max(15, Math.min(99, evaluationScore));

      let tierLabel = 'Solido';
      let tierTone: EvaluatedPlayer['tierTone'] = 'solid';
      if (a.partiteDisputate === 0) {
        tierLabel = 'Inattivo';
        tierTone = 'reserve';
      } else if (evaluationScore >= 75) {
        tierLabel = 'Top';
        tierTone = 'top';
      } else if (evaluationScore >= 52) {
        tierLabel = 'Solido';
        tierTone = 'solid';
      } else if (evaluationScore >= 35) {
        tierLabel = 'In crescita';
        tierTone = 'mid';
      } else {
        tierLabel = 'Sotto media';
        tierTone = 'reserve';
      }

      return {
        atletaId: a.atletaId,
        nome: a.nome,
        isDoppio: a.isDoppio,
        fotoUrl: a.fotoUrl,
        rankPosizione: a.rankPosizione,
        rankPunti: a.rankPunti,
        partiteDisputate: a.partiteDisputate,
        partiteVinte: a.partiteVinte,
        partitePerse: a.partitePerse,
        setVinti: a.setVinti,
        setPersi: a.setPersi,
        puntiVinti: a.puntiVinti,
        puntiPersi: a.puntiPersi,
        percentualeVittorie: Number(pct.toFixed(1)),
        evaluationScore,
        setDiff: a.setVinti - a.setPersi,
        puntiDiff: a.puntiVinti - a.puntiPersi,
        tierLabel,
        tierTone,
      };
    })
    .sort((a, b) => {
      if (b.evaluationScore !== a.evaluationScore) return b.evaluationScore - a.evaluationScore;
      if (b.partiteDisputate !== a.partiteDisputate) return b.partiteDisputate - a.partiteDisputate;
      return (b.rankPunti || 0) - (a.rankPunti || 0);
    });
}

export function selectLikelyStarters(players: EvaluatedPlayer[], count = 3): string[] {
  if (players.length <= count) {
    return players.map((p) => p.atletaId || p.nome);
  }
  const byUsage = [...players].sort((a, b) => {
    const aActive = a.partiteDisputate > 0 ? 1 : 0;
    const bActive = b.partiteDisputate > 0 ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    if (b.partiteDisputate !== a.partiteDisputate) return b.partiteDisputate - a.partiteDisputate;
    return (b.rankPunti || 0) - (a.rankPunti || 0);
  });
  return byUsage.slice(0, count).map((p) => p.atletaId || p.nome);
}

export function findDirectPrecedent(
  calendario: GiornataCalendario[],
  homeName: string,
  awayName: string,
  currentMatchId: string
): PartitaCalendario | null {
  const hKey = normalizeTeamNameKey(homeName);
  const aKey = normalizeTeamNameKey(awayName);

  for (const g of calendario) {
    for (const p of [...(g.partiteAndata || []), ...(g.partiteRitorno || [])]) {
      if (!p.disputato || p.id === currentMatchId) continue;
      const ph = normalizeTeamNameKey(p.squadraCasa);
      const pa = normalizeTeamNameKey(p.squadraOspite);
      if ((ph === hKey && pa === aKey) || (ph === aKey && pa === hKey)) {
        return p;
      }
    }
  }
  return null;
}

export function findTeamRecentMatches(
  calendario: GiornataCalendario[],
  teamName: string,
  limit = 5
): Array<{ match: PartitaCalendario; isHome: boolean; outcome: 'V' | 'N' | 'P'; opponent: string }> {
  const target = normalizeTeamNameKey(teamName);
  const list: Array<{ match: PartitaCalendario; isHome: boolean; outcome: 'V' | 'N' | 'P'; opponent: string }> = [];

  for (const g of calendario) {
    for (const p of [...(g.partiteAndata || []), ...(g.partiteRitorno || [])]) {
      if (!p.disputato) continue;
      const ph = normalizeTeamNameKey(p.squadraCasa);
      const pa = normalizeTeamNameKey(p.squadraOspite);
      if (ph !== target && pa !== target) continue;

      const isHome = ph === target;
      let outcome: 'V' | 'N' | 'P' = 'N';
      if (p.vincitore === 'pareggio') outcome = 'N';
      else if ((isHome && p.vincitore === 'casa') || (!isHome && p.vincitore === 'ospite')) outcome = 'V';
      else outcome = 'P';

      list.push({
        match: p,
        isHome,
        outcome,
        opponent: isHome ? p.squadraOspite : p.squadraCasa,
      });
    }
  }

  return list.slice(-limit).reverse();
}

