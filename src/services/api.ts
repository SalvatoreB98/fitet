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
  RankingCategoryKey,
  TorneiResponse,
  TorneoDettaglioResponse,
  TorneoGaraDettaglioResponse,
} from '../types/fitet';
import { getRankingCategoryByKey } from '../constants/rankingCategories';
import { saveVenueCache, getVenueCache, getVenueCacheAgeMs, VenueCacheEntry } from '../utils/venueCache';
import { notifyVenueFallback, notifyVenueSyncSuccess } from '../utils/useNetworkStatus';

const API_BASE = '/api';
const DEFAULT_TIMEOUT_MS = 6500; // 6.5s timeout: crucial for basement gyms with weak signal

/**
 * Finestra di validità della cache locale: entro questo intervallo i dati
 * vengono restituiti subito da localStorage senza chiamare /api/index.
 * Il refresh manuale (`refresh=true`) ignora sempre questa finestra.
 */
const FRESH_TTL_MS = {
  campionati: 60 * 60 * 1000,
  dashboard: 3 * 60 * 1000,
  atleta: 30 * 60 * 1000,
  referto: 30 * 60 * 1000,
  partita: 30 * 60 * 1000,
  squadra: 15 * 60 * 1000,
  ranking: 15 * 60 * 1000,
  tornei: 10 * 60 * 1000,
  torneoDettaglio: 5 * 60 * 1000,
  torneoGara: 5 * 60 * 1000,
  headToHead: 30 * 60 * 1000,
  partiteCampionato: 10 * 60 * 1000,
} as const;

// Deduplica le richieste identiche lanciate in parallelo (es. più tab montate insieme).
const inFlightRequests = new Map<string, Promise<unknown>>();

// Piccole cache in memoria per le richieste "di servizio" che non passano da
// fetchWithVenueFallback (ricerca atleti, punti iscritti).
const AUX_CACHE_TTL_MS = 5 * 60 * 1000;
const searchResultsCache = new Map<string, { data: AthleteSearchResult[]; timestamp: number }>();
const iscrittiPointsCache = new Map<
  string,
  {
    data: Record<string, { atletaId: string | null; puntiClassificaAttuale: number | null }>;
    timestamp: number;
  }
>();
const iscrittiPointsInFlight = new Map<
  string,
  Promise<Record<string, { atletaId: string | null; puntiClassificaAttuale: number | null }>>
>();
const AUX_CACHE_MAX_ENTRIES = 100;

function readAuxCache<T>(
  cache: Map<string, { data: T; timestamp: number }>,
  key: string
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > AUX_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeAuxCache<T>(
  cache: Map<string, { data: T; timestamp: number }>,
  key: string,
  data: T
): void {
  cache.set(key, { data, timestamp: Date.now() });

  // Evita una crescita illimitata: elimina le voci più vecchie.
  while (cache.size > AUX_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

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
  forceRefresh = false,
  freshTtlMs = 0
): Promise<T> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const cachedEntry = getVenueCache<T>(cacheKey);

  // 1. Cache locale ancora "fresca": nessuna chiamata di rete.
  if (
    !forceRefresh &&
    cachedEntry &&
    freshTtlMs > 0 &&
    getVenueCacheAgeMs(cachedEntry) < freshTtlMs
  ) {
    return cachedEntry.data;
  }

  // 2. Se siamo offline e non è richiesto un force-refresh manuale, usa subito la cache
  if (isOffline && !forceRefresh) {
    if (cachedEntry) {
      notifyVenueFallback(cachedEntry.cachedTimeFormatted);
      return cachedEntry.data;
    }
  }

  // 3. Richiesta identica già in corso: condividi la stessa Promise.
  if (!forceRefresh) {
    const inFlight = inFlightRequests.get(url);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const request = (async (): Promise<T> => {
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

      // 4. Fallback sulla cache della palestra se disponibile
      const cached = getVenueCache<T>(cacheKey);
      if (cached) {
        console.warn(`[WeakVenueConnection] Connessione debole o assente. Utilizzo dati cache per ${cacheKey}`);
        notifyVenueFallback(cached.cachedTimeFormatted);
        return cached.data;
      }

      // Nessuna cache salvata: rilancia l'errore
      const isTimeout = err.name === 'AbortError';
      const message = isTimeout
        ? 'Connessione debole: la richiesta è scaduta (timeout) e nessun dato è presente in memoria'
        : isOffline
          ? 'Connessione assente (offline): nessun dato salvato precedentemente per questa visualizzazione'
          : err.message || 'Errore di rete';

      throw new Error(message);
    }
  })();

  if (forceRefresh) {
    return request;
  }

  const trackedRequest = request.then(
    (value) => {
      inFlightRequests.delete(url);
      return value;
    },
    (error) => {
      inFlightRequests.delete(url);
      throw error;
    }
  );

  inFlightRequests.set(url, trackedRequest);
  return trackedRequest;
}

export async function fetchCampionati(refresh = false): Promise<ChampionshipItem[]> {
  const url = `${API_BASE}/campionati${refresh ? '?refresh=true' : ''}`;
  return fetchWithVenueFallback<ChampionshipItem[]>(
    url,
    'catalog_campionati',
    'campionati',
    'Elenco Campionati FITeT',
    DEFAULT_TIMEOUT_MS,
    refresh,
    FRESH_TTL_MS.campionati
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
    refresh,
    FRESH_TTL_MS.dashboard
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
    refresh,
    FRESH_TTL_MS.atleta
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
    refresh,
    FRESH_TTL_MS.referto
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
    refresh,
    FRESH_TTL_MS.partita
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
  const trimmed = query?.trim() ?? '';
  if (trimmed.length < 2) return [];

  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = readAuxCache(searchResultsCache, cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/search-atleta?q=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results: AthleteSearchResult[] = Array.isArray(data) ? data : [];
    writeAuxCache(searchResultsCache, cacheKey, results);
    return results;
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

  const cacheKey = `scelta:${trimmed.toLowerCase()}:${excludeId || ''}`;
  const cached = readAuxCache(searchResultsCache, cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ q: trimmed });
  if (excludeId) params.set('excludeId', excludeId);

  try {
    const res = await fetch(`${API_BASE}/search-atleta-scelta?${params.toString()}`);
    if (!res.ok) throw new Error(`Errore ricerca atleti (${res.status})`);
    const data = await res.json();
    const results: AthleteSearchResult[] = Array.isArray(data) ? data : [];
    writeAuxCache(searchResultsCache, cacheKey, results);
    return results;
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
    refresh,
    FRESH_TTL_MS.squadra
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
    force,
    FRESH_TTL_MS.partiteCampionato
  );
}

export async function fetchHeadToHead(
  atleta1: string,
  atleta2: string,
  idClass?: number
): Promise<HeadToHeadData> {
  const params = new URLSearchParams({
    atleta1,
    atleta2,
  });
  if (idClass) {
    params.set('idClass', String(idClass));
  }
  const url = `${API_BASE}/head-to-head?${params.toString()}`;

  return fetchWithVenueFallback<HeadToHeadData>(
    url,
    `h2h_${atleta1}_${atleta2}`,
    'atleta',
    `H2H ${atleta1} vs ${atleta2}`,
    DEFAULT_TIMEOUT_MS,
    false,
    FRESH_TTL_MS.headToHead
  );
}

export async function fetchRanking(
  page = 1,
  sesso: 'M' | 'F' = 'M',
  comit?: string | number,
  category: RankingCategoryKey = 'generale',
  refresh = false
): Promise<RankingPageResult> {
  const catDef = getRankingCategoryByKey(category);
  const params = new URLSearchParams({
    page: String(page),
    sesso,
    category: catDef.key,
    tipo: String(catDef.tipo),
    sett: String(catDef.sett),
    s: String(catDef.s),
    fq: String(catDef.fq),
    g: String(catDef.g),
    v: String(catDef.v),
  });
  if (catDef.p !== undefined) {
    params.set('p', String(catDef.p));
  }
  if (comit && String(comit) !== '0' && String(comit) !== 'all') {
    params.set('comit', String(comit));
  }
  if (refresh) {
    params.set('refresh', 'true');
  }
  const url = `${API_BASE}/ranking?${params.toString()}`;

  return fetchWithVenueFallback<RankingPageResult>(
    url,
    `ranking_${sesso}_${comit || 'naz'}_${catDef.key}_p${page}`,
    'ranking',
    `Classifica ${catDef.shortLabel} ${sesso} p.${page}`,
    DEFAULT_TIMEOUT_MS,
    refresh,
    FRESH_TTL_MS.ranking
  );
}

export async function fetchTornei(
  category = 'all',
  comit = 0,
  reg = 0,
  refresh = false
): Promise<TorneiResponse> {
  const params = new URLSearchParams({ category });
  if (comit > 0) params.set('comit', String(comit));
  if (reg > 0) params.set('reg', String(reg));
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/tornei?${params.toString()}`;

  return fetchWithVenueFallback<TorneiResponse>(
    url,
    `tornei_${category}_c${comit}_r${reg}`,
    'tornei',
    `Tornei FITeT (${category})`,
    12000,
    refresh,
    FRESH_TTL_MS.tornei
  );
}

export async function fetchTorneoDettaglio(
  idt: number,
  com: number,
  anno = 41,
  refresh = false
): Promise<TorneoDettaglioResponse> {
  const params = new URLSearchParams({
    idt: String(idt),
    com: String(com),
    anno: String(anno),
  });
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE}/tornei/dettaglio?${params.toString()}`;

  return fetchWithVenueFallback<TorneoDettaglioResponse>(
    url,
    `torneo_dettaglio_${idt}_${com}_${anno}`,
    'tornei',
    `Torneo #${idt}`,
    DEFAULT_TIMEOUT_MS,
    refresh,
    FRESH_TTL_MS.torneoDettaglio
  );
}

export async function fetchTorneoGara(
  options: {
    idt: number;
    com: number;
    gara: string;
    anno?: number;
    isDoppio?: boolean;
    mode?: 'risultati' | 'iscrizioni';
    cod1?: number;
    cod2?: number;
    tab?: number;
    turno?: number;
  },
  refresh = false
): Promise<TorneoGaraDettaglioResponse> {
  const params = new URLSearchParams({
    idt: String(options.idt),
    com: String(options.com),
    gara: options.gara,
    anno: String(options.anno || 41),
    isDoppio: String(Boolean(options.isDoppio)),
    mode: options.mode || 'risultati',
  });
  if (options.cod1 !== undefined) params.set('cod1', String(options.cod1));
  if (options.cod2 !== undefined) params.set('cod2', String(options.cod2));
  if (options.tab !== undefined) params.set('tab', String(options.tab));
  if (options.turno !== undefined) params.set('turno', String(options.turno));
  if (refresh) params.set('refresh', 'true');

  const url = `${API_BASE}/tornei/gara?${params.toString()}`;
  const cacheKey = `torneo_gara_${options.idt}_${options.com}_${options.gara}_${options.mode || 'ris'}_c${options.cod1 || 0}_t${options.turno || 0}`;

  return fetchWithVenueFallback<TorneoGaraDettaglioResponse>(
    url,
    cacheKey,
    'tornei',
    `Gara ${options.gara} Torneo #${options.idt}`,
    10000,
    refresh,
    FRESH_TTL_MS.torneoGara
  );
}

type IscrittiCurrentPoints = Record<
  string,
  { atletaId: string | null; puntiClassificaAttuale: number | null }
>;

export async function fetchIscrittiCurrentPoints(
  iscritti: Array<{ nome: string; atletaId?: string | null }>
): Promise<IscrittiCurrentPoints> {
  if (iscritti.length === 0) return {};

  const normalized = iscritti
    .map((i) => `${i.atletaId || ''}|${i.nome}`)
    .sort()
    .join('\n');
  const cacheKey = normalized;

  const cached = readAuxCache(iscrittiPointsCache, cacheKey);
  if (cached) return cached;

  const inFlight = iscrittiPointsInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async (): Promise<IscrittiCurrentPoints> => {
    const response = await fetch(`${API_BASE}/tornei/iscritti-punti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iscritti }),
    });
    if (!response.ok) {
      throw new Error('Impossibile recuperare i punti attuali degli iscritti');
    }
    const data = await response.json();
    const results: IscrittiCurrentPoints = data.results || {};
    writeAuxCache(iscrittiPointsCache, cacheKey, results);
    return results;
  })().finally(() => {
    if (iscrittiPointsInFlight.get(cacheKey) === request) {
      iscrittiPointsInFlight.delete(cacheKey);
    }
  });

  iscrittiPointsInFlight.set(cacheKey, request);
  return request;
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
