import { FitetClient } from './fitetClient';
import { cacheService } from './cacheService';
import { notifyRankingChangeIfNeeded } from './pushService';

export const DEFAULT_ID_CLASS = 248;

/**
 * Rileva dinamicamente l'ID_CLASS della classifica più recente da portale.fitet.org/menu.php.
 * Quando esce il mese nuovo (es. 249, 250...), viene rilevato automaticamente senza modifiche al codice.
 * Se non disponibile o in caso di errore, fa fallback sicuro su DEFAULT_ID_CLASS.
 */
export async function getLatestIdClass(
    forceRefresh = false,
    notifyOnChange = true
): Promise<number> {
    const cacheKey = 'latest_ranking_id_class';
    if (!forceRefresh) {
        const cached = cacheService.get<number>(cacheKey);
        if (cached && typeof cached === 'number' && cached >= DEFAULT_ID_CLASS) {
            return cached;
        }
    }
    try {
        const html = await FitetClient.fetchHtml('https://portale.fitet.org/menu.php');
        const match = html.match(/testaclassifica_auto\.php\?ID_CLASS=(\d+)/i);
        if (match && match[1]) {
            const detected = parseInt(match[1], 10);
            if (detected >= DEFAULT_ID_CLASS) {
                cacheService.set(cacheKey, detected, 4 * 60 * 60 * 1000); // 4 ore di cache

                // Trigger automatico: se l'ID_CLASS è cambiato rispetto all'ultima
                // notifica salvata su Supabase, invia la push a tutti i dispositivi.
                // Fire-and-forget: non blocca la risposta API.
                if (notifyOnChange) {
                    notifyRankingChangeIfNeeded(detected).catch((pushErr) => {
                        console.warn('[PushService] Errore notifica cambio ID_CLASS:', pushErr);
                    });
                }

                return detected;
            }
        }
    } catch (err) {
        console.warn('[Ranking] Impossibile rilevare automaticamente ID_CLASS da menu.php, uso fallback:', err);
    }
    return DEFAULT_ID_CLASS;
}
