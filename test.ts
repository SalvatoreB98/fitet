import { FitetClient } from './server/services/fitetClient';
import {
    pushService,
    notifyRankingChangeIfNeeded,
    RANKING_ID_CLASS_STATE_KEY,
} from './server/services/pushService';

async function runTest() {
    const isLive = process.argv.includes('--live');

    if (!isLive) {
        console.log('ℹ️  Modalità simulazione attiva (In-Memory Mock).');
        console.log('   (Per testare con Supabase e VAPID reali, esegui con: npx tsx test.ts --live)\n');

        // Store in memoria per simulare Supabase push_state
        const inMemoryState = new Map<string, string>();

        // Mock dei metodi di pushService per isolare il test della logica
        pushService.isReady = () => true;
        pushService.getState = async (key: string) => inMemoryState.get(key) ?? null;
        pushService.setState = async (key: string, value: string | null) => {
            if (value === null || value === undefined) {
                inMemoryState.delete(key);
            } else {
                inMemoryState.set(key, String(value));
            }
        };
        pushService.compareAndSetState = async (key: string, expected: string, next: string) => {
            const current = inMemoryState.get(key);
            if (current === expected) {
                inMemoryState.set(key, next);
                return true;
            }
            return false;
        };
        pushService.sendToAll = async (payload) => {
            console.log(`[MOCK PushService] Simulazione invio broadcast: "${payload.title}" (${payload.tag})`);
            return { total: 5, sent: 5, failed: 0, removed: 0 };
        };
    } else {
        console.log('⚠️  Modalità LIVE attiva: utilizzo di Supabase e VAPID reali da .env');
        if (!pushService.isReady()) {
            console.error('❌ pushService non è configurato (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_* mancanti in .env).');
            process.exit(1);
        }
    }

    // 1. Reset preventivo dello stato precedente (per simulare il primo avvio)
    await pushService.setState(RANKING_ID_CLASS_STATE_KEY, null as any);

    // 2. Mock diretto di FitetClient.fetchHtml
    let currentMockedId = 100;

    FitetClient.fetchHtml = async (url: string) => {
        console.log(`[MOCK FitetClient] Richiesta a: ${url} -> Ritorno ID_CLASS=${currentMockedId}`);
        return `<html><body><a href="testaclassifica_auto.php?ID_CLASS=${currentMockedId}">Classifica</a></body></html>`;
    };

    // Helper che replica il parsing dell'ID_CLASS
    async function checkOnce() {
        const html = await FitetClient.fetchHtml('https://portale.fitet.org/menu.php');
        const match = html.match(/testaclassifica_auto\.php\?ID_CLASS=(\d+)/i);
        const idClass = match ? parseInt(match[1], 10) : 0;
        return notifyRankingChangeIfNeeded(idClass);
    }

    console.log('--- TEST 1: Primo avvio (Baseline) ---');
    const res1 = await checkOnce();
    console.log('Risultato 1:', res1);
    if (!res1.initialized || res1.changed || res1.idClass !== 100) {
        throw new Error(`Test 1 fallito: risultato inatteso ${JSON.stringify(res1)}`);
    }

    console.log('\n--- TEST 2: Stesso ID_CLASS (Nessun cambiamento) ---');
    const res2 = await checkOnce();
    console.log('Risultato 2:', res2);
    if (res2.changed || res2.idClass !== 100 || res2.previousIdClass !== 100) {
        throw new Error(`Test 2 fallito: risultato inatteso ${JSON.stringify(res2)}`);
    }

    console.log('\n--- TEST 3: Nuovo ID_CLASS rilevato (Trigger Push) ---');
    currentMockedId = 101; // Simuliamo l'uscita della nuova classifica
    const res3 = await checkOnce();
    console.log('Risultato 3:', res3);
    if (!res3.changed || res3.idClass !== 101 || res3.previousIdClass !== 100 || !res3.sent) {
        throw new Error(`Test 3 fallito: risultato inatteso ${JSON.stringify(res3)}`);
    }

    console.log('\n--- TEST 4: ID_CLASS inferiore/uguale (Nessun downgrade) ---');
    currentMockedId = 99; // Simuliamo fallback o richiesta vecchia
    const res4 = await checkOnce();
    console.log('Risultato 4:', res4);
    if (res4.changed || res4.idClass !== 99 || res4.previousIdClass !== 101) {
        throw new Error(`Test 4 fallito: risultato inatteso ${JSON.stringify(res4)}`);
    }

    console.log('\n✅ TUTTI I TEST COMPLETATI CON SUCCESSO!');
}

runTest().catch((err) => {
    console.error('❌ Errore durante il test:', err);
    process.exit(1);
});