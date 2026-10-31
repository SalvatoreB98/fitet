import { FitetClient } from './fitetClient';
import { parseElencoTornei, COMIT_NAMES } from '../parsers/torneiParser';
import { pushService, BroadcastResult } from './pushService';
import { TorneoItem } from '../../src/types/fitet';
import { getTorneoHostRegion } from '../../src/utils/torneoMap';

export const TORNEI_KNOWN_KEYS_STATE_KEY = 'known_tornei_keys';

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

        for (const t of parsed.tornei) {
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
    let title: string;
    let body: string;

    if (newTornei.length === 1) {
      const single = newTornei[0];
      const isNat = single.com === 30 || single.com === 0;
      const typeLabel = single.categoriaLabel || (isNat ? 'Torneo Nazionale' : 'Torneo Regionale');
      title = `🏆 Nuovo ${typeLabel}`;
      body = `${single.luogo} • ${single.data}${single.regione ? ` (${single.regione})` : ''}`;
    } else {
      title = `🏆 ${newTornei.length} nuovi tornei FITeT pubblicati!`;
      const previews = newTornei
        .slice(0, 3)
        .map((t) => `${t.luogo} (${t.data})`)
        .join(', ');
      const extra = newTornei.length > 3 ? ` e altri ${newTornei.length - 3}...` : '';
      body = `Disponibili nuove gare a: ${previews}${extra}`;
    }

    try {
      broadcastResult = await pushService.sendToAll({
        title,
        body,
        url: '/?view=tornei',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `tornei-new-${Date.now()}`,
        data: {
          type: 'new_tornei',
          count: newTornei.length,
          keys: newTornei.map((t) => t.key),
        },
      });

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
