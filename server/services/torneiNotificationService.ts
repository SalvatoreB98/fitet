import { FitetClient } from './fitetClient';
import { parseElencoTornei, COMIT_NAMES } from '../parsers/torneiParser';
import { pushService, BroadcastResult, PushMessagePayload } from './pushService';
import { TorneoItem } from '../../src/types/fitet';
import { getTorneoHostRegion } from '../../src/utils/torneoMap';

export const TORNEI_KNOWN_KEYS_STATE_KEY = 'known_tornei_keys';

let cachedKnownKeys: Set<string> | null = null;
let cachedKnownKeysTimestamp = 0;
const KNOWN_KEYS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minuti
const PASSIVE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 minuti
let lastPassiveCheckAt = 0;
let isPassiveCheckRunning = false;
const pendingObservedMap = new Map<string, ScannedTorneoItem>();

/**
 * Controllo passivo ("piggyback") invocato quando gli utenti consultano la tab Tornei:
 * confronta i tornei appena caricati da FITeT con il baseline su Supabase e, se rileva
 * nuovi tornei non ancora notificati durante la giornata, invia la push senza bisogno
 * di attendere il cron giornaliero di Vercel Hobby.
 */
export async function notifyObservedTorneiIfNeeded(observedTornei: TorneoItem[]): Promise<void> {
  if (!observedTornei || observedTornei.length === 0) {
    return;
  }

  for (const t of observedTornei) {
    const key = getTorneoUniqueKey(t);
    if (!cachedKnownKeys?.has(key) && !pendingObservedMap.has(key)) {
      const isRegional = t.com >= 1 && t.com <= 21;
      const resolvedRegion = isRegional
        ? (COMIT_NAMES[t.com] || t.regione)
        : getTorneoHostRegion(t);
      pendingObservedMap.set(key, {
        ...t,
        key,
        regione: resolvedRegion,
      });
    }
  }

  if (pendingObservedMap.size === 0 || isPassiveCheckRunning) {
    return;
  }

  // Esegue il controllo passivo al massimo ogni 15 minuti per istanza.
  if (cachedKnownKeys && Date.now() - lastPassiveCheckAt < PASSIVE_CHECK_MIN_INTERVAL_MS) {
    return;
  }
  lastPassiveCheckAt = Date.now();

  isPassiveCheckRunning = true;
  try {
    // Attende 300ms per raggruppare eventuali sezioni caricate in parallelo con Promise.all
    await new Promise((resolve) => setTimeout(resolve, 300));

    while (pendingObservedMap.size > 0) {
      const batch = Array.from(pendingObservedMap.values());
      pendingObservedMap.clear();

      const now = Date.now();
      if (!cachedKnownKeys || now - cachedKnownKeysTimestamp > KNOWN_KEYS_CACHE_TTL_MS) {
        const previousState = await pushService.getState(TORNEI_KNOWN_KEYS_STATE_KEY);
        if (!previousState) {
          // Il baseline completo non è ancora stato inizializzato dal cron: evita falsi positivi parziali
          return;
        }
        const parsed = JSON.parse(previousState);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return;
        }
        cachedKnownKeys = new Set(parsed);
        cachedKnownKeysTimestamp = now;
      }

      const candidates = batch.filter((t) => !cachedKnownKeys!.has(t.key));
      if (candidates.length === 0) {
        continue;
      }

      // Rileggiamo lo stato fresco da Supabase per evitare race condition tra istanze serverless
      const freshState = await pushService.getState(TORNEI_KNOWN_KEYS_STATE_KEY);
      if (!freshState) return;
      const freshKnown = new Set<string>(JSON.parse(freshState));

      const newTornei = candidates.filter((t) => !freshKnown.has(t.key));
      if (newTornei.length === 0) {
        cachedKnownKeys = freshKnown;
        cachedKnownKeysTimestamp = Date.now();
        continue;
      }

      if (pushService.isReady()) {
        await pushService.sendToAll(buildTorneiNotificationPayload(newTornei));
      }

      const updatedKeys = Array.from(new Set([...freshKnown, ...newTornei.map((t) => t.key)]));
      await pushService.setState(TORNEI_KNOWN_KEYS_STATE_KEY, JSON.stringify(updatedKeys));
      cachedKnownKeys = new Set(updatedKeys);
      cachedKnownKeysTimestamp = Date.now();
    }
  } catch (err) {
    console.warn('[TorneiScanner] Errore durante controllo passivo nuovi tornei:', err);
  } finally {
    isPassiveCheckRunning = false;
  }
}

export interface ScannedTorneoItem extends TorneoItem {
  key: string;
}

export interface CheckNewTorneiOptions {
  /**
   * Se true, esegue la scansione e calcola i nuovi tornei ma non invia notifiche push
   * e non aggiorna lo stato su Supabase.
   */
  dryRun?: boolean;
  /**
   * Se true, forza la reinizializzazione del set di tornei noti con quelli attuali,
   * utile per impostare il baseline iniziale.
   */
  init?: boolean;
  /**
   * Numero massimo di richieste HTTP concorrenti verso portale.fitet.org.
   * Default: 10.
   */
  concurrency?: number;
}

export interface CheckNewTorneiResult {
  changed: boolean;
  initialized?: boolean;
  totalFound: number;
  newTorneiCount: number;
  newTornei: ScannedTorneoItem[];
  notificationSent?: boolean;
  broadcastResult?: BroadcastResult;
  error?: string;
  durationMs: number;
}

interface ScanTarget {
  key: string;
  label: string;
  tor: number;
  comit: number;
  id: number;
  isRegional: boolean;
}

/**
 * Costruisce il payload push per uno o più nuovi tornei rilevati.
 * Se il torneo è singolo, include nell'URL i parametri per aprire direttamente
 * la scheda del torneo associata.
 */
function buildTorneiNotificationPayload(newTornei: ScannedTorneoItem[]): PushMessagePayload {
  let title: string;
  let body: string;
  let url: string;
  let singleTorneoData: Record<string, any> | undefined;

  if (newTornei.length === 1) {
    const single = newTornei[0];
    const isNat = single.com === 30 || single.com === 0;
    const typeLabel = single.categoriaLabel || (isNat ? 'Torneo Nazionale' : 'Torneo Regionale');
    title = `🏆 Nuovo ${typeLabel}`;
    body = `${single.luogo} • ${single.data}${single.regione ? ` (${single.regione})` : ''}`;

    const tab = single.status === 'disputato' ? 'risultati' : 'programma';
    const params = new URLSearchParams({
      view: 'tornei',
      tab,
      torneoIdt: String(single.idt),
      torneoCom: String(single.com),
      torneoAnno: String(single.anno || 0),
    });
    if (single.luogo) params.set('torneoLuogo', single.luogo);
    if (single.data) params.set('torneoData', single.data);
    if (single.regione) params.set('torneoRegione', single.regione);
    if (single.status) params.set('torneoStatus', single.status);
    url = `/?${params.toString()}`;

    singleTorneoData = {
      idt: single.idt,
      com: single.com,
      anno: single.anno,
      tipo: single.tipo,
      luogo: single.luogo,
      data: single.data,
      regione: single.regione,
      status: single.status,
      href: single.href,
      key: single.key,
    };
  } else {
    title = `🏆 ${newTornei.length} nuovi tornei FITeT pubblicati!`;
    const previews = newTornei
      .slice(0, 3)
      .map((t) => `${t.luogo} (${t.data})`)
      .join(', ');
    const extra = newTornei.length > 3 ? ` e altri ${newTornei.length - 3}...` : '';
    body = `Disponibili nuove gare a: ${previews}${extra}`;

    const allDisputati = newTornei.every((t) => t.status === 'disputato');
    url = `/?view=tornei&tab=${allDisputati ? 'risultati' : 'programma'}`;
  }

  return {
    title,
    body,
    url,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: `tornei-new-${Date.now()}`,
    data: {
      type: 'new_tornei',
      url,
      count: newTornei.length,
      keys: newTornei.map((t) => t.key),
      ...(singleTorneoData ? { torneo: singleTorneoData } : {}),
    },
  };
}

/**
 * Genera la chiave univoca per un torneo FITeT: ${com}-${idt}-${tipo}
 */
export function getTorneoUniqueKey(torneo: { com: number; idt: number; tipo?: number }): string {
  return `${torneo.com}-${torneo.idt}-${torneo.tipo ?? 0}`;
}

/**
 * Definizioni delle categorie nazionali e aperte ufficiali FITeT.
 */
const NATIONAL_TARGETS: ScanTarget[] = [
  { key: 'top1', label: 'Torneo Nazionale Top 1', tor: 21, comit: 30, id: 0, isRegional: false },
  { key: 'top2', label: 'Torneo Nazionale Top 2', tor: 22, comit: 30, id: 0, isRegional: false },
  { key: 'top3', label: 'Torneo Nazionale Top 3', tor: 23, comit: 30, id: 0, isRegional: false },
  { key: 'top4', label: 'Torneo Nazionale Top 4', tor: 24, comit: 30, id: 0, isRegional: false },
  { key: 'top5', label: 'Torneo Nazionale Top 5', tor: 25, comit: 30, id: 0, isRegional: false },
  { key: 'top6', label: 'Torneo Nazionale Top 6', tor: 26, comit: 30, id: 0, isRegional: false },
  { key: 'giovanili', label: 'Torneo Nazionale Giovanile', tor: 2, comit: 30, id: 0, isRegional: false },
  { key: 'master', label: 'Torneo Nazionale Master', tor: 5, comit: 30, id: 0, isRegional: false },
  { key: 'paralimpici', label: 'Torneo Paralimpico', tor: 8, comit: 30, id: 0, isRegional: false },
  { key: 'open_cat', label: 'Torneo Open di Categoria', tor: 0, comit: 30, id: 39, isRegional: false },
  { key: 'open', label: 'Torneo Open', tor: 0, comit: 30, id: 36, isRegional: false },
  { key: 'giornate_rosa', label: 'Giornata Rosa Nazionale', tor: 12, comit: 30, id: 0, isRegional: false },
  { key: 'transalpino', label: 'Trofeo Transalpino', tor: 9, comit: 30, id: 0, isRegional: false },
  { key: 'campionati_ita', label: 'Campionati Italiani', tor: 10, comit: 30, id: 0, isRegional: false },
  { key: 'coppa_ita', label: 'Coppa Italia CC.RR.', tor: 14, comit: 30, id: 0, isRegional: false },
  { key: 'promozionali', label: 'Torneo Promozionale', tor: 7, comit: 30, id: 0, isRegional: false },
];

/**
 * Tipi di tornei regionali da scansionare per ciascuno dei 21 comitati regionali.
 */
const REGIONAL_TOR_TYPES: Array<{ tor: number; label: string }> = [
  { tor: 100, label: 'Torneo Open Regionale' },
  { tor: 101, label: 'Torneo Regionale di Categoria' },
  { tor: 102, label: 'Torneo Regionale Giovanile' },
  { tor: 103, label: 'Torneo Regionale Ordinario' },
  { tor: 105, label: 'Torneo Regionale Master' },
  { tor: 107, label: 'Torneo Regionale Promozionale' },
  { tor: 108, label: 'Torneo Regionale Paralimpico' },
  { tor: 110, label: 'Campionato Regionale' },
  { tor: 111, label: 'Torneo Provinciale' },
  { tor: 112, label: 'Giornata Rosa Regionale' },
];

/**
 * Costruisce l'elenco completo di tutti i target (nazionali + regionali).
 */
export function buildAllScanTargets(): ScanTarget[] {
  const targets: ScanTarget[] = [...NATIONAL_TARGETS];

  for (let com = 1; com <= 21; com++) {
    const regionName = COMIT_NAMES[com] || `Regione ${com}`;
    for (const r of REGIONAL_TOR_TYPES) {
      targets.push({
        key: `reg_${com}_${r.tor}`,
        label: `${r.label} (${regionName})`,
        tor: r.tor,
        comit: com,
        id: 0,
        isRegional: true,
      });
    }
  }

  return targets;
}

/**
 * Esegue la scansione di tutti i tornei nazionali e regionali FITeT attivi
 * interrogando in parallelo con pool concorrente le pagine ufficiali di portale.fitet.org.
 */
export async function scanAllTornei(concurrency = 10): Promise<ScannedTorneoItem[]> {
  const targets = buildAllScanTargets();
  const torneiMap = new Map<string, ScannedTorneoItem>();
  let targetIndex = 0;

  async function worker() {
    while (targetIndex < targets.length) {
      const target = targets[targetIndex++];
      const url = `https://portale.fitet.org/risultati/tornei/elenco_tornei.php?TOR=${target.tor}&COMIT=${target.comit}&ID=${target.id}`;

      try {
        const html = await FitetClient.fetchHtml(url).catch(() => '');
        if (!html) continue;

        const parsed = parseElencoTornei(
          html,
          target.comit,
          target.tor,
          target.isRegional ? target.comit : undefined,
          target.key,
          target.label
        );

        let itemsToAdd = parsed.tornei;

        if (parsed.regions.length > 0 && parsed.tornei.length === 0) {
          const regLists = await Promise.all(
            parsed.regions.map(async (r) => {
              const regUrl = `https://portale.fitet.org/risultati/tornei/elenco_tornei.php?REG=${r.regId}&TOR=${r.tor}&ID=${r.id}&COMIT=${r.comit}`;
              const regHtml = await FitetClient.fetchHtml(regUrl).catch(() => '');
              if (!regHtml) return [];
              return parseElencoTornei(regHtml, r.comit, r.tor, r.regId, target.key, target.label).tornei;
            })
          );
          itemsToAdd = regLists.flat();
        }

        for (const t of itemsToAdd) {
          const key = getTorneoUniqueKey(t);

          if (!torneiMap.has(key)) {
            // Risolvi la regione reale (inclusa la regione ospitante per i tornei nazionali)
            const resolvedRegion = target.isRegional
              ? (COMIT_NAMES[t.com] || target.label)
              : getTorneoHostRegion(t);

            torneiMap.set(key, {
              ...t,
              key,
              regione: resolvedRegion,
              categoriaLabel: t.categoriaLabel || target.label,
            });
          }
        }
      } catch (err) {
        console.warn(`[TorneiScanner] Errore scansione ${target.label}:`, err);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  return Array.from(torneiMap.values());
}

/**
 * Funzione principale: cerca nuovi tornei nazionali e regionali FITeT
 * e, se ne trova di nuovi, invia la notifica push a tutti gli iscritti.
 *
 * Logica di funzionamento:
 * 1. Esegue la scansione di tutti i tornei nazionali (Top, Open, Giovanili, Master, ecc.)
 *    e di tutti i tornei regionali (21 regioni x 10 categorie).
 * 2. Legge da Supabase lo stato persistente dei tornei precedentemente noti.
 * 3. Se lo stato non esiste (primo avvio) o se `options.init === true`:
 *    - Inizializza il baseline salvando i tornei attuali senza inviare notifiche (evita spam).
 * 4. Se trova uno o più tornei nuovi:
 *    - Invia una notifica push Web Push (con titolo, luogo, data, regione e link /?view=tornei).
 *    - Aggiorna lo stato persistente su Supabase.
 */
export async function checkNewTorneiAndNotify(
  options: CheckNewTorneiOptions = {}
): Promise<CheckNewTorneiResult> {
  const startTime = Date.now();
  const concurrency = options.concurrency ?? 10;
  const dryRun = options.dryRun ?? false;
  const init = options.init ?? false;

  console.log(`[TorneiScanner] Avvio scansione tornei nazionali e regionali (concorrenza: ${concurrency})...`);
  const scannedTornei = await scanAllTornei(concurrency);
  const currentKeys = scannedTornei.map((t) => t.key);

  console.log(`[TorneiScanner] Scansione completata: trovati ${scannedTornei.length} tornei unici.`);

  // Recupera le chiavi dei tornei già noti
  const previousState = await pushService.getState(TORNEI_KNOWN_KEYS_STATE_KEY);

  // Caso 1: Primo avvio o forzatura di reinizializzazione baseline
  if (previousState === null || init) {
    if (!dryRun) {
      await pushService.setState(
        TORNEI_KNOWN_KEYS_STATE_KEY,
        JSON.stringify(currentKeys)
      );
      cachedKnownKeys = new Set(currentKeys);
      cachedKnownKeysTimestamp = Date.now();
      console.log(`[TorneiScanner] Baseline inizializzato con ${currentKeys.length} tornei.`);
    }

    return {
      changed: false,
      initialized: true,
      totalFound: currentKeys.length,
      newTorneiCount: 0,
      newTornei: [],
      notificationSent: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Decodifica le chiavi note salvate
  let knownKeys: Set<string>;
  try {
    const parsed = JSON.parse(previousState);
    knownKeys = new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.error('[TorneiScanner] Formato JSON stato non valido, reinizializzazione necessaria:', err);
    knownKeys = new Set();
  }

  // Individua i nuovi tornei
  const newTornei = scannedTornei.filter((t) => !knownKeys.has(t.key));

  if (newTornei.length === 0) {
    cachedKnownKeys = knownKeys;
    cachedKnownKeysTimestamp = Date.now();
    console.log('[TorneiScanner] Nessun nuovo torneo rilevato.');
    return {
      changed: false,
      totalFound: currentKeys.length,
      newTorneiCount: 0,
      newTornei: [],
      notificationSent: false,
      durationMs: Date.now() - startTime,
    };
  }

  console.log(
    `[TorneiScanner] Trovati ${newTornei.length} nuovi tornei:`,
    newTornei.map((t) => `${t.categoriaLabel || 'Torneo'} a ${t.luogo} (${t.data})`)
  );

  let broadcastResult: BroadcastResult | undefined;
  let notificationSent = false;

  // Invio notifica push (se non è una simulazione)
  if (!dryRun && pushService.isReady()) {
    try {
      broadcastResult = await pushService.sendToAll(
        buildTorneiNotificationPayload(newTornei)
      );

      notificationSent = broadcastResult.sent > 0;
      console.log(
        `[TorneiScanner] Notifiche inviate: ${broadcastResult.sent}/${broadcastResult.total} (fallite: ${broadcastResult.failed}).`
      );
    } catch (pushErr: any) {
      console.error('[TorneiScanner] Invio notifiche push fallito:', pushErr);
    }
  }

  // Aggiorna lo stato su Supabase con l'unione dei tornei noti e attuali
  if (!dryRun) {
    const updatedKeys = Array.from(new Set([...knownKeys, ...currentKeys]));
    await pushService.setState(
      TORNEI_KNOWN_KEYS_STATE_KEY,
      JSON.stringify(updatedKeys)
    );
    cachedKnownKeys = new Set(updatedKeys);
    cachedKnownKeysTimestamp = Date.now();
  }

  return {
    changed: true,
    totalFound: currentKeys.length,
    newTorneiCount: newTornei.length,
    newTornei,
    notificationSent,
    broadcastResult,
    durationMs: Date.now() - startTime,
  };
}

let dailySchedulerTimer: NodeJS.Timeout | null = null;
let lastDailyCheckDate = '';

/**
 * Calcola la data e l'ora corrente nel fuso orario italiano (Europe/Rome).
 */
function getRomeDateHour(): { dateStr: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const hour = parseInt(map.hour || '0', 10) % 24;
  const minute = parseInt(map.minute || '0', 10);
  return { dateStr, hour, minute };
}

/**
 * Avvia uno scheduler giornaliero sul server che esegue il controllo completo
 * dei tornei nazionali e regionali 1 volta al giorno di mattina alle 09:00 (ora italiana).
 */
export function startDailyTorneiScheduler(): void {
  if (dailySchedulerTimer) return;

  const checkTick = async () => {
    try {
      const { dateStr, hour } = getRomeDateHour();
      if (hour === 9 && lastDailyCheckDate !== dateStr) {
        lastDailyCheckDate = dateStr;
        console.log(`[TorneiScanner] Trigger giornaliero delle 09:00 (${dateStr}) avviato...`);
        await checkNewTorneiAndNotify();
      }
    } catch (err) {
      console.warn('[TorneiScanner] Errore durante il controllo giornaliero delle 09:00:', err);
    }
  };

  // Controlla ogni minuto se sono le 09:00 del mattino (Europe/Rome)
  dailySchedulerTimer = setInterval(checkTick, 60 * 1000);
  if (typeof dailySchedulerTimer.unref === 'function') {
    dailySchedulerTimer.unref();
  }
}
