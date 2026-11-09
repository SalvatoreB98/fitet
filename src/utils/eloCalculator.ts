import { DettaglioAtleta, CampionatoAttualeInfo } from '../types/fitet';

export interface SerieCampionato {
  id: string;
  label: string;
  settore: 'Maschile' | 'Femminile' | 'Paralimpico' | 'Giovanile' | 'Veterani';
  puntiBase: number;
}

export const SERIE_CAMPIONATO: SerieCampionato[] = [
  // Maschile
  { id: 'A1_M', label: 'Serie A1', settore: 'Maschile', puntiBase: 300 },
  { id: 'A2_M', label: 'Serie A2', settore: 'Maschile', puntiBase: 170 },
  { id: 'B1_M', label: 'Serie B1', settore: 'Maschile', puntiBase: 110 },
  { id: 'B2_M', label: 'Serie B2', settore: 'Maschile', puntiBase: 80 },
  { id: 'C1_M', label: 'Serie C1', settore: 'Maschile', puntiBase: 60 },
  { id: 'C2_M', label: 'Serie C2', settore: 'Maschile', puntiBase: 40 },
  { id: 'D1_M', label: 'Serie D1', settore: 'Maschile', puntiBase: 35 },
  { id: 'D2_M', label: 'Serie D2', settore: 'Maschile', puntiBase: 30 },
  { id: 'D3_M', label: 'Serie D3', settore: 'Maschile', puntiBase: 25 },
  { id: 'D4_M', label: 'Serie D4', settore: 'Maschile', puntiBase: 20 },

  // Femminile
  { id: 'A1_F', label: 'Serie A1 F', settore: 'Femminile', puntiBase: 250 },
  { id: 'A2_F', label: 'Serie A2 F', settore: 'Femminile', puntiBase: 140 },
  { id: 'B_F', label: 'Serie B F', settore: 'Femminile', puntiBase: 90 },
  { id: 'C_F', label: 'Serie C F', settore: 'Femminile', puntiBase: 50 },

  // Paralimpico
  { id: 'A1_PARA', label: 'Serie A1 Paralimpica', settore: 'Paralimpico', puntiBase: 120 },
  { id: 'A2_PARA', label: 'Serie A2 Paralimpica', settore: 'Paralimpico', puntiBase: 70 },
  { id: 'B_PARA', label: 'Serie B Paralimpica', settore: 'Paralimpico', puntiBase: 40 },

  // Giovanile & Veterani
  { id: 'GIOV_NAZ', label: 'Campionato Giovanile Naz.', settore: 'Giovanile', puntiBase: 40 },
  { id: 'GIOV_REG', label: 'Campionato Giovanile Reg.', settore: 'Giovanile', puntiBase: 25 },
  { id: 'VET_A1', label: 'Serie A1 Veterani', settore: 'Veterani', puntiBase: 90 },
  { id: 'VET_B', label: 'Serie B Veterani', settore: 'Veterani', puntiBase: 50 },
];

export const SERIE_SETTORI_ORDER: Array<SerieCampionato['settore']> = [
  'Maschile',
  'Femminile',
  'Paralimpico',
  'Giovanile',
  'Veterani',
];

/**
 * Coefficienti moltiplicatori ufficiali per tipologia di manifestazione (Art. 2.4 Regolamento Classifiche FITeT)
 */
export type MatchMultiplierKey =
  | 'campionati_italiani_cat'
  | 'tornei_naz_open_456'
  | 'campionati_squadre_tornei_std'
  | 'tornei_giovanili_vet_para'
  | 'consolazione_coppa_regioni'
  | 'campionati_provinciali';

export interface MatchEventOption {
  key: MatchMultiplierKey;
  label: string;
  shortLabel: string;
  description: string;
  multiplier: number;
}

export const MATCH_EVENT_OPTIONS: MatchEventOption[] = [
  {
    key: 'campionati_italiani_cat',
    label: '1.5× — Campionati Italiani individuali di Categoria',
    shortLabel: 'Campionati Italiani Cat. (1.5×)',
    description: 'Campionati Italiani individuali di Categoria',
    multiplier: 1.5,
  },
  {
    key: 'tornei_naz_open_456',
    label: '1.2× — Tornei Nazionali e Open 4ª, 5ª, 6ª cat.',
    shortLabel: 'Tornei Naz./Open 4ª-5ª-6ª (1.2×)',
    description: 'Tornei nazionali individuali e Open di 4ª, 5ª, 6ª categoria (esclusi Giovanili, Veterani, Paralimpici)',
    multiplier: 1.2,
  },
  {
    key: 'campionati_squadre_tornei_std',
    label: '1.0× — Tornei Reg. / Assoluti / Altri Open / Coppa Italia',
    shortLabel: 'Torneo Reg. / Assoluto / Open (1.0×)',
    description:
      'Tornei nazionali assoluti/top; Campionati e tornei regionali individuali di categoria/ranking; Altri tornei Open; Coppa Italia; Supercoppa; C.I. Giovanili, Veterani, Paralimpici',
    multiplier: 1.0,
  },
  {
    key: 'tornei_giovanili_vet_para',
    label: '0.75× — Tornei Naz./Reg. Giovanili, Veterani, Paralimpici',
    shortLabel: 'Tornei Giov./Vet./Para (0.75×)',
    description: 'Tornei nazionali e regionali individuali Giovanili, Veterani, Paralimpici',
    multiplier: 0.75,
  },
  {
    key: 'consolazione_coppa_regioni',
    label: '0.5× — Tabellone Consolazione / Coppa Regioni / Transalpino',
    shortLabel: 'Consolazione / Coppa Regioni (0.5×)',
    description: 'Tabellone di consolazione; Coppa delle Regioni; Trofeo Transalpino',
    multiplier: 0.5,
  },
  {
    key: 'campionati_provinciali',
    label: '0.25× — Campionati Provinciali individuali',
    shortLabel: 'Campionati Provinciali (0.25×)',
    description: 'Campionati provinciali individuali',
    multiplier: 0.25,
  },
];

export type PlacementBracketKey =
  | 'none'
  | '1'
  | '2'
  | '3_4'
  | '5_8'
  | '9_16'
  | '17_32'
  | '33_64'
  | '65_128'
  | '129_256'
  | '257_512'
  | 'other';

export interface PlacementBracketOption {
  key: PlacementBracketKey;
  label: string;
}

export const PLACEMENT_BRACKETS: PlacementBracketOption[] = [
  { key: 'none', label: 'Nessun piazzamento' },
  { key: '1', label: '1° Classificato (Vincitore)' },
  { key: '2', label: '2° Classificato (Finalista)' },
  { key: '3_4', label: '3° - 4° Posto (Semifinalista)' },
  { key: '5_8', label: '5° - 8° Posto (Quarti)' },
  { key: '9_16', label: '9° - 16° Posto (Ottavi)' },
  { key: '17_32', label: '17° - 32° Posto (Sedicesimi)' },
  { key: '33_64', label: '33° - 64° Posto (Trentaduesimi)' },
  { key: '65_128', label: '65° - 128° Posto (Sessantaquattresimi)' },
  { key: '129_256', label: '129° - 256° Posto' },
  { key: '257_512', label: '257° - 512° Posto' },
  { key: 'other', label: 'Altri piazzamenti (oltre 512°)' },
];

export type TournamentBonusType = 'none' | 'nazionale_categoria' | 'nazionale_open' | 'campionati_italiani';
export type TournamentCategoryLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Tabella Bonus Piazzamento Tornei Nazionali di Categoria (Art. 2.5)
 * Indici array: [1ª Cat/Assoluti, 2ª Cat, 3ª Cat, 4ª Cat, 5ª Cat, 6ª Cat]
 */
export const NATIONAL_CATEGORY_BONUS_TABLE: Record<
  Exclude<PlacementBracketKey, 'none'>,
  [number, number, number, number, number, number]
> = {
  '1': [300, 220, 154, 110, 66, 44],
  '2': [250, 180, 126, 90, 54, 36],
  '3_4': [224, 160, 112, 80, 48, 32],
  '5_8': [196, 140, 98, 70, 42, 28],
  '9_16': [168, 120, 84, 60, 36, 24],
  '17_32': [140, 100, 70, 50, 30, 20],
  '33_64': [112, 80, 56, 40, 24, 16],
  '65_128': [98, 70, 49, 35, 21, 14],
  '129_256': [84, 60, 42, 30, 18, 12],
  '257_512': [70, 50, 35, 25, 15, 10],
  other: [42, 30, 21, 15, 9, 6],
};

/**
 * Tabella Bonus Piazzamento Tornei Nazionali Open di Categoria (4ª, 5ª, 6ª) (Art. 2.5)
 */
export const NATIONAL_OPEN_BONUS_TABLE: Record<
  Exclude<PlacementBracketKey, 'none'>,
  Record<4 | 5 | 6, number>
> = {
  '1': { 4: 28, 5: 20, 6: 14 },
  '2': { 4: 24, 5: 16, 6: 12 },
  '3_4': { 4: 20, 5: 14, 6: 10 },
  '5_8': { 4: 16, 5: 12, 6: 9 },
  '9_16': { 4: 14, 5: 10, 6: 8 },
  '17_32': { 4: 12, 5: 8, 6: 7 },
  '33_64': { 4: 8, 5: 7, 6: 6 },
  '65_128': { 4: 7, 5: 6, 6: 5 },
  '129_256': { 4: 6, 5: 5, 6: 4 },
  '257_512': { 4: 5, 5: 4, 6: 3 },
  other: { 4: 4, 5: 3, 6: 2 },
};

export const FORFEIT_MALUS_POINTS = -80;
export const MIN_SAFEGUARD_RATING = 100;
export const DEFAULT_ELO_K = 160; // A parità di rating (E = 0.5), K=160 produce +80 pt base come nella scala FITeT

export function getSerieCampionatoById(id: string): SerieCampionato | undefined {
  return SERIE_CAMPIONATO.find((s) => s.id === id);
}

export interface SingleMatchInput {
  ratingA: number;
  ratingB: number;
  isWin: boolean;
  eventKey: string; // può essere un SerieCampionato.id (es. 'D1_M') oppure un MatchMultiplierKey
  isMixedGender: boolean;
  femalePlayer: 'A' | 'B';
  kFactor?: number;
}

export interface SingleMatchCalculationResult {
  isChampionshipSerie: boolean;
  serie?: SerieCampionato;
  puntiBaseCampionato: number;
  bonusInattesoCampionato: number;
  effectiveRatingA: number;
  effectiveRatingB: number;
  ratingDiff: number; // effectiveRatingA - effectiveRatingB
  expectedScoreA: number; // E in [0, 1]
  baseDelta: number; // K * (S - E) oppure puntiBase + bonusInatteso
  eventMultiplier: number;
  mixedGenderMultiplier: number;
  effectiveDelta: number;
}

/**
 * Calcola la variazione punti di una singola partita:
 * - Se `eventKey` corrisponde a una serie in `SERIE_CAMPIONATO`, applica la Logica di Calcolo Vittoria Campionato:
 *   Punti Base (dalla serie) + Bonus Vittoria Inattesa: min(120, max(0, round(0.10 * (puntiB - puntiA)))) se puntiB > puntiA.
 * - Altrimenti applica la formula EloTT con il moltiplicatore della manifestazione individuale.
 */
export function calculateSingleMatchElo(input: SingleMatchInput): SingleMatchCalculationResult {
  const rawA = Math.max(0, Number(input.ratingA) || 0);
  const rawB = Math.max(0, Number(input.ratingB) || 0);

  // Se incontro tra sessi differenti: il punteggio base della donna va ridotto a × 0.75 ai fini del calcolo dello scarto
  const effectiveRatingA =
    input.isMixedGender && input.femalePlayer === 'A' ? rawA * 0.75 : rawA;
  const effectiveRatingB =
    input.isMixedGender && input.femalePlayer === 'B' ? rawB * 0.75 : rawB;

  const ratingDiff = effectiveRatingA - effectiveRatingB;
  const expectedScoreA = 1 / (1 + Math.pow(10, (effectiveRatingB - effectiveRatingA) / 400));
  const mixedGenderMultiplier = input.isMixedGender ? 0.5 : 1.0;

  const serie = getSerieCampionatoById(input.eventKey);
  if (serie) {
    if (input.isWin) {
      const puntiBaseCampionato = serie.puntiBase;
      const bonusInattesoCampionato =
        effectiveRatingB > effectiveRatingA
          ? Math.min(120, Math.max(0, Math.round(0.1 * (effectiveRatingB - effectiveRatingA))))
          : 0;
      const effectiveDelta = puntiBaseCampionato + bonusInattesoCampionato;

      return {
        isChampionshipSerie: true,
        serie,
        puntiBaseCampionato,
        bonusInattesoCampionato,
        effectiveRatingA,
        effectiveRatingB,
        ratingDiff,
        expectedScoreA,
        baseDelta: effectiveDelta,
        eventMultiplier: 1.0,
        mixedGenderMultiplier: 1.0,
        effectiveDelta,
      };
    } else {
      return {
        isChampionshipSerie: true,
        serie,
        puntiBaseCampionato: 0,
        bonusInattesoCampionato: 0,
        effectiveRatingA,
        effectiveRatingB,
        ratingDiff,
        expectedScoreA,
        baseDelta: 0,
        eventMultiplier: 1.0,
        mixedGenderMultiplier: 1.0,
        effectiveDelta: 0,
      };
    }
  }

  // Modalità Torneo Individuale (EloTT)
  const k = input.kFactor ?? DEFAULT_ELO_K;
  const actualScore = input.isWin ? 1 : 0;
  const baseDelta = k * (actualScore - expectedScoreA);

  const eventObj =
    MATCH_EVENT_OPTIONS.find((opt) => opt.key === input.eventKey) ||
    MATCH_EVENT_OPTIONS[2]; // default 1.0
  const eventMultiplier = eventObj.multiplier;

  const rawEffective = baseDelta * eventMultiplier * mixedGenderMultiplier;
  const effectiveDelta = Math.round(rawEffective);

  return {
    isChampionshipSerie: false,
    puntiBaseCampionato: 0,
    bonusInattesoCampionato: 0,
    effectiveRatingA,
    effectiveRatingB,
    ratingDiff,
    expectedScoreA,
    baseDelta,
    eventMultiplier,
    mixedGenderMultiplier,
    effectiveDelta,
  };
}

export interface BonusMalusInput {
  tournamentType: TournamentBonusType;
  categoryLevel: TournamentCategoryLevel;
  placement: PlacementBracketKey;
  weightFactor: number; // da 0.5 a 1.0 (default 1.0, ignorato per Campionati Italiani e Open)
  forfeitsCount: number; // numero rinunce/espulsioni (-80 pt ciascuna)
}

export interface BonusMalusResult {
  rawPlacementBonus: number;
  appliedWeightFactor: number;
  placementBonus: number;
  forfeitMalus: number;
  netBonusMalus: number;
}

/**
 * Calcola il Bonus Piazzamento (Art. 2.5) e il Malus Rinunce/Espulsioni (Art. 2.6)
 */
export function calculateBonusAndMalus(input: BonusMalusInput): BonusMalusResult {
  let rawPlacementBonus = 0;
  let appliedWeightFactor = 1.0;

  if (input.tournamentType !== 'none' && input.placement !== 'none') {
    if (
      input.tournamentType === 'nazionale_categoria' ||
      input.tournamentType === 'campionati_italiani'
    ) {
      const row = NATIONAL_CATEGORY_BONUS_TABLE[input.placement];
      const catIndex = Math.min(5, Math.max(0, input.categoryLevel - 1));
      rawPlacementBonus = row ? row[catIndex] : 0;

      if (input.tournamentType === 'nazionale_categoria') {
        appliedWeightFactor = Math.min(1.0, Math.max(0.5, Number(input.weightFactor) || 1.0));
      } else {
        appliedWeightFactor = 1.0;
      }
    } else if (input.tournamentType === 'nazionale_open') {
      const openRow = NATIONAL_OPEN_BONUS_TABLE[input.placement];
      const openCat: 4 | 5 | 6 =
        input.categoryLevel >= 4 && input.categoryLevel <= 6
          ? (input.categoryLevel as 4 | 5 | 6)
          : 4;
      rawPlacementBonus = openRow ? openRow[openCat] : 0;
      appliedWeightFactor = 1.0;
    }
  }

  const placementBonus = Math.round(rawPlacementBonus * appliedWeightFactor);
  const forfeits = Math.max(0, Math.floor(Number(input.forfeitsCount) || 0));
  const forfeitMalus = forfeits * FORFEIT_MALUS_POINTS;
  const netBonusMalus = placementBonus + forfeitMalus;

  return {
    rawPlacementBonus,
    appliedWeightFactor,
    placementBonus,
    forfeitMalus,
    netBonusMalus,
  };
}

/**
 * Applica la soglia minima di salvaguardia di 100 punti (Art. 2.8)
 */
export function applySafeguardRating(initialRating: number, totalDelta: number): {
  rawFinalRating: number;
  finalRating: number;
  safeguardApplied: boolean;
} {
  const rawFinalRating = (Number(initialRating) || 0) + totalDelta;
  const finalRating = Math.max(MIN_SAFEGUARD_RATING, rawFinalRating);
  return {
    rawFinalRating,
    finalRating,
    safeguardApplied: rawFinalRating < MIN_SAFEGUARD_RATING,
  };
}

/**
 * Rileva automaticamente il sesso ('M' | 'F' | null) dai dati della scheda atleta FITeT
 */
export function detectAthleteGender(detail: DettaglioAtleta | null | undefined): 'M' | 'F' | null {
  if (!detail) return null;

  const checkStr = (str?: string | null): 'M' | 'F' | null => {
    if (!str) return null;
    const s = str.toLowerCase();
    if (/\bfemminil[ei]\b|\bdonne\b|\bgirls?\b|\bsingolare\s*f\b|\bsettore\s*f\b/.test(s)) {
      return 'F';
    }
    if (/\bmaschil[ei]\b|\buomini\b|\bboys?\b|\bsingolare\s*m\b|\bsettore\s*m\b/.test(s)) {
      return 'M';
    }
    return null;
  };

  const fromSettore = checkStr(detail.anagrafica?.settore);
  if (fromSettore) return fromSettore;

  const fromCategoria = checkStr(detail.anagrafica?.categoria);
  if (fromCategoria) return fromCategoria;

  if (detail.campionatoAttuale) {
    const fromCam =
      checkStr(detail.campionatoAttuale.nome) || checkStr(detail.campionatoAttuale.categoria);
    if (fromCam) return fromCam;
  }
  if (detail.campionatiGiocati) {
    for (const c of detail.campionatiGiocati) {
      const g = checkStr(c.nome) || checkStr(c.categoria);
      if (g) return g;
    }
  }

  if (detail.partiteRanking?.tornei) {
    for (const t of detail.partiteRanking.tornei) {
      const g = checkStr(t.gara);
      if (g) return g;
    }
  }

  return null;
}

/**
 * Effettua il match di una stringa campionato/serie (es. "SERIE D1 MASCHILE", "C2", "Serie B Femminile")
 * con una delle serie configurate in SERIE_CAMPIONATO.
 */
export function matchSerieCampionatoFromString(
  rawStr?: string | null,
  genderHint?: 'M' | 'F' | null
): string | null {
  if (!rawStr) return null;
  const trimmed = rawStr.trim();
  if (!trimmed) return null;

  // Match diretto su id o label
  const direct = SERIE_CAMPIONATO.find(
    (s) =>
      s.id.toLowerCase() === trimmed.toLowerCase() ||
      s.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (direct) return direct.id;

  const s = trimmed.toUpperCase();

  // 1. Paralimpico
  if (/PARALIMP/.test(s)) {
    if (/\bA[\s\/\-]*1\b/.test(s)) return 'A1_PARA';
    if (/\bA[\s\/\-]*2\b/.test(s)) return 'A2_PARA';
    if (/\bB\b/.test(s)) return 'B_PARA';
  }

  // 2. Veterani / Master
  if (/VETERAN|MASTER/.test(s)) {
    if (/\bA[\s\/\-]*[12]?\b/.test(s)) return 'VET_A1';
    if (/\bB\b/.test(s)) return 'VET_B';
  }

  // 3. Giovanile
  if (/GIOVANIL/.test(s)) {
    if (/NAZ/.test(s)) return 'GIOV_NAZ';
    return 'GIOV_REG';
  }

  // Determina se il nome del campionato indica esplicitamente una serie femminile
  // (in un campionato misto/maschile anche l'atleta donna prende i punti base di quella serie)
  const isFemale =
    /FEMMINIL|\bDONNE\b|\bSERIE\s+[ABC][\s\/\-]*[12]?\s*F\b|\b[ABC][\s\/\-]*[12]?\s*F\b|\b[ABC][\s\/\-]*[12]?\s*FEMM/.test(
      s
    );

  if (isFemale) {
    if (/\bA[\s\/\-]*1\b/.test(s)) return 'A1_F';
    if (/\bA[\s\/\-]*2\b/.test(s)) return 'A2_F';
    if (/\bB\b/.test(s)) return 'B_F';
    if (/\bC\b/.test(s)) return 'C_F';
  }

  // 4. Maschile / Generale (supporta sia "D1", "D 1", "D/1", "D-1")
  if (/\bA[\s\/\-]*1\b/.test(s)) return 'A1_M';
  if (/\bA[\s\/\-]*2\b/.test(s)) return 'A2_M';
  if (/\bB[\s\/\-]*1\b/.test(s)) return 'B1_M';
  if (/\bB[\s\/\-]*2\b/.test(s)) return 'B2_M';
  if (/\bC[\s\/\-]*1\b/.test(s)) return 'C1_M';
  if (/\bC[\s\/\-]*2\b/.test(s)) return 'C2_M';
  if (/\bD[\s\/\-]*1\b/.test(s)) return 'D1_M';
  if (/\bD[\s\/\-]*2\b/.test(s)) return 'D2_M';
  if (/\bD[\s\/\-]*3\b/.test(s)) return 'D3_M';
  if (/\bD[\s\/\-]*4\b/.test(s)) return 'D4_M';

  // Eventuali B o C senza "1/2" (es. "Serie B - B Gir.A" o "C FEMMINILE")
  if (/\bSERIE\s+B\b|\bB\s+GIR/i.test(s)) return isFemale || genderHint === 'F' ? 'B_F' : 'B2_M';
  if (/\bSERIE\s+C\b|\bC\s+GIR/i.test(s)) return isFemale || genderHint === 'F' ? 'C_F' : 'C2_M';

  return null;
}

/**
 * Estrae automaticamente l'ID della serie (da SERIE_CAMPIONATO) dal payload dell'atleta
 */
export function detectAthleteSerieCampionato(
  detail?: DettaglioAtleta | null,
  fallbackCampionati?: CampionatoAttualeInfo[] | null
): string | null {
  const gender = detectAthleteGender(detail);

  const candidates: Array<string | undefined | null> = [];

  if (detail?.campionatoAttuale) {
    candidates.push(detail.campionatoAttuale.categoria);
    candidates.push(detail.campionatoAttuale.nome);
  }

  if (detail?.campionatiGiocati && detail.campionatiGiocati.length > 0) {
    for (const c of detail.campionatiGiocati) {
      candidates.push(c.categoria);
      candidates.push(c.nome);
    }
  }

  if (fallbackCampionati && fallbackCampionati.length > 0) {
    for (const c of fallbackCampionati) {
      candidates.push(c.categoria);
      candidates.push(c.nome);
    }
  }

  if (detail?.partiteRanking?.campionato && detail.partiteRanking.campionato.length > 0) {
    for (const p of detail.partiteRanking.campionato) {
      candidates.push(p.campionato);
    }
  }

  for (const raw of candidates) {
    const matched = matchSerieCampionatoFromString(raw, gender);
    if (matched) return matched;
  }

  return null;
}

/**
 * Estrae il punteggio attuale più aggiornato di un atleta dalla sua scheda DettaglioAtleta
 */
export function extractAthleteCurrentPoints(detail: DettaglioAtleta | null | undefined): number {
  if (!detail) return 0;

  const storico = detail.storicoClassifica || [];
  const last = storico.length > 0 ? storico[storico.length - 1] : null;

  let pts = detail.anagrafica?.punti ?? 0;
  if (pts < 10 && last?.punti && last.punti >= 100) {
    pts = last.punti;
  }
  if (pts > 0) {
    return Math.round(pts);
  }

  if (detail.riepilogo?.punteggioFinale && detail.riepilogo.punteggioFinale > 0) {
    const fin = detail.riepilogo.punteggioFinale;
    return Math.round(fin < 10 && last?.punti && last.punti >= 100 ? last.punti : fin);
  }

  if (detail.partiteRanking?.dettaglioPunti?.finali && detail.partiteRanking.dettaglioPunti.finali > 0) {
    return Math.round(detail.partiteRanking.dettaglioPunti.finali);
  }

  if (last?.punti && last.punti > 0) {
    return Math.round(last.punti);
  }

  if (detail.riepilogo?.puntiIniziali && detail.riepilogo.puntiIniziali > 0) {
    const init = detail.riepilogo.puntiIniziali;
    return Math.round(init < 10 && last?.punti && last.punti >= 100 ? init * 1000 : init);
  }

  return 0;
}
