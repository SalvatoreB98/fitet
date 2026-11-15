import cron, { type ScheduledTask } from 'node-cron';
import {
    runRankingCheck,
    runChampionshipsCheck,
    runMatchdayCheck,
    runTorneiCheck,
    runVideoSync,
} from './cronJobs';

/**
 * Scheduler dei job periodici eseguiti direttamente dal processo Node su Railway.
 *
 * Sostituisce i cron definiti in vercel.json: ogni job invoca la logica dei service
 * senza passare da una chiamata HTTP verso localhost. Le route /api/push/* e
 * /api/videos/sync restano disponibili per test manuali protetti da CRON_SECRET.
 */

export const CRON_TIMEZONE = 'Europe/Rome';

interface CronJob {
    name: string;
    schedule: string;
    description: string;
    /** Lock per evitare esecuzioni sovrapposte dello stesso job. */
    isRunning: boolean;
    run: () => Promise<unknown>;
}

export const CRON_JOBS: CronJob[] = [
    {
        name: 'check-ranking',
        schedule: '0 9 * * *',
        description: 'Rileva il nuovo ID_CLASS FITeT e controlla campionati/matchday',
        isRunning: false,
        run: () => runRankingCheck(),
    },
    {
        name: 'check-tornei',
        schedule: '0 9 * * *',
        description: 'Scansiona i tornei nazionali/regionali e notifica i nuovi',
        isRunning: false,
        run: () => runTorneiCheck(),
    },
    {
        name: 'check-campionati',
        schedule: '0 19 * * *',
        description: 'Controlla i campionati seguiti dagli iscritti alle push',
        isRunning: false,
        run: () => runChampionshipsCheck(),
    },
    {
        name: 'check-matchday',
        schedule: '0 8 * * *',
        description: 'Notifica gli utenti se oggi è giorno di campionato',
        isRunning: false,
        run: () => runMatchdayCheck(),
    },
    {
        name: 'videos-sync',
        schedule: '0 7 * * *',
        description: 'Sincronizza i video dei canali YouTube',
        isRunning: false,
        run: () => runVideoSync(),
    },
];

const scheduledTasks = new Map<string, ScheduledTask>();

// Guard globale: sopravvive all'hot-reload del modulo e impedisce
// registrazioni multiple degli stessi cron.
const GLOBAL_FLAG = '__fitetCronSchedulerStarted__';

function isAlreadyStarted(): boolean {
    return Boolean((globalThis as unknown as Record<string, unknown>)[GLOBAL_FLAG]);
}

function markStarted(started: boolean): void {
    (globalThis as unknown as Record<string, unknown>)[GLOBAL_FLAG] = started;
}

function shouldStartScheduler(): boolean {
    if (process.env.CRON_DISABLED === 'true') return false;
    if (process.env.FORCE_CRON_SCHEDULER === 'true') return true;
    if (process.env.NODE_ENV === 'production') return true;
    // Railway non imposta sempre NODE_ENV: se il processo gira su Railway
    // consideriamo l'ambiente come produzione (ma mai in development esplicito).
    const isRailway = Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID
    );
    return isRailway && process.env.NODE_ENV !== 'development';
}

function formatDuration(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function runJob(job: CronJob): Promise<void> {
    if (job.isRunning) {
        console.warn(`[Cron] "${job.name}" saltato: esecuzione precedente ancora in corso.`);
        return;
    }

    job.isRunning = true;
    const startedAt = Date.now();
    console.log(`[Cron] ▶ "${job.name}" avviato (${job.description})`);

    try {
        await job.run();
        console.log(`[Cron] ✓ "${job.name}" completato in ${formatDuration(Date.now() - startedAt)}.`);
    } catch (err) {
        console.error(
            `[Cron] ✗ "${job.name}" fallito dopo ${formatDuration(Date.now() - startedAt)}:`,
            err
        );
    } finally {
        job.isRunning = false;
    }
}

/**
 * Registra una sola volta i cron node-cron. Da chiamare all'avvio del server
 * di produzione (server/index.ts). In sviluppo non parte, a meno di
 * FORCE_CRON_SCHEDULER=true.
 */
export function startCronScheduler(): void {
    if (isAlreadyStarted()) {
        console.log('[Cron] Scheduler già inizializzato, nessuna nuova registrazione.');
        return;
    }

    if (!shouldStartScheduler()) {
        console.log(
            `[Cron] Scheduler non avviato (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}). ` +
            'Imposta NODE_ENV=production o FORCE_CRON_SCHEDULER=true per attivarlo.'
        );
        return;
    }

    markStarted(true);

    for (const job of CRON_JOBS) {
        if (!cron.validate(job.schedule)) {
            console.error(`[Cron] Espressione non valida per "${job.name}": ${job.schedule}`);
            continue;
        }

        const task = cron.schedule(
            job.schedule,
            () => {
                void runJob(job);
            },
            {
                timezone: CRON_TIMEZONE,
                name: `fitet-${job.name}`,
            }
        );

        scheduledTasks.set(job.name, task);
        const nextRun = task.getNextRun();
        console.log(
            `[Cron] Programmato "${job.name}" (${job.schedule} ${CRON_TIMEZONE})` +
            (nextRun ? ` — prossima esecuzione: ${nextRun.toISOString()}` : '')
        );
    }
}

/** Ferma e deregistra tutti i cron (utile per shutdown controllato o test). */
export function stopCronScheduler(): void {
    for (const [name, task] of scheduledTasks) {
        try {
            task.stop();
            task.destroy();
        } catch (err) {
            console.warn(`[Cron] Errore fermando "${name}":`, err);
        }
    }
    scheduledTasks.clear();
    markStarted(false);
    console.log('[Cron] Scheduler fermato.');
}

export interface CronSchedulerStatus {
    name: string;
    schedule: string;
    description: string;
    isRunning: boolean;
    scheduled: boolean;
    nextRun: string | null;
}

export function getCronSchedulerStatus(): CronSchedulerStatus[] {
    return CRON_JOBS.map((job) => ({
        name: job.name,
        schedule: job.schedule,
        description: job.description,
        isRunning: job.isRunning,
        scheduled: scheduledTasks.has(job.name),
        nextRun: scheduledTasks.get(job.name)?.getNextRun()?.toISOString() ?? null,
    }));
}
