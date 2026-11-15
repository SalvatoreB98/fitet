import { getLatestIdClass } from './rankingClassService';
import {
    notifyRankingChangeIfNeeded,
    type RankingChangeResult,
} from './pushService';
import {
    checkChampionshipsAndNotify,
    checkMatchdayAndNotify,
    type CheckChampionshipsOptions,
    type CheckChampionshipsResult,
    type CheckMatchdayOptions,
    type CheckMatchdayResult,
} from './campionatoNotificationService';
import {
    checkNewTorneiAndNotify,
    type CheckNewTorneiOptions,
    type CheckNewTorneiResult,
} from './torneiNotificationService';
import { youtubeSyncService } from './youtubeSyncService';

/**
 * Runner condivisi tra lo scheduler node-cron e le route HTTP /api/push/*.
 *
 * Invocano direttamente la logica dei service, senza passare da fetch HTTP
 * verso il server locale: nessun overhead di rete, nessun problema di porta/SSL.
 */

export interface RankingCheckResult {
    idClass: number;
    ranking: RankingChangeResult;
    championships: CheckChampionshipsResult | null;
    matchday: CheckMatchdayResult | null;
}

export type VideoSyncResult = Awaited<ReturnType<typeof youtubeSyncService.syncAllChannels>>;

/**
 * Rileva l'ID_CLASS corrente e verifica in parallelo ranking, campionati seguiti
 * e matchday (stessa logica del vecchio cron /api/push/check-ranking).
 */
export async function runRankingCheck(): Promise<RankingCheckResult> {
    const idClass = await getLatestIdClass(true, false);
    const [ranking, championshipsResult, matchdayResult] = await Promise.all([
        notifyRankingChangeIfNeeded(idClass),
        checkChampionshipsAndNotify().catch((err) => {
            console.warn('[CronJobs] Errore controllo campionati durante check-ranking:', err);
            return null;
        }),
        checkMatchdayAndNotify().catch((err) => {
            console.warn('[CronJobs] Errore controllo matchday durante check-ranking:', err);
            return null;
        }),
    ]);

    return {
        idClass,
        ranking,
        championships: championshipsResult,
        matchday: matchdayResult,
    };
}

export async function runChampionshipsCheck(
    options: CheckChampionshipsOptions = {}
): Promise<CheckChampionshipsResult> {
    return checkChampionshipsAndNotify(options);
}

export async function runMatchdayCheck(
    options: CheckMatchdayOptions = {}
): Promise<CheckMatchdayResult> {
    return checkMatchdayAndNotify(options);
}

export async function runTorneiCheck(
    options: CheckNewTorneiOptions = {}
): Promise<CheckNewTorneiResult> {
    return checkNewTorneiAndNotify(options);
}

export async function runVideoSync(): Promise<VideoSyncResult> {
    return youtubeSyncService.syncAllChannels();
}
