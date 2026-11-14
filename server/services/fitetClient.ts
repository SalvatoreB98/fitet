/**
 * FITeT HTTP Client
 * Handles fetching with arrayBuffer response and iso-8859-1 decoding for accented Italian characters.
 *
 * Le risposte HTML vengono mantenute in una cache temporale (memoria + disco) per evitare
 * di riscaricare la stessa pagina da portale.fitet.org a ogni esecuzione serverless.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import { Agent } from 'undici';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cacheService } from './cacheService';

const BASE_URL = 'https://portale.fitet.org';
const CONNECT_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SUPABASE_CACHE_PREFIX = 'fitet_cache:';

const fitetDispatcher = new Agent({
  connect: {
    timeout: CONNECT_TIMEOUT_MS,
  },
});

let supabaseClient: SupabaseClient | null | undefined;
function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient !== undefined) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    supabaseClient = null;
    return null;
  }
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
};

const DEFAULT_UPSTREAM_TTL_MS = 20 * 60 * 1000; // 20 minuti
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

interface CacheBypassContext {
  bypass: boolean;
}

const cacheBypassContext = new AsyncLocalStorage<CacheBypassContext>();
const inFlightFetches = new Map<string, Promise<string>>();

/**
 * Esegue `fn` (tipicamente `next` di Express) disabilitando la cache upstream per
 * tutte le fetch FITeT avviate durante la richiesta. Usato per `?refresh=true`.
 */
export function withFitetCacheBypass<T>(fn: () => T): T {
  return cacheBypassContext.run({ bypass: true }, fn);
}

function isCacheBypassed(): boolean {
  return cacheBypassContext.getStore()?.bypass === true;
}

/**
 * TTL differenziati in base alla velocità con cui cambiano i dati sul portale FITeT.
 */
function resolveUpstreamTtlMs(url: string): number {
  const normalized = url.toLowerCase();

  if (normalized.includes('dettaglioatleta_unica')) return 24 * HOUR_MS;
  if (normalized.includes('menu.php')) return 4 * HOUR_MS;
  if (normalized.includes('giornata.php') || normalized.includes('dettaglio_partita')) {
    return 12 * HOUR_MS;
  }
  if (normalized.includes('classifica_squadre') || normalized.includes('calendario.asp')) {
    return 30 * MINUTE_MS;
  }
  if (
    normalized.includes('statistiche_atleti') ||
    normalized.includes('ranking_unica') ||
    normalized.includes('percentuali.php')
  ) {
    return 60 * MINUTE_MS;
  }
  if (normalized.includes('ajax.php') || normalized.includes('scelta_atleta')) {
    return 10 * MINUTE_MS;
  }
  if (
    normalized.includes('testa_tornei') ||
    normalized.includes('elenco_tornei') ||
    normalized.includes('elenco_gare') ||
    normalized.includes('iscrizioni.php') ||
    normalized.includes('iscrizioni_gara')
  ) {
    return 30 * MINUTE_MS;
  }
  if (
    normalized.includes('gestione_gare') ||
    normalized.includes('risultati.php') ||
    normalized.includes('risultati_tabellone')
  ) {
    return 15 * MINUTE_MS;
  }

  return DEFAULT_UPSTREAM_TTL_MS;
}

function buildUpstreamCacheKey(kind: 'html' | 'post', url: string, extra = ''): string {
  const hash = createHash('sha1')
    .update(kind)
    .update('\n')
    .update(url)
    .update('\n')
    .update(extra)
    .digest('hex');

  return `upstream_${kind}_${hash}`;
}

function shouldPersistInSupabase(url: string): boolean {
  const normalized = url.toLowerCase();
  return !normalized.includes('ajax.php') && !normalized.includes('scelta_atleta');
}

async function getSupabaseCachedHtml(cacheKey: string): Promise<{ html: string; remainingTtlMs: number } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('push_state')
      .select('value')
      .eq('key', `${SUPABASE_CACHE_PREFIX}${cacheKey}`)
      .maybeSingle();

    if (error || !data?.value) return null;
    const parsed = JSON.parse(data.value) as { html?: string; expiresAt?: number };
    if (typeof parsed?.html !== 'string' || typeof parsed?.expiresAt !== 'number') {
      return null;
    }

    const remainingTtlMs = parsed.expiresAt - Date.now();
    if (remainingTtlMs <= 0) return null;
    return { html: parsed.html, remainingTtlMs };
  } catch {
    return null;
  }
}

async function setSupabaseCachedHtml(cacheKey: string, html: string, ttlMs: number): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !html) return;

  try {
    const payload = JSON.stringify({
      html,
      expiresAt: Date.now() + ttlMs,
    });
    await supabase
      .from('push_state')
      .upsert(
        {
          key: `${SUPABASE_CACHE_PREFIX}${cacheKey}`,
          value: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
  } catch {
    // Non bloccare il flusso in caso di errore di scrittura cache su Supabase
  }
}

async function withUpstreamCache(
  cacheKey: string,
  url: string,
  loader: () => Promise<string>
): Promise<string> {
  const bypassed = isCacheBypassed();
  const useSupabaseCache = shouldPersistInSupabase(url);

  if (!bypassed) {
    const cached = cacheService.get<string>(cacheKey);
    if (typeof cached === 'string') {
      return cached;
    }

    const existing = inFlightFetches.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const task = (async () => {
    if (!bypassed && useSupabaseCache) {
      const remoteCached = await getSupabaseCachedHtml(cacheKey);
      if (remoteCached) {
        cacheService.set(cacheKey, remoteCached.html, remoteCached.remainingTtlMs);
        return remoteCached.html;
      }
    }

    const html = await loader();
    if (html) {
      const ttlMs = resolveUpstreamTtlMs(url);
      cacheService.set(cacheKey, html, ttlMs);
      if (useSupabaseCache) {
        void setSupabaseCachedHtml(cacheKey, html, ttlMs);
      }
    }
    return html;
  })().finally(() => {
    if (inFlightFetches.get(cacheKey) === task) {
      inFlightFetches.delete(cacheKey);
    }
  });

  if (!bypassed) {
    inFlightFetches.set(cacheKey, task);
  }
  return task;
}

export class FitetClient {
  /**
   * Attende un ritardo casuale (jitter) tra minMs e maxMs (default 1.5s - 3s)
   * per evitare picchi sequenziali verso il WAF di portale.fitet.org.
   */
  static async sleepWithJitter(minMs = 1500, maxMs = 3000): Promise<void> {
    const delay = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  /**
   * Fetches raw ISO-8859-1 HTML content from a FITeT endpoint and decodes it safely
   */
  static async fetchHtml(url: string, isAjax = false, customReferer?: string): Promise<string> {
    const cacheKey = buildUpstreamCacheKey(
      'html',
      url,
      isAjax ? `ajax:${customReferer || 'default'}` : 'page'
    );

    return withUpstreamCache(cacheKey, url, () => this.requestHtml(url, isAjax, customReferer));
  }

  private static async requestHtml(url: string, isAjax = false, customReferer?: string): Promise<string> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
    };

    if (isAjax) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers['Referer'] = customReferer || 'https://portale.fitet.org/risultati/new_rank/testaclassifica_auto.php?ID_CLASS=248&ID=1&PASS=20';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        headers,
        signal: controller.signal,
        dispatcher: fitetDispatcher,
      };
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`FITeT HTTP error: ${response.status} ${response.statusText} on ${url}`);
      }

      // Read array buffer and decode using ISO-8859-1
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('iso-8859-1');
      return decoder.decode(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches a FITeT page through a POST form and decodes the ISO-8859-1 response.
   */
  static async postForm(
    url: string,
    formData: Record<string, string>,
    customReferer?: string
  ): Promise<string> {
    const serializedBody = new URLSearchParams(formData).toString();
    const cacheKey = buildUpstreamCacheKey(
      'post',
      url,
      `${serializedBody}\n${customReferer || 'default'}`
    );

    return withUpstreamCache(cacheKey, url, () =>
      this.requestPostForm(url, serializedBody, customReferer)
    );
  }

  private static async requestPostForm(
    url: string,
    serializedBody: string,
    customReferer?: string
  ): Promise<string> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': customReferer || `${BASE_URL}/risultati/new_rank/scelta_atleta.php`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        method: 'POST',
        headers,
        body: serializedBody,
        signal: controller.signal,
        dispatcher: fitetDispatcher,
      };
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`FITeT HTTP error: ${response.status} ${response.statusText} on ${url}`);
      }

      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('iso-8859-1');
      return decoder.decode(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Endpoint 1: Classifica Squadre
   */
  static async fetchClassifica(cam: number | string): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/classifica_squadre.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 2: Calendario & Incontri
   */
  static async fetchCalendario(cam: number | string, anno = 41): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/Calendario.asp?CAM=${cam}&ANNO=${anno}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 3: Statistiche Atleti Girone
   */
  static async fetchStatisticheAtleti(cam: number | string): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/statistiche_atleti.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 4: Scheda Singolo Atleta (Ranking & Storico Punti)
   */
  static async fetchSchedaAtleta(atletaId: string | number, idClass = 248): Promise<string> {
    const url = `${BASE_URL}/risultati/new_rank/dettaglioatleta_unica.php?ATLETA=${atletaId}&ID_CLASS=${idClass}&ZU=1&AVVERSARIO=0`;
    return this.fetchHtml(url, true);
  }

  /**
   * Autocomplete search for athletes
   */
  static async searchAtleta(query: string): Promise<Array<{ id: string; value: string; label: string }>> {
    const rawClean = query.trim();
    if (!rawClean || rawClean.length < 2) return [];

    const hasApostrophe = /['\u2018\u2019\u02BC`\u00B4]/.test(rawClean);
    const variants = new Set<string>();

    if (hasApostrophe) {
      // 1. Spaced version (e.g. "D AMICO") -> matches athletes stored with apostrophe "D'AMICO" in FITeT
      const spaced = rawClean.replace(/['\u2018\u2019\u02BC`\u00B4]/g, ' ').replace(/\s+/g, ' ').trim();
      if (spaced.length >= 2) variants.add(spaced);

      // 2. Attached version (e.g. "DAMICO" / "DANDREA") -> matches athletes stored without apostrophe in FITeT
      const attached = rawClean.replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, '').trim();
      if (attached.length >= 2) variants.add(attached);
    } else {
      variants.add(rawClean);

      // If user typed e.g. "damico" without apostrophe, also try searching "d amico"
      if (/^d[aeiou]/i.test(rawClean) && rawClean.length >= 4) {
        variants.add(rawClean.replace(/^d([aeiou])/i, 'd $1'));
      } else if (/^dell[aeiou]/i.test(rawClean) && rawClean.length >= 6) {
        variants.add(rawClean.replace(/^dell([aeiou])/i, 'dell $1'));
      }
    }

    const fetchVariant = async (term: string) => {
      const url = `${BASE_URL}/risultati/new_rank/ajax.php?term=${encodeURIComponent(term)}`;
      try {
        const text = await this.fetchHtml(url, true);
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const resultsLists = await Promise.all(Array.from(variants).map((v) => fetchVariant(v)));

    // Deduplicate by athlete ID and filter out error entries
    const map = new Map<string, { id: string; value: string; label: string }>();
    for (const list of resultsLists) {
      for (const item of list) {
        if (item && item.id && item.id !== '#' && !map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }

    const allResults = Array.from(map.values());
    if (allResults.length === 0) return [];

    // Relevance scoring
    const normalizedUser = rawClean.toUpperCase().replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, '');
    const userWords = rawClean.toUpperCase().replace(/['\u2018\u2019\u02BC`\u00B4]/g, ' ').split(/\s+/).filter(Boolean);

    const scored = allResults.map((item) => {
      const valUpper = (item.value || '').toUpperCase();
      const valClean = valUpper.replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, '');
      let score = 0;

      // 1. Exact start match (highest priority)
      if (valClean.startsWith(normalizedUser)) {
        score += 1000;
      } else if (valUpper.startsWith(rawClean.toUpperCase())) {
        score += 800;
      } else if (valClean.includes(normalizedUser)) {
        score += 500;
      }

      // 2. All user words present in value
      const allWordsPresent = userWords.every((w) => valUpper.includes(w) || valClean.includes(w));
      if (allWordsPresent) {
        score += 200;
      }

      // 3. Penalize single-letter false positives when searching an apostrophe surname
      if (hasApostrophe && !valClean.includes(normalizedUser)) {
        score -= 300;
      }

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // If query had an apostrophe, filter out false positives
    if (hasApostrophe) {
      const positive = scored.filter((s) => s.score > 0);
      return positive.length > 0 ? positive.map((s) => s.item) : scored.map((s) => s.item);
    }

    return scored.map((s) => s.item);
  }

  /**
   * Ricerca atleti tramite il form ufficiale "scelta_atleta.php".
   * ATLETA viene usato da FITeT per escludere l'atleta già selezionato.
   */
  static async fetchSceltaAtleta(
    query: string,
    excludeId = '0',
    idClass = 248
  ): Promise<string> {
    const url = `${BASE_URL}/risultati/new_rank/scelta_atleta.php`;
    return this.postForm(
      url,
      {
        CERCA: query.trim(),
        ATLETA: excludeId || '0',
        ZU: '1',
        ID_CLASS: String(idClass),
      },
      `${BASE_URL}/risultati/new_rank/scelta_atleta.php`
    );
  }

  /**
   * Endpoint 5: Referto Incontro Gara
   */
  static async fetchRefertoIncontro(incontroId: string | number, cam: number | string, formula = 19): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/giornata.php?INCONTRO=${incontroId}&CAM=${cam}&FORMULA=${formula}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 6: Dettaglio Singola Partita Individuale
   */
  static async fetchDettaglioPartita(partitaId: string | number): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/dettaglio_partita.php?ID=${partitaId}`;
    return this.fetchHtml(url);
  }
}
