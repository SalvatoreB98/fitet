import {
  DashboardData,
  DettaglioAtleta,
  RefertoIncontro,
  DettaglioPartitaIndividuale,
  ChampionshipItem,
  DettaglioSquadra,
  AthleteSearchResult,
  AtletaCampionatoPartiteResponse,
  HeadToHeadData,
  RankingPageResult,
} from '../types/fitet';

const API_BASE = '/api';

export async function fetchCampionati(refresh = false): Promise<ChampionshipItem[]> {
  const url = `${API_BASE}/campionati${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento elenco campionati (${res.status})`);
  }
  return res.json();
}

export async function fetchDashboard(cam: number, anno = 41, refresh = false): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (cam) params.set('cam', String(cam));
  if (anno) params.set('anno', String(anno));
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/dashboard?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento dashboard (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAtleta(id: string, refresh = false): Promise<DettaglioAtleta> {
  const url = `${API_BASE}/atleta/${encodeURIComponent(id)}${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento scheda atleta (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReferto(
  incontroId: string,
  cam?: number | string,
  formula = 19,
  refresh = false
): Promise<RefertoIncontro> {
  const params = new URLSearchParams();
  if (cam) params.set('cam', String(cam));
  if (formula) params.set('formula', String(formula));
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/referto/${incontroId}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento referto gara (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchDettaglioPartita(
  partitaId: string,
  refresh = false
): Promise<DettaglioPartitaIndividuale> {
  const url = `${API_BASE}/partita/${partitaId}${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento dettaglio partita (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function refreshAll(cam: number, anno = 41): Promise<{ success: boolean; timestamp: string }> {
  const res = await fetch(`${API_BASE}/refresh?cam=${cam}&anno=${anno}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Errore refresh dati: ${res.statusText}`);
  }
  return res.json();
}

export async function searchAtleti(query: string): Promise<AthleteSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await fetch(`${API_BASE}/search-atleta?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSquadra(
  squadraId: string,
  cam?: number | string,
  anno = 41,
  refresh = false
): Promise<DettaglioSquadra> {
  const params = new URLSearchParams();
  if (cam) params.set('cam', String(cam));
  if (anno) params.set('anno', String(anno));
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/squadra/${encodeURIComponent(squadraId)}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento scheda squadra (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAtletaCampionatoPartite(
  atletaId: string,
  cam: string | number,
  squadraId?: string,
  atletaNome?: string
): Promise<AtletaCampionatoPartiteResponse> {
  const params = new URLSearchParams({
    atletaId,
    cam: String(cam),
  });
  if (squadraId) params.append('squadraId', squadraId);
  if (atletaNome) params.append('atletaNome', atletaNome);
  const res = await fetch(`${API_BASE}/atleta-campionato-partite?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Errore caricamento partite campionato (${res.status})`);
  }
  return res.json();
}

export async function fetchHeadToHead(
  atleta1: string,
  atleta2: string,
  idClass = 247
): Promise<HeadToHeadData> {
  const params = new URLSearchParams({
    atleta1,
    atleta2,
    idClass: String(idClass),
  });
  const res = await fetch(`${API_BASE}/head-to-head?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Errore caricamento testa a testa (${res.status})`);
  }
  return res.json();
}

export async function fetchRanking(
  page = 1,
  sesso: 'M' | 'F' = 'M',
  comit?: string | number,
  refresh = false
): Promise<RankingPageResult> {
  const params = new URLSearchParams({
    page: String(page),
    sesso,
  });
  if (comit && String(comit) !== '0' && String(comit) !== 'all') {
    params.set('comit', String(comit));
  }
  if (refresh) {
    params.set('refresh', 'true');
  }
  const res = await fetch(`${API_BASE}/ranking?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Errore caricamento classifica (${res.status})`);
  }
  return res.json();
}



