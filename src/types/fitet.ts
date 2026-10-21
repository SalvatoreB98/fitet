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
  sesso?: string;
  stato?: string;
}

export interface PartitaRankingTorneo {
  data: string;
  torneo: string;
  gara: string;
  avversario: string;
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
}

export interface ChampionshipInfo {
  id: number;
  anno: number;
  nome: string;
  girone: string;
  regione: string;
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
