import { DashboardData, DettaglioAtleta, RefertoIncontro, DettaglioPartitaIndividuale } from '../types/fitet';

const API_BASE = '/api';

export async function fetchDashboard(refresh = false): Promise<DashboardData> {
  const url = `${API_BASE}/dashboard${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento dashboard (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAtleta(id: string, refresh = false): Promise<DettaglioAtleta> {
  const url = `${API_BASE}/atleta/${id}${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore caricamento scheda atleta (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReferto(
  incontroId: string,
  cam = 1902,
  formula = 19,
  refresh = false
): Promise<RefertoIncontro> {
  const url = `${API_BASE}/referto/${incontroId}?cam=${cam}&formula=${formula}${refresh ? '&refresh=true' : ''}`;
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

export async function refreshAll(): Promise<{ success: boolean; timestamp: string }> {
  const res = await fetch(`${API_BASE}/refresh`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Errore refresh dati: ${res.statusText}`);
  }
  return res.json();
}

export async function searchAtleti(query: string): Promise<Array<{ id: string; value: string; label: string }>> {
  if (!query || query.length < 2) return [];
  const res = await fetch(`${API_BASE}/search-atleta?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json();
}

