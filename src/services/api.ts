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
import { saveVenueCache, getVenueCache, VenueCacheEntry } from '../utils/venueCache';
import { notifyVenueFallback, notifyVenueSyncSuccess } from '../utils/useNetworkStatus';

const API_BASE = '/api';
const DEFAULT_TIMEOUT_MS = 6500; // 6.5s timeout: crucial for basement gyms with weak signal

/**
 * Esegue una richiesta HTTP con timeout e fallback trasparente
 * sulla cache locale per palestre ("Weak Venue Connection")
 */
async function fetchWithVenueFallback<T>(
  url: string,
  cacheKey: string,
  cacheType: VenueCacheEntry<T>['type'],
  label?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  forceRefresh = false
): Promise<T> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  // 1. Se siamo offline e non è richiesto un force-refresh manuale, usa subito la cache
  if (isOffline && !forceRefresh) {
    const cached = getVenueCache<T>(cacheKey);
    if (cached) {
      notifyVenueFallback(cached.cachedTimeFormatted);
      return cached.data;
    }
  }

  // 2. Tenta la richiesta di rete con timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      saveVenueCache(cacheKey, data, cacheType, label);
      notifyVenueSyncSuccess();
      return data;
    }

    // Se il server ha restituito errore (es. 500, 502, 504 gateway timeout tipico del proxy FITeT)
    throw new Error(`Errore server HTTP (${res.status})`);
  } catch (err: any) {
    clearTimeout(timeoutId);

    // 3. Fallback sulla cache della palestra se disponibile
    const cached = getVenueCache<T>(cacheKey);
    if (cached) {
      console.warn(`[WeakVenueConnection] Connessione debole o assente. Utilizzo dati cache per ${cacheKey}`);
      notifyVenueFallback(cached.cachedTimeFormatted);
      return cached.data;
    }

    // Nessuna cache salvata: rilancia l'errore
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout
      ? 'Connessione debole in palestra: la richiesta è scaduta (timeout) e nessun dato è presente in memoria'
      : isOffline
      ? 'Connessione assente (offline): nessun dato salvato precedentemente per questa visualizzazione'
      : err.message || 'Errore di rete';

    throw new Error(message);
  }
}

export async function fetchCampionati(refresh = false): Promise<ChampionshipItem[]> {
  const url = `${API_BASE}/campionati${refresh ? '?refresh=true' : ''}`;
  return fetchWithVenueFallback<ChampionshipItem[]>(
    url,
    'catalog_campionati',
    'campionati',
    'Elenco Campionati FITeT',
    DEFAULT_TIMEOUT_MS,
    refresh
  );
}

export async function fetchDashboard(cam: number, anno = 41, refresh = false): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (cam) params.set('cam', String(cam));
  if (anno) params.set('anno', String(anno));
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/dashboard?${params.toString()}`;

  return fetchWithVenueFallback<DashboardData>(
    url,
    `dashboard_${cam}_${anno}`,
    'dashboard',
    `Campionato #${cam}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
}

export async function fetchAtleta(id: string, refresh = false): Promise<DettaglioAtleta> {
  const url = `${API_BASE}/atleta/${encodeURIComponent(id)}${refresh ? '?refresh=true' : ''}`;
  return fetchWithVenueFallback<DettaglioAtleta>(
    url,
    `atleta_${id}`,
    'atleta',
    `Atleta #${id}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
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

  return fetchWithVenueFallback<RefertoIncontro>(
    url,
    `referto_${incontroId}`,
    'referto',
    `Referto Incontro #${incontroId}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
}

export async function fetchDettaglioPartita(
  partitaId: string,
  refresh = false
): Promise<DettaglioPartitaIndividuale> {
  const url = `${API_BASE}/partita/${partitaId}${refresh ? '?refresh=true' : ''}`;
  return fetchWithVenueFallback<DettaglioPartitaIndividuale>(
    url,
    `partita_${partitaId}`,
    'referto',
    `Partita #${partitaId}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
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
  try {
    const res = await fetch(`${API_BASE}/search-atleta?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Ricerca atleti tramite il form ufficiale FITeT "scelta_atleta.php",
 * usato dal confronto Testa a Testa. Se non disponibile, usa l'autocomplete classico.
 */
export async function searchAtletiScelta(
  query: string,
  excludeId?: string
): Promise<AthleteSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed });
  if (excludeId) params.set('excludeId', excludeId);

  try {
    const res = await fetch(`${API_BASE}/search-atleta-scelta?${params.toString()}`);
    if (!res.ok) throw new Error(`Errore ricerca atleti (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return searchAtleti(trimmed);
  }
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

  return fetchWithVenueFallback<DettaglioSquadra>(
    url,
    `squadra_${squadraId}_${cam || 0}`,
    'squadra',
    `Squadra #${squadraId}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
}

export async function fetchAtletaCampionatoPartite(
  atletaId: string,
  cam: string | number,
  squadraId?: string,
  atletaNome?: string,
  force = false
): Promise<AtletaCampionatoPartiteResponse> {
  const params = new URLSearchParams({
    atletaId,
    cam: String(cam),
  });
  if (squadraId) params.append('squadraId', squadraId);
  if (atletaNome) params.append('atletaNome', atletaNome);
  if (force) params.append('force', 'true');
  const url = `${API_BASE}/atleta-campionato-partite?${params.toString()}`;

  return fetchWithVenueFallback<AtletaCampionatoPartiteResponse>(
    url,
    `partite_${atletaId}_${cam}`,
    'atleta',
    `Partite ${atletaNome || atletaId}`,
    DEFAULT_TIMEOUT_MS,
    force
  );
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
  const url = `${API_BASE}/head-to-head?${params.toString()}`;

  return fetchWithVenueFallback<HeadToHeadData>(
    url,
    `h2h_${atleta1}_${atleta2}`,
    'atleta',
    `H2H ${atleta1} vs ${atleta2}`,
    DEFAULT_TIMEOUT_MS,
    false
  );
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
  const url = `${API_BASE}/ranking?${params.toString()}`;

  return fetchWithVenueFallback<RankingPageResult>(
    url,
    `ranking_${sesso}_${comit || 'naz'}_p${page}`,
    'ranking',
    `Classifica ${sesso} p.${page}`,
    DEFAULT_TIMEOUT_MS,
    refresh
  );
}

/**
 * Salva in anticipo tutti i dati del campionato e delle squadre per la consultazione offline in palestra
 */
export async function preCacheChampionshipForVenue(
  camId: number,
  annoId = 41,
  onProgress?: (step: string, percent: number) => void
): Promise<void> {
  try {
    onProgress?.('Caricamento dati campionato...', 20);
    const dashboard = await fetchDashboard(camId, annoId, false);

    onProgress?.('Salvataggio classifica e calendario...', 50);
    saveVenueCache(`dashboard_${camId}_${annoId}`, dashboard, 'dashboard', dashboard.championship?.nome);

    // Pre-carica schede squadre
    const squadre = dashboard.classifica || [];
    for (let i = 0; i < Math.min(squadre.length, 8); i++) {
      const sq = squadre[i];
      if (sq.squadraId) {
        onProgress?.(`Salvataggio squadra ${sq.nome}...`, 50 + Math.floor((i / squadre.length) * 45));
        await fetchSquadra(sq.squadraId, camId, annoId, false).catch(() => null);
      }
    }

    onProgress?.('Tutti i dati sono pronti per la palestra!', 100);
  } catch (err: any) {
    console.warn('[PreCache] Errore salvataggio campionato:', err);
    throw err;
  }
}
