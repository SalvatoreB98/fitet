import { FitetClient, withFitetCacheBypass } from './fitetClient';
import { cacheService } from './cacheService';
import { championshipCatalog } from './championshipCatalog';
import { parseClassifica } from '../parsers/classificaParser';
import { parseCalendario } from '../parsers/calendarioParser';
import { parseStatisticheAtleti } from '../parsers/statisticheParser';
import { pushService, BroadcastResult, PushMessagePayload } from './pushService';
import {
  SquadraClassifica,
  GiornataCalendario,
  StatisticaAtleta,
} from '../../src/types/fitet';

export const CHAMPIONSHIP_STATE_KEY_PREFIX = 'championship_state_';

export function getChampionshipStateKey(camId: number): string {
  return `${CHAMPIONSHIP_STATE_KEY_PREFIX}${camId}`;
}

export interface SnapshotPlayedMatch {
  key: string;
  giornata: number;
  tipo: 'andata' | 'ritorno';
  squadraCasa: string;
  squadraOspite: string;
  puntiCasa: number | null;
  puntiOspite: number | null;
  risultato: string;
  incontroId: string | null;
}

export interface SnapshotClassificaTeam {
  key: string;
  nome: string;
  posizione: number;
  punti: number;
  incontriGiocati: number;
  vittorie: number;
  pareggi: number;
  sconfitte: number;
  partiteVinte: number;
  partitePerse: number;
}

export interface SnapshotAthleteStat {
  key: string;
  atleta: string;
  squadra: string;
  incontriDisputati: number;
  partiteDisputate: number;
  partiteVinte: number;
  partitePerse: number;
  setVinti: number;
  setPersi: number;
}

export interface ChampionshipMonitorSnapshot {
  camId: number;
  annoId: number;
  championshipName: string;
  updatedAt: string;
  playedMatches: SnapshotPlayedMatch[];
  classifica: SnapshotClassificaTeam[];
  statistiche: SnapshotAthleteStat[];
}

export interface ChampionshipSnapshotDiff {
  hasChanges: boolean;
  newPlayedMatches: SnapshotPlayedMatch[];
  updatedMatches: SnapshotPlayedMatch[];
  classificaChanged: boolean;
  statisticheChanged: boolean;
}

export interface ObservedChampionshipInput {
  camId: number;
  annoId?: number;
  championshipName?: string;
  classifica: SquadraClassifica[];
  calendario: GiornataCalendario[];
  statisticheAtleti?: StatisticaAtleta[];
}

export interface SingleChampionshipCheckResult {
  camId: number;
  championshipName: string;
  changed: boolean;
  initialized?: boolean;
  newPlayedMatchesCount: number;
  updatedMatchesCount: number;
  classificaChanged: boolean;
  statisticheChanged: boolean;
  notificationSent?: boolean;
  broadcastResult?: BroadcastResult;
}

export interface CheckChampionshipsOptions {
  camIds?: number[];
  annoId?: number;
  dryRun?: boolean;
  init?: boolean;
}

export interface CheckChampionshipsResult {
  checkedCount: number;
  changedCount: number;
  initializedCount: number;
  results: SingleChampionshipCheckResult[];
  durationMs: number;
}

// Cache in-memory per evitare letture ripetute su Supabase quando i dati osservati sono identici
const cachedSnapshots = new Map<
  number,
  { snapshot: ChampionshipMonitorSnapshot; timestamp: number }
>();
const SNAPSHOT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minuti
const inFlightChecks = new Set<number>();

function normKey(value?: string | null): string {
  return (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Costruisce uno snapshot compatto e deterministico dello stato di un campionato.
 * Restituisce null se i dati sono vuoti (es. errore temporaneo di rete da FITeT).
 */
export function buildChampionshipSnapshot(
  input: ObservedChampionshipInput
): ChampionshipMonitorSnapshot | null {
  const {
    camId,
    annoId = 41,
    championshipName = `Campionato #${camId}`,
    classifica = [],
    calendario = [],
    statisticheAtleti = [],
  } = input;

  if (!Number.isFinite(camId) || camId <= 0) {
    return null;
  }

  // Se sia la classifica sia il calendario sono vuoti, i dati non sono validi
  if (classifica.length === 0 && calendario.length === 0) {
    return null;
  }

  const playedMatchesMap = new Map<string, SnapshotPlayedMatch>();
  for (const g of calendario) {
    const allMatches = [...(g.partiteAndata || []), ...(g.partiteRitorno || [])];
    for (const m of allMatches) {
      const hasScore = m.puntiCasa !== null && m.puntiOspite !== null;
      const isPlayed = Boolean(m.disputato || hasScore || m.incontroId);
      if (!isPlayed) continue;

      const key = `${m.giornata}_${m.tipo}_${normKey(m.squadraCasa)}_${normKey(m.squadraOspite)}`;
      playedMatchesMap.set(key, {
        key,
        giornata: m.giornata,
        tipo: m.tipo,
        squadraCasa: m.squadraCasa.trim(),
        squadraOspite: m.squadraOspite.trim(),
        puntiCasa: m.puntiCasa,
        puntiOspite: m.puntiOspite,
        risultato: (m.risultato || '').trim(),
        incontroId: m.incontroId || null,
      });
    }
  }

  const snapshotClassifica: SnapshotClassificaTeam[] = classifica.map((t, index) => ({
    key: normKey(t.nome),
    nome: t.nome.trim(),
    posizione: t.posizione || index + 1,
    punti: t.punti ?? 0,
    incontriGiocati: t.incontriDisputati ?? 0,
    vittorie: t.incontriVinti ?? 0,
    pareggi: t.incontriPareggiati ?? 0,
    sconfitte: t.incontriPersi ?? 0,
    partiteVinte: t.partiteVinte ?? 0,
    partitePerse: t.partitePerse ?? 0,
  }));

  const snapshotStatistiche: SnapshotAthleteStat[] = (statisticheAtleti || [])
    .filter((a) => Boolean(a.atleta))
    .map((a) => ({
      key: `${normKey(a.atleta)}__${normKey(a.squadra)}`,
      atleta: a.atleta.trim(),
      squadra: (a.squadra || '').trim(),
      incontriDisputati: a.incontriDisputati ?? 0,
      partiteDisputate: a.partiteDisputate ?? 0,
      partiteVinte: a.partiteVinte ?? 0,
      partitePerse: a.partitePerse ?? 0,
      setVinti: a.setVinti ?? 0,
      setPersi: a.setPersi ?? 0,
    }));

  return {
    camId,
    annoId,
    championshipName: championshipName.trim() || `Campionato #${camId}`,
    updatedAt: new Date().toISOString(),
    playedMatches: Array.from(playedMatchesMap.values()),
    classifica: snapshotClassifica,
    statistiche: snapshotStatistiche,
  };
}

/**
 * Confronta due snapshot di un campionato e individua:
 * - nuovi incontri disputati caricati in calendario;
 * - incontri aggiornati nel punteggio o con nuovo referto disponibile;
 * - variazioni nella classifica (punti, incontri giocati, vittorie, posizioni, ecc.);
 * - variazioni nelle statistiche individuali degli atleti.
 */
export function diffChampionshipSnapshots(
  prev: ChampionshipMonitorSnapshot,
  curr: ChampionshipMonitorSnapshot
): ChampionshipSnapshotDiff {
  const emptyDiff: ChampionshipSnapshotDiff = {
    hasChanges: false,
    newPlayedMatches: [],
    updatedMatches: [],
    classificaChanged: false,
    statisticheChanged: false,
  };

  // Protezione anti-downgrade: se FITeT restituisce meno partite disputate di prima, ignora
  const prevMatches = prev.playedMatches || [];
  const currMatches = curr.playedMatches || [];
  if (prevMatches.length > 0 && currMatches.length < prevMatches.length) {
    return emptyDiff;
  }

  const prevMatchMap = new Map<string, SnapshotPlayedMatch>(
    prevMatches.map((m) => [m.key, m])
  );

  const newPlayedMatches: SnapshotPlayedMatch[] = [];
  const updatedMatches: SnapshotPlayedMatch[] = [];

  for (const m of currMatches) {
    const old = prevMatchMap.get(m.key);
    if (!old) {
      newPlayedMatches.push(m);
      continue;
    }

    const scoreChanged =
      old.puntiCasa !== m.puntiCasa || old.puntiOspite !== m.puntiOspite;
    const refertoAdded = !old.incontroId && Boolean(m.incontroId);

    if (scoreChanged || refertoAdded) {
      updatedMatches.push(m);
    }
  }

  // Confronto classifica
  let classificaChanged = false;
  const prevClassifica = prev.classifica || [];
  const currClassifica = curr.classifica || [];
  const prevTotalTeamPlayed = prevClassifica.reduce(
    (sum, t) => sum + (t.incontriGiocati || 0),
    0
  );
  const currTotalTeamPlayed = currClassifica.reduce(
    (sum, t) => sum + (t.incontriGiocati || 0),
    0
  );

  if (currClassifica.length > 0 && currTotalTeamPlayed >= prevTotalTeamPlayed) {
    if (prevClassifica.length === 0 && currTotalTeamPlayed > 0) {
      classificaChanged = true;
    } else if (prevClassifica.length > 0) {
      const prevTeamMap = new Map<string, SnapshotClassificaTeam>(
        prevClassifica.map((t) => [t.key, t])
      );
      for (const team of currClassifica) {
        const oldTeam = prevTeamMap.get(team.key);
        if (!oldTeam) continue;
        if (
          oldTeam.punti !== team.punti ||
          oldTeam.incontriGiocati !== team.incontriGiocati ||
          oldTeam.vittorie !== team.vittorie ||
          oldTeam.pareggi !== team.pareggi ||
          oldTeam.sconfitte !== team.sconfitte ||
          oldTeam.partiteVinte !== team.partiteVinte ||
          oldTeam.partitePerse !== team.partitePerse ||
          oldTeam.posizione !== team.posizione
        ) {
          classificaChanged = true;
          break;
        }
      }
    }
  }

  // Confronto statistiche individuali atleti
  let statisticheChanged = false;
  const prevStats = prev.statistiche || [];
  const currStats = curr.statistiche || [];
  const prevTotalIndPlayed = prevStats.reduce(
    (sum, a) => sum + (a.partiteDisputate || 0),
    0
  );
  const currTotalIndPlayed = currStats.reduce(
    (sum, a) => sum + (a.partiteDisputate || 0),
    0
  );

  if (currStats.length > 0 && currTotalIndPlayed >= prevTotalIndPlayed) {
    if (currTotalIndPlayed > prevTotalIndPlayed) {
      statisticheChanged = true;
    } else if (prevStats.length > 0) {
      const prevStatMap = new Map<string, SnapshotAthleteStat>(
        prevStats.map((a) => [a.key, a])
      );
      for (const stat of currStats) {
        const oldStat = prevStatMap.get(stat.key);
        if (!oldStat) {
          if (stat.partiteDisputate > 0) {
            statisticheChanged = true;
            break;
          }
          continue;
        }
        if (
          oldStat.incontriDisputati !== stat.incontriDisputati ||
          oldStat.partiteDisputate !== stat.partiteDisputate ||
          oldStat.partiteVinte !== stat.partiteVinte ||
          oldStat.partitePerse !== stat.partitePerse ||
          oldStat.setVinti !== stat.setVinti ||
          oldStat.setPersi !== stat.setPersi
        ) {
          statisticheChanged = true;
          break;
        }
      }
    }
  }

  const hasChanges =
    newPlayedMatches.length > 0 ||
    updatedMatches.length > 0 ||
    classificaChanged ||
    statisticheChanged;

  return {
    hasChanges,
    newPlayedMatches,
    updatedMatches,
    classificaChanged,
    statisticheChanged,
  };
}

function formatMatchPreview(m: SnapshotPlayedMatch): string {
  if (m.puntiCasa !== null && m.puntiOspite !== null) {
    return `${m.squadraCasa} ${m.puntiCasa}-${m.puntiOspite} ${m.squadraOspite}`;
  }
  return `${m.squadraCasa} vs ${m.squadraOspite}`;
}

/**
 * Costruisce il payload della notifica push per un aggiornamento di campionato.
 */
export function buildChampionshipNotificationPayload(
  camId: number,
  championshipName: string,
  diff: ChampionshipSnapshotDiff
): PushMessagePayload {
  const cleanTitleName = championshipName?.trim() || `Campionato #${camId}`;
  const changedMatches = [...diff.newPlayedMatches, ...diff.updatedMatches];

  const title = `🏓 ${cleanTitleName}`;
  let body: string;

  if (changedMatches.length === 1) {
    const matchStr = formatMatchPreview(changedMatches[0]);
    body = `Nuovi match del tuo campionato disponibili (${matchStr}), vai a vedere le partite e statistiche!`;
  } else if (changedMatches.length > 1) {
    const previews = changedMatches.slice(0, 2).map(formatMatchPreview).join(', ');
    const extra =
      changedMatches.length > 2 ? ` e altri ${changedMatches.length - 2}` : '';
    body = `Nuovi match del tuo campionato disponibili (${previews}${extra}), vai a vedere le partite e statistiche!`;
  } else if (diff.classificaChanged) {
    body =
      'Nuovi match del tuo campionato disponibili: la classifica è aggiornata, vai a vedere le partite e statistiche!';
  } else {
    body =
      'Nuovi match del tuo campionato disponibili, vai a vedere le partite e statistiche!';
  }

  const targetTab =
    changedMatches.length > 0
      ? 'calendario'
      : diff.classificaChanged
        ? 'classifica'
        : 'statistiche';

  return {
    title,
    body,
    url: `/?view=campionato&cam=${camId}&tab=${targetTab}`,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: `campionato-${camId}-${Date.now()}`,
    renotify: true,
    data: {
      type: 'championship_update',
      camId,
      championshipName: cleanTitleName,
      newPlayedMatchesCount: diff.newPlayedMatches.length,
      updatedMatchesCount: diff.updatedMatches.length,
      classificaChanged: diff.classificaChanged,
      statisticheChanged: diff.statisticheChanged,
    },
  };
}

/**
 * Valuta uno snapshot di campionato rispetto allo stato persistente su Supabase
 * e, se rileva nuovi match disputati, variazioni di classifica o nuove statistiche,
 * invia la notifica push agli iscritti a quel campionato.
 */
async function evaluateSnapshotAndNotify(
  currSnapshot: ChampionshipMonitorSnapshot,
  options: { dryRun?: boolean; init?: boolean } = {}
): Promise<SingleChampionshipCheckResult> {
  const { camId, championshipName } = currSnapshot;
  const { dryRun = false, init = false } = options;
  const stateKey = getChampionshipStateKey(camId);

  const rawPrev = await pushService.getState(stateKey);

  // Primo avvio o reinizializzazione esplicita: salva il baseline senza inviare notifiche
  if (rawPrev === null || init) {
    if (!dryRun) {
      await pushService.setState(stateKey, JSON.stringify(currSnapshot));
      cachedSnapshots.set(camId, {
        snapshot: currSnapshot,
        timestamp: Date.now(),
      });
    }
    return {
      camId,
      championshipName,
      changed: false,
      initialized: true,
      newPlayedMatchesCount: 0,
      updatedMatchesCount: 0,
      classificaChanged: false,
      statisticheChanged: false,
      notificationSent: false,
    };
  }

  let prevSnapshot: ChampionshipMonitorSnapshot | null = null;
  try {
    prevSnapshot = JSON.parse(rawPrev) as ChampionshipMonitorSnapshot;
  } catch (err) {
    console.warn(
      `[CampionatoNotifier] Stato JSON non valido per cam=${camId}, reinizializzazione baseline...`
    );
  }

  if (!prevSnapshot || typeof prevSnapshot !== 'object') {
    if (!dryRun) {
      await pushService.setState(stateKey, JSON.stringify(currSnapshot));
      cachedSnapshots.set(camId, {
        snapshot: currSnapshot,
        timestamp: Date.now(),
      });
    }
    return {
      camId,
      championshipName,
      changed: false,
      initialized: true,
      newPlayedMatchesCount: 0,
      updatedMatchesCount: 0,
      classificaChanged: false,
      statisticheChanged: false,
      notificationSent: false,
    };
  }

  // Se le statistiche non erano presenti in questa osservazione parziale ma erano presenti prima,
  // preserva quelle precedenti così da non perdere il baseline.
  const mergedCurrSnapshot: ChampionshipMonitorSnapshot = {
    ...currSnapshot,
    statistiche:
      currSnapshot.statistiche.length > 0
        ? currSnapshot.statistiche
        : prevSnapshot.statistiche || [],
    classifica:
      currSnapshot.classifica.length > 0
        ? currSnapshot.classifica
        : prevSnapshot.classifica || [],
  };

  const diff = diffChampionshipSnapshots(prevSnapshot, mergedCurrSnapshot);

  if (!diff.hasChanges) {
    cachedSnapshots.set(camId, {
      snapshot: mergedCurrSnapshot,
      timestamp: Date.now(),
    });
    return {
      camId,
      championshipName,
      changed: false,
      newPlayedMatchesCount: 0,
      updatedMatchesCount: 0,
      classificaChanged: false,
      statisticheChanged: false,
      notificationSent: false,
    };
  }

  let broadcastResult: BroadcastResult | undefined;
  let notificationSent = false;

  if (!dryRun) {
    // Lock distribuito: solo la prima istanza serverless che aggiorna lo stato invia la push
    const claimed = await pushService.compareAndSetState(
      stateKey,
      rawPrev,
      JSON.stringify(mergedCurrSnapshot)
    );

    if (!claimed) {
      return {
        camId,
        championshipName,
        changed: false,
        newPlayedMatchesCount: 0,
        updatedMatchesCount: 0,
        classificaChanged: false,
        statisticheChanged: false,
        notificationSent: false,
      };
    }

    cachedSnapshots.set(camId, {
      snapshot: mergedCurrSnapshot,
      timestamp: Date.now(),
    });

    // Invalida le cache in-memory/disco del campionato così chi apre la notifica vede subito i dati freschi
    cacheService.delete(`classifica_${camId}`);
    cacheService.delete(`calendario_${camId}_${currSnapshot.annoId || 41}`);
    cacheService.delete(`statistiche_${camId}`);

    if (pushService.isReady()) {
      const payload = buildChampionshipNotificationPayload(
        camId,
        championshipName,
        diff
      );

      console.log(
        `[CampionatoNotifier] Rilevato aggiornamento per ${championshipName} (cam=${camId}): ` +
        `nuoviMatch=${diff.newPlayedMatches.length}, matchAggiornati=${diff.updatedMatches.length}, ` +
        `classifica=${diff.classificaChanged}, statistiche=${diff.statisticheChanged}. Invio push...`
      );

      broadcastResult = await pushService.sendToChampionshipSubscribers(
        camId,
        payload
      );
      notificationSent = broadcastResult.sent > 0;

      console.log(
        `[CampionatoNotifier] Notifiche inviate per cam=${camId}: ${broadcastResult.sent}/${broadcastResult.total}.`
      );
    }
  }

  return {
    camId,
    championshipName,
    changed: true,
    newPlayedMatchesCount: diff.newPlayedMatches.length,
    updatedMatchesCount: diff.updatedMatches.length,
    classificaChanged: diff.classificaChanged,
    statisticheChanged: diff.statisticheChanged,
    notificationSent,
    broadcastResult,
  };
}

/**
 * Controllo passivo ("piggyback") invocato quando il server carica i dati di un campionato
 * (es. in /api/dashboard o /api/refresh): se sono usciti nuovi match o è cambiata la classifica,
 * invia automaticamente la notifica push ai giocatori iscritti a quel campionato.
 */
const SUBSCRIBED_CAMS_TTL_MS = 30 * 60 * 1000; // 30 minuti
let subscribedCamsCache: { ids: Set<number>; timestamp: number } | null = null;

/** Da chiamare quando cambiano le iscrizioni, così la cache viene ricaricata al prossimo controllo. */
export function invalidateSubscribedChampionshipsCache(): void {
  subscribedCamsCache = null;
}

async function isChampionshipFollowed(camId: number): Promise<boolean> {
  if (!subscribedCamsCache || Date.now() - subscribedCamsCache.timestamp > SUBSCRIBED_CAMS_TTL_MS) {
    const ids = await pushService.getSubscribedChampionshipIds();
    subscribedCamsCache = { ids: new Set(ids), timestamp: Date.now() };
  }
  return subscribedCamsCache.ids.has(camId);
}

export async function notifyObservedChampionshipIfNeeded(
  input: ObservedChampionshipInput
): Promise<SingleChampionshipCheckResult | null> {
  if (!pushService.isSupabaseConfigured()) {
    return null;
  }

  try {
    if (!(await isChampionshipFollowed(input.camId))) {
      return null;
    }
  } catch (err) {
    console.warn(`[CampionatoNotifier] Impossibile leggere le iscrizioni per cam=${input.camId}:`, err);
    return null;
  }

  const currSnapshot = buildChampionshipSnapshot(input);
  if (!currSnapshot) {
    return null;
  }

  const { camId } = currSnapshot;
  if (inFlightChecks.has(camId)) {
    return null;
  }

  // Fast-path in-memory: se abbiamo già verificato di recente lo stesso stato senza differenze, evita query a Supabase
  const cached = cachedSnapshots.get(camId);
  if (cached && Date.now() - cached.timestamp < SNAPSHOT_CACHE_TTL_MS) {
    const quickDiff = diffChampionshipSnapshots(cached.snapshot, currSnapshot);
    if (!quickDiff.hasChanges) {
      return null;
    }
  }

  inFlightChecks.add(camId);
  try {
    return await evaluateSnapshotAndNotify(currSnapshot);
  } catch (err) {
    console.warn(
      `[CampionatoNotifier] Errore controllo passivo campionato ${camId}:`,
      err
    );
    return null;
  } finally {
    inFlightChecks.delete(camId);
  }
}

/**
 * Scarica da FITeT i dati freschi di un singolo campionato (classifica, calendario, statistiche)
 * e costruisce il relativo snapshot.
 */
export async function fetchChampionshipSnapshotFromFitet(
  camId: number,
  annoId = 41
): Promise<ChampionshipMonitorSnapshot | null> {
  const [classificaHtml, calendarioHtml, statisticheHtml, champMeta] =
    await withFitetCacheBypass(() =>
      Promise.all([
        FitetClient.fetchClassifica(camId).catch(() => ''),
        FitetClient.fetchCalendario(camId, annoId).catch(() => ''),
        FitetClient.fetchStatisticheAtleti(camId).catch(() => ''),
        championshipCatalog.getChampionship(camId).catch(() => undefined),
      ])
    );

  const classifica = classificaHtml ? parseClassifica(classificaHtml) : [];
  const calendario = calendarioHtml ? parseCalendario(calendarioHtml) : [];
  const statisticheAtleti = statisticheHtml
    ? parseStatisticheAtleti(statisticheHtml, {})
    : [];

  return buildChampionshipSnapshot({
    camId,
    annoId: champMeta?.anno || annoId,
    championshipName: champMeta?.nome || `Campionato #${camId}`,
    classifica,
    calendario,
    statisticheAtleti,
  });
}

/**
 * Assicura che per il campionato indicato esista già un baseline salvato su Supabase.
 * Utile quando un utente attiva le notifiche o imposta il proprio profilo/campionato.
 */
export async function ensureChampionshipBaseline(
  camId: number,
  annoId = 41
): Promise<void> {
  if (!Number.isFinite(camId) || camId <= 0 || !pushService.isSupabaseConfigured()) {
    return;
  }

  try {
    const stateKey = getChampionshipStateKey(camId);
    const existing = await pushService.getState(stateKey);
    if (existing !== null) return;

    const snapshot = await fetchChampionshipSnapshotFromFitet(camId, annoId);
    if (!snapshot) return;

    await pushService.setState(stateKey, JSON.stringify(snapshot));
    cachedSnapshots.set(camId, {
      snapshot,
      timestamp: Date.now(),
    });
    console.log(
      `[CampionatoNotifier] Baseline inizializzato per ${snapshot.championshipName} (cam=${camId}).`
    );
  } catch (err) {
    console.warn(
      `[CampionatoNotifier] Impossibile inizializzare baseline per cam=${camId}:`,
      err
    );
  }
}

/**
 * Controlla attivamente i campionati seguiti dagli utenti iscritti alle notifiche push
 * (oppure una lista specifica di `camIds`) e invia una notifica se rileva nuovi match,
 * cambi di classifica o aggiornamenti delle statistiche.
 */
export async function checkChampionshipsAndNotify(
  options: CheckChampionshipsOptions = {}
): Promise<CheckChampionshipsResult> {
  const startTime = Date.now();
  const { annoId = 41, dryRun = false, init = false } = options;

  let targetCamIds: number[] = [];
  if (Array.isArray(options.camIds) && options.camIds.length > 0) {
    targetCamIds = Array.from(
      new Set(options.camIds.filter((id) => Number.isFinite(id) && id > 0))
    );
  } else {
    targetCamIds = await pushService.getSubscribedChampionshipIds();
  }

  if (targetCamIds.length === 0) {
    return {
      checkedCount: 0,
      changedCount: 0,
      initializedCount: 0,
      results: [],
      durationMs: Date.now() - startTime,
    };
  }

  const results: SingleChampionshipCheckResult[] = [];
  const concurrency = 4;

  for (let i = 0; i < targetCamIds.length; i += concurrency) {
    const batch = targetCamIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (camId) => {
        try {
          const snapshot = await fetchChampionshipSnapshotFromFitet(camId, annoId);
          if (!snapshot) {
            return null;
          }
          return await evaluateSnapshotAndNotify(snapshot, { dryRun, init });
        } catch (err) {
          console.warn(
            `[CampionatoNotifier] Errore controllo campionato ${camId}:`,
            err
          );
          return null;
        }
      })
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  const changedCount = results.filter((r) => r.changed).length;
  const initializedCount = results.filter((r) => r.initialized).length;

  return {
    checkedCount: results.length,
    changedCount,
    initializedCount,
    results,
    durationMs: Date.now() - startTime,
  };
}

export interface CheckMatchdayOptions {
  camIds?: number[];
  annoId?: number;
  date?: string; // Formato YYYY-MM-DD oppure DD/MM/YYYY
  dryRun?: boolean;
  force?: boolean;
}

export interface SingleMatchdayCheckResult {
  camId: number;
  championshipName: string;
  isMatchday: boolean;
  matchesCount: number;
  alreadyNotified: boolean;
  notificationSent: boolean;
  tag: string;
  broadcastResult?: BroadcastResult;
}

export interface CheckMatchdayResult {
  dateISO: string;
  dateIT: string;
  checkedCount: number;
  matchdayChampionshipsCount: number;
  notificationsSentCount: number;
  results: SingleMatchdayCheckResult[];
  durationMs: number;
}

export function getTodayDateRome(): { dateIT: string; dateISO: string } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const parts = new Intl.DateTimeFormat('it-IT', options).formatToParts(now);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '2026';

  return {
    dateIT: `${day}/${month}/${year}`,
    dateISO: `${year}-${month}-${day}`,
  };
}

export function parseDateInput(raw?: string): { dateIT: string; dateISO: string } {
  if (!raw) return getTodayDateRome();
  const trimmed = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return {
      dateISO: trimmed,
      dateIT: `${d}/${m}/${y}`,
    };
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const parts = trimmed.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    return {
      dateISO: `${y}-${m}-${d}`,
      dateIT: `${d}/${m}/${y}`,
    };
  }

  return getTodayDateRome();
}

function normalizeDateMatch(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    const d = String(parseInt(parts[0], 10)).padStart(2, '0');
    const m = String(parseInt(parts[1], 10)).padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = `20${y}`;
    return `${d}/${m}/${y}`;
  }
  return dateStr.trim();
}

/**
 * Controlla se oggi (o alla data specificata) ci sono incontri in programma
 * nei campionati a cui gli utenti sono iscritti e invia la notifica push del giorno di gara.
 */
export async function checkMatchdayAndNotify(
  options: CheckMatchdayOptions = {}
): Promise<CheckMatchdayResult> {
  const startTime = Date.now();
  const { annoId = 41, dryRun = false, force = false } = options;
  const { dateIT, dateISO } = parseDateInput(options.date);
  const targetTag = `matchday-${dateISO}`;

  let targetCamIds: number[] = [];
  if (Array.isArray(options.camIds) && options.camIds.length > 0) {
    targetCamIds = Array.from(
      new Set(options.camIds.filter((id) => Number.isFinite(id) && id > 0))
    );
  } else {
    targetCamIds = await pushService.getSubscribedChampionshipIds();
  }

  if (targetCamIds.length === 0) {
    return {
      dateISO,
      dateIT,
      checkedCount: 0,
      matchdayChampionshipsCount: 0,
      notificationsSentCount: 0,
      results: [],
      durationMs: Date.now() - startTime,
    };
  }

  const results: SingleMatchdayCheckResult[] = [];
  const normalizedTargetIT = normalizeDateMatch(dateIT);

  for (const camId of targetCamIds) {
    try {
      const [calendarioHtml, champMeta] = await Promise.all([
        FitetClient.fetchCalendario(camId, annoId).catch(() => ''),
        championshipCatalog.getChampionship(camId).catch(() => undefined),
      ]);

      const championshipName = champMeta?.nome?.trim() || `Campionato #${camId}`;
      const calendario = calendarioHtml ? parseCalendario(calendarioHtml) : [];

      let matchesTodayCount = 0;
      for (const g of calendario) {
        const allMatches = [...(g.partiteAndata || []), ...(g.partiteRitorno || [])];
        for (const m of allMatches) {
          if (normalizeDateMatch(m.data) === normalizedTargetIT) {
            matchesTodayCount++;
          }
        }
      }

      const isMatchday = matchesTodayCount > 0;
      if (!isMatchday) {
        results.push({
          camId,
          championshipName,
          isMatchday: false,
          matchesCount: 0,
          alreadyNotified: false,
          notificationSent: false,
          tag: targetTag,
        });
        continue;
      }

      // Verifica se già inviata oggi per questo campionato
      const stateKey = `matchday_notified_${camId}_${dateISO}`;
      const existing = await pushService.getState(stateKey);
      const alreadyNotified = Boolean(existing && existing === 'sent');

      if (alreadyNotified && !force) {
        results.push({
          camId,
          championshipName,
          isMatchday: true,
          matchesCount: matchesTodayCount,
          alreadyNotified: true,
          notificationSent: false,
          tag: targetTag,
        });
        continue;
      }

      // Payload della notifica con tag univoco per la giornata
      const payload: PushMessagePayload = {
        title: '🏓 Oggi è giorno di campionato!',
        body: 'Buona fortuna al tavolo! Stasera passa dal portale a controllare referti e variazione punti.',
        url: `/?view=campionato&cam=${camId}&tab=calendario`,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: targetTag,
        renotify: false,
        data: {
          type: 'championship_matchday',
          camId,
          date: dateISO,
          url: `/?view=campionato&cam=${camId}&tab=calendario`,
        },
      };

      let broadcastResult: BroadcastResult | undefined = undefined;
      let notificationSent = false;

      if (!dryRun && pushService.isReady()) {
        console.log(
          `[CampionatoNotifier] Oggi è giorno di campionato per ${championshipName} (${matchesTodayCount} match il ${dateIT}). Invio push (tag=${targetTag})...`
        );

        broadcastResult = await pushService.sendToChampionshipSubscribers(camId, payload);
        notificationSent = (broadcastResult?.sent || 0) > 0;

        await pushService.setState(stateKey, 'sent');
      }

      results.push({
        camId,
        championshipName,
        isMatchday: true,
        matchesCount: matchesTodayCount,
        alreadyNotified,
        notificationSent,
        tag: targetTag,
        broadcastResult,
      });
    } catch (err) {
      console.warn(`[CampionatoNotifier] Errore verifica matchday per cam=${camId}:`, err);
    }
  }

  const matchdayChampionshipsCount = results.filter((r) => r.isMatchday).length;
  const notificationsSentCount = results.filter((r) => r.notificationSent).length;

  return {
    dateISO,
    dateIT,
    checkedCount: results.length,
    matchdayChampionshipsCount,
    notificationsSentCount,
    results,
    durationMs: Date.now() - startTime,
  };
}

let championshipSchedulerTimer: NodeJS.Timeout | null = null;

/**
 * Avvia un controllo periodico (ogni 60 minuti) sui campionati seguiti dagli iscritti
 * quando il server gira come processo Node continuativo.
 */
export function startChampionshipScheduler(): void {
  if (championshipSchedulerTimer) return;

  const intervalMs = 60 * 60 * 1000; // 60 minuti
  championshipSchedulerTimer = setInterval(() => {
    checkChampionshipsAndNotify().catch((err) => {
      console.warn(
        '[CampionatoNotifier] Errore durante il controllo periodico campionati:',
        err
      );
    });
    checkMatchdayAndNotify().catch((err) => {
      console.warn(
        '[CampionatoNotifier] Errore durante il controllo periodico matchday:',
        err
      );
    });
  }, intervalMs);

  if (typeof championshipSchedulerTimer.unref === 'function') {
    championshipSchedulerTimer.unref();
  }
}
