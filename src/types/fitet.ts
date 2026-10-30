export interface SquadraClassifica {
  posizione: number;
  squadraId: string;
  nome: string;
  logoUrl?: string;
  punti: number;
  incontriDisputati: number;
  incontriVinti: number;
  incontriPareggiati: number;
  incontriPersi: number;
  partiteVinte: number;
  partitePerse: number;
  diffPartite: number;
  setVinti: number;
  setPersi: number;
  diffSet: number;
  puntiVinti: number;
  puntiPersi: number;
  diffPunti: number;
  penalizzazioni: number;
  isPromozione: boolean;
  isPlayoff: boolean;
  isRetrocessione: boolean;
  forma: Array<'V' | 'P' | 'N'>;
}

export interface AtletaSquadraDettaglio {
  atletaId: string;
  nome: string;
  isDoppio: boolean;
  rankText: string;
  rankPosizione: number | null;
  rankPunti: number | null;
  partiteDisputate: number;
  partiteVinte: number;
  partitePerse: number;
  setVinti: number;
  setPersi: number;
  puntiVinti: number;
  puntiPersi: number;
  percentualeVittorie: number;
  fotoUrl: string | null;
}

export interface DettaglioSquadra {
  squadraId: string;
  camId: number;
  nome: string;
  logoUrl?: string;
  atleti: AtletaSquadraDettaglio[];
}


export interface PartitaCalendario {
  id: string;
  giornata: number;
  tipo: 'andata' | 'ritorno';
  data: string;
  ora: string;
  squadraCasa: string;
  squadraOspite: string;
  risultato: string;
  puntiCasa: number | null;
  puntiOspite: number | null;
  disputato: boolean;
  refertoUrl: string | null;
  incontroId: string | null;
  vincitore: 'casa' | 'ospite' | 'pareggio' | null;
  formula?: number;
}

export interface ChampionshipItem {
  id: number;
  nome: string;
  categoria: string;
  regione: string;
  regioneId?: number;
  anno?: number;
  formula?: number;
  sesso?: 'M' | 'F';
}

export interface GiornataCalendario {
  numero: number;
  titolo: string;
  partiteAndata: PartitaCalendario[];
  partiteRitorno: PartitaCalendario[];
}

export interface SetScore {
  setNumero: number;
  puntiCasa: number;
  puntiOspite: number;
}

export interface PartitaRefertoIndividuale {
  id: string;
  numero: number;
  atletaCasa: string;
  atletaOspite: string;
  isCasaWinner: boolean;
  isOspiteWinner: boolean;
  sets: SetScore[];
  setVintiCasa: number;
  setVintiOspite: number;
}

export interface RefertoIncontro {
  incontroId: string;
  camId?: string;
  formulaId?: string;
  giornata: string;
  arbitro?: string;
  campoGara?: string;
  squadraCasa: {
    nome: string;
    logoUrl?: string;
    punti: number;
    setTotali: number;
    puntiTotali: number;
  };
  squadraOspite: {
    nome: string;
    logoUrl?: string;
    punti: number;
    setTotali: number;
    puntiTotali: number;
  };
  partite: PartitaRefertoIndividuale[];
}

export interface DettaglioPartitaIndividuale {
  id: string;
  atletaCasa: {
    nome: string;
    bandieraUrl?: string;
    fotoUrl?: string;
    atletaId?: string;
  };
  atletaOspite: {
    nome: string;
    bandieraUrl?: string;
    fotoUrl?: string;
    atletaId?: string;
  };
  risultatoSet: string;
  puntiTotali: string;
  sets: Array<{
    setNumero: number;
    puntiCasa: number;
    puntiOspite: number;
  }>;
}


export interface StatisticaAtleta {
  posizione?: number;
  nazionalita: string;
  bandieraUrl: string;
  atleta: string;
  atletaId: string | null;
  squadra: string;
  incontriDisputati: number;
  partiteDisputate: number;
  partiteVinte: number;
  partitePerse: number;
  setVinti: number;
  setPersi: number;
  puntiVinti: number;
  puntiPersi: number;
  percentualeVittorie: number;
}

export interface StoricoRankingSnapshot {
  data: string;
  punti: number;
  posizione: number | null;
  categoria: string;
}

export interface PartitaRankingCampionato {
  data: string;
  campionato: string;
  punti: number;
  risultato: string;
  isVittoria: boolean;
  avversario: string;
  avversarioId?: string;
  risultatoSet?: string;
  sesso?: string;
  stato?: string;
}

export interface PartitaRankingTorneo {
  data: string;
  torneo: string;
  gara: string;
  avversario: string;
  avversarioId?: string;
  risultatoSet?: string;
  fase?: string;
  risultato: string;
  isVittoria: boolean;
  stato?: string;
  isDiscarded?: boolean;
}

export interface DettaglioPuntiRanking {
  puntiIniziali?: number;
  campionato?: number;
  tornei?: number;
  vittorieTornei?: number;
  protezione?: number;
  finali?: number;
}

export interface PartiteRankingAtleta {
  campionato: PartitaRankingCampionato[];
  tornei: PartitaRankingTorneo[];
  dettaglioPunti?: DettaglioPuntiRanking;
  rawSubtle?: string;
}

export interface CampionatoAttualeInfo {
  camId: number;
  nome: string;
  categoria?: string;
  regione?: string;
  squadra?: string;
}

export interface DettaglioAtleta {
  id: string;
  anagrafica: {
    nome: string;
    nazionalita: string;
    bandieraUrl: string;
    fotoId: string;
    fotoUrl: string;
    dataNascita: string;
    luogoNascita?: string;
    settore: string;
    societa: string;
    regione: string;
    categoria: string;
    punti: number;
    stato: string;
    recordClassifica?: string;
    logoUrl?: string;
  };
  riepilogo: {
    puntiIniziali: number;
    puntiInizialiData: string;
    puntiTotali: number;
    punteggioFinale: number;
    partiteGiocate: number;
    partiteVinte: number;
    partitePerse: number;
    percentualePositiva: number;
  };
  storicoClassifica: StoricoRankingSnapshot[];
  partiteRanking?: PartiteRankingAtleta;
  campionatoAttuale?: CampionatoAttualeInfo;
  campionatiGiocati?: CampionatoAttualeInfo[];
}

export interface ChampionshipInfo {
  id: number;
  anno: number;
  nome: string;
  girone: string;
  regione: string;
  categoria?: string;
}

export interface DashboardData {
  classifica: SquadraClassifica[];
  calendario: GiornataCalendario[];
  statisticheAtleti: StatisticaAtleta[];
  lastUpdated: string;
  championship: ChampionshipInfo;
}

export interface AthleteSearchResult {
  id: string;
  value: string;
  label: string;
  dataNascita?: string | null;
  tessera?: string | null;
  fotoUrl?: string | null;
}

export interface PartitaCampionatoAtleta {
  giornata: number;
  avversario: string;
  squadra: string;
  setVinti: number;
  setPersi: number;
  risultatoSet: string;
  sets: string[];
  isVittoria: boolean;
}

export interface AtletaCampionatoPartiteResponse {
  camId: string;
  campionatoNome?: string;
  squadra?: string;
  matches: PartitaCampionatoAtleta[];
  error?: string;
}

export interface HeadToHeadIncontro {
  anno: string;
  data: string;
  gara: string;
  vincente: string;
  punteggio: string;
  setAtleta1: number;
  setAtleta2: number;
  isVittoriaAtleta1: boolean;
}

export interface HeadToHeadData {
  atleta1: {
    id: string;
    nome: string;
    vittorie: number;
    fotoUrl?: string;
  };
  atleta2: {
    id: string;
    nome: string;
    vittorie: number;
    fotoUrl?: string;
  };
  totaleIncontri: number;
  incontri: HeadToHeadIncontro[];
}

export interface RankingAthleteItem {
  rank: number;
  hasOfficialRank?: boolean;
  atletaId: string;
  nome: string;
  dataNascita: string;
  settore: string;
  punti: number;
  posNazOrVariazione: string;
  provinciaOrRegione: string;
  categoria: string;
}

export interface RankingPageResult {
  title: string;
  sesso: 'M' | 'F';
  isRegionale: boolean;
  comitId?: number;
  totalAthletes: number;
  totalPages: number;
  currentPage: number;
  athletes: RankingAthleteItem[];
  category?: string;
}

export * from '../constants/rankingCategories';

export interface TorneoCategoryOption {
  key: string;
  label: string;
  shortLabel: string;
  group: 'top' | 'open' | 'nazionali' | 'regionali';
  tor: number;
  comit: number;
  id: number;
  icon: string;
  description: string;
}

export interface TorneoItem {
  idt: number;
  anno: number;
  com: number;
  tipo: number;
  data: string;
  luogo: string;
  regione?: string;
  regioneId?: number;
  status: 'disputato' | 'in_programma';
  href: string;
  categoriaKey?: string;
  categoriaLabel?: string;
}

export interface TorneoSectionResult {
  key: string;
  title: string;
  shortLabel: string;
  tor: number;
  comit: number;
  id: number;
  reg?: number;
  regioneNome?: string;
  tornei: TorneoItem[];
  availableRegions?: Array<{ regId: number; name: string; tor: number; id: number; comit: number }>;
}

export interface TorneiResponse {
  title: string;
  categoryKey: string;
  comitId: number;
  regId?: number;
  sections: TorneoSectionResult[];
  totalTornei: number;
  lastUpdated: string;
}

export interface TorneoGaraLink {
  garaId: string;
  nome: string;
  anno: number;
  idt: number;
  com: number;
  isDoppio: boolean;
  mode: 'risultati' | 'iscrizioni';
}

export interface TorneoDettaglioResponse {
  idt: number;
  com: number;
  anno: number;
  titolo: string;
  sottotitolo: string;
  status: 'disputato' | 'in_programma';
  pdfSinteticoUrl: string | null;
  tabelloniHomeUrl: string | null;
  gare: TorneoGaraLink[];
}

export interface TorneoIscrittoItem {
  posizione: number;
  nome: string;
  atletaId?: string | null;
  punti: string;
  societa: string;
  statusClass: string;
  statusLabel: string;
}

export interface TorneoMatchItem {
  atleta1: string;
  atleta1Id?: string | null;
  societa1: string;
  atleta2: string;
  atleta2Id?: string | null;
  societa2: string;
  set1: number;
  set2: number;
  sets: Array<{ p1: number; p2: number }>;
  vincitore: 1 | 2 | null;
}

export interface TorneoGironeItem {
  numero: string;
  partite: TorneoMatchItem[];
  classifica: Array<{
    posizione: number;
    nome: string;
    atletaId?: string | null;
    societa: string;
    punti: number;
    giocate: number;
    vinte: number;
    perse: number;
    setVinti: number;
    setPersi: number;
  }>;
}

export interface TorneoGaraDettaglioResponse {
  idt: number;
  com: number;
  garaId: string;
  anno: number;
  titoloGara: string;
  mode: 'risultati' | 'iscrizioni';
  isDoppio: boolean;
  vincitore?: string | null;
  vincitoreId?: string | null;
  vincitoreFotoUrl?: string | null;
  valoreRanking?: string | null;
  maxIscritti?: string | null;
  iscritti: TorneoIscrittoItem[];
  gironiRanges: Array<{ cod1: number; cod2: number; label: string }>;
  activeGironiRange?: { cod1: number; cod2: number } | null;
  gironi: TorneoGironeItem[];
  turniTabellone: Array<{ tab: number; turno: number; label: string }>;
  activeTurno?: { tab: number; turno: number; label: string } | null;
  partiteTabellone: TorneoMatchItem[];
  allTurniTabellone?: Array<{ tab: number; turno: number; label: string; matches: TorneoMatchItem[] }>;
}



