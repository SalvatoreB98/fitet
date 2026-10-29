import fs from 'fs';
import path from 'path';
import { FitetClient } from './server/services/fitetClient';
import {
    pushService,
    notifyRankingChangeIfNeeded,
    RANKING_ID_CLASS_STATE_KEY,
} from './server/services/pushService';

// Percorso del file test.php
const TEST_PHP_PATH = path.resolve(process.cwd(), 'test.php');

// Funzione per estrarre l'ID_CLASS dal contenuto HTML di test.php
function extractIdClassFromHtml(html: string): number {
    const match = html.match(/testaclassifica_auto\.php\?ID_CLASS=(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
}

// Configura FitetClient per leggere test.php locale
FitetClient.fetchHtml = async (target: string = 'test.php') => {
    const targetFile = target.endsWith('.php') ? path.resolve(process.cwd(), target) : TEST_PHP_PATH;
    if (!fs.existsSync(targetFile)) {
        throw new Error(`File non trovato: ${targetFile}`);
    }
    return fs.promises.readFile(targetFile, 'utf8');
};

async function executeCheck(isSimulation: boolean) {
    if (!fs.existsSync(TEST_PHP_PATH)) {
        console.error(`❌ File non trovato: ${TEST_PHP_PATH}`);
        return;
    }

    const html = await fs.promises.readFile(TEST_PHP_PATH, 'utf8');
    const detectedIdClass = extractIdClassFromHtml(html);

    if (!detectedIdClass) {
        console.warn('⚠️  Nessun "ID_CLASS=..." trovato dentro test.php!');
        return;
    }

    const previousStored = await pushService.getState(RANKING_ID_CLASS_STATE_KEY);
    console.log(`\n========================================================`);
    console.log(`📄 [test.php] ID_CLASS letto dal file:  ${detectedIdClass}`);
    console.log(`💾 [Database] Ultimo ID_CLASS registrato: ${previousStored ?? '(Nessuno - primo avvio)'}`);

    const result = await notifyRankingChangeIfNeeded(detectedIdClass);

    if (result.changed) {
        console.log(`🚀 [NOTIFICA TRIGGERATA!]`);
        console.log(`   Nuova classifica rilevata: ${result.previousIdClass} -> ${result.idClass}`);
        console.log(`   📱 Dispositivi totali: ${result.total}`);
        console.log(`   ✅ Notifiche inviate: ${result.sent}`);
        console.log(`   ❌ Fallite: ${result.failed}`);
        if (result.removed) {
            console.log(`   🗑️ Subscriptions rimosse perché obsolete: ${result.removed}`);
        }
    } else if (result.initialized) {
        console.log(`📌 [Baseline Inizializzata]`);
        console.log(`   Il database ha memorizzato ID_CLASS = ${result.idClass} come valore di partenza.`);
        console.log(`   👉 Nessuna notifica al primo avvio (comportamento atteso).`);
        console.log(`   👉 Ora modifica test.php con un ID superiore (es. ${result.idClass + 1}) e risalva!`);
    } else {
        console.log(`ℹ️  [Nessun cambiamento]`);
        console.log(`   L'ID_CLASS (${detectedIdClass}) è uguale o inferiore al precedente (${result.previousIdClass}).`);
        console.log(`   👉 Per inviare una notifica, apri test.php e imposta un ID > ${result.previousIdClass}.`);
    }
    console.log(`========================================================\n`);
}

async function main() {
    const args = process.argv.slice(2);
    const isMock = args.includes('--mock');
    const isWatch = args.includes('--watch') || !args.includes('--once');
    const baselineArgIdx = args.indexOf('--baseline');

    if (isMock) {
        console.log('ℹ️  Modalità SIMULAZIONE attiva (In-Memory Mock).');
        const inMemory = new Map<string, string>();
        pushService.isReady = () => true;
        pushService.getState = async (k) => inMemory.get(k) ?? null;
        pushService.setState = async (k, v) => {
            if (v === null || v === undefined) inMemory.delete(k);
            else inMemory.set(k, String(v));
        };
        pushService.compareAndSetState = async (k, exp, nxt) => {
            if (inMemory.get(k) === exp) {
                inMemory.set(k, nxt);
                return true;
            }
            return false;
        };
        pushService.sendToAll = async (payload) => {
            console.log(`[MOCK Broadcast] "${payload.title}" -> ${payload.body}`);
            return { total: 1, sent: 1, failed: 0, removed: 0 };
        };
    } else {
        if (!pushService.isReady()) {
            console.warn('⚠️  Credenziali Supabase/VAPID non trovate o incomplete in .env.');
            console.warn('   Eseguo in modalità simulazione mock...');
            return mainWithMock();
        }
        console.log('✅ Connesso a Supabase e VAPID reali.');
    }

    // Se l'utente specifica un baseline da cui partire (es. --baseline 248)
    if (baselineArgIdx !== -1 && args[baselineArgIdx + 1]) {
        const forcedBaseline = args[baselineArgIdx + 1];
        await pushService.setState(RANKING_ID_CLASS_STATE_KEY, forcedBaseline);
        console.log(`🎯 Baseline forzato nel DB a ID_CLASS = ${forcedBaseline}`);
    }

    // Se l'utente specifica --reset, pulisce lo stato
    if (args.includes('--reset')) {
        await pushService.deleteState(RANKING_ID_CLASS_STATE_KEY);
        console.log('🗑️ Stato nel DB resettato a vuoto.');
    }

    // Esegui il controllo immediato
    await executeCheck(isMock);

    // Se watch mode è abilitato, resta in ascolto delle modifiche su test.php
    if (isWatch) {
        console.log(`👀 In ascolto delle modifiche su: ${TEST_PHP_PATH}`);
        console.log(`   💡 Suggerimento: apri test.php, modifica ID_CLASS=... e salva il file (Ctrl+S).`);
        console.log(`   (Premi Ctrl+C nel terminale per uscire)\n`);

        let debounceTimeout: NodeJS.Timeout | null = null;
        fs.watch(TEST_PHP_PATH, (_event) => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(async () => {
                console.log(`📝 Rilevata modifica e salvataggio di test.php...`);
                try {
                    await executeCheck(isMock);
                } catch (err: any) {
                    console.error('❌ Errore durante il controllo:', err.message);
                }
            }, 300);
        });
    }
}

async function mainWithMock() {
    process.argv.push('--mock');
    return main();
}

main().catch((err) => {
    console.error('❌ Errore irreversibile:', err);
    process.exit(1);
});
