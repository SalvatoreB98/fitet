import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carica le variabili d'ambiente in locale (in Vercel sono già disponibili).
dotenv.config();

export interface PushSubscriptionPayload {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface StoredPushSubscription {
    id?: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string | null;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
    last_seen_at?: string;
}

export interface PushMessagePayload {
    title: string;
    body: string;
    url?: string;
    icon?: string;
    badge?: string;
    image?: string;
    tag?: string;
    renotify?: boolean;
    vibrate?: number[];
    data?: Record<string, unknown>;
}

export interface PushSendResult {
    sent: boolean;
    statusCode?: number;
    error?: string;
    removed?: boolean;
}

export interface BroadcastResult {
    total: number;
    sent: number;
    failed: number;
    removed: number;
}

/**
 * PushService
 *
 * Gestisce:
 * - la configurazione VAPID (Web Push);
 * - il salvataggio/rimozione delle subscription su Supabase;
 * - l'invio di notifiche a una singola subscription o a tutti i dispositivi;
 * - lo stato persistente dell'ultimo ID_CLASS notificato.
 */
class PushService {
    private supabase: SupabaseClient | null = null;
    private vapidConfigured = false;
    private publicKey: string | null = null;
    private privateKey: string | null = null;
    private subject = 'mailto:noreply@portale-risultati-tt.it';

    constructor() {
        this.initSupabase();
        this.initVapid();
    }

    private initSupabase() {
        const url = process.env.SUPABASE_URL;
        // Per le notifiche push serve la service role: la tabella è protetta da RLS.
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            console.warn(
                '⚠️ [PushService] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non configurate: le notifiche push non saranno salvate.'
            );
            return;
        }

        try {
            this.supabase = createClient(url, key, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            });
            console.log('✅ [PushService] Supabase connesso.');
        } catch (err) {
            console.error('❌ [PushService] Errore inizializzazione Supabase:', err);
            this.supabase = null;
        }
    }

    private initVapid() {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT || this.subject;

        if (!publicKey || !privateKey) {
            console.warn(
                '⚠️ [PushService] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non configurate: impossibile inviare push.'
            );
            return;
        }

        try {
            webpush.setVapidDetails(subject, publicKey, privateKey);
            this.publicKey = publicKey;
            this.privateKey = privateKey;
            this.subject = subject;
            this.vapidConfigured = true;
            console.log('✅ [PushService] VAPID configurato.');
        } catch (err) {
            console.error('❌ [PushService] Errore configurazione VAPID:', err);
        }
    }

    isVapidConfigured(): boolean {
        return this.vapidConfigured;
    }

    isSupabaseConfigured(): boolean {
        return this.supabase !== null;
    }

    isReady(): boolean {
        return this.vapidConfigured && this.supabase !== null;
    }

    getPublicKey(): string | null {
        return this.publicKey;
    }

    private isValidEndpoint(endpoint: string): boolean {
        try {
            const parsed = new URL(endpoint);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Salva (o aggiorna) una subscription. L'endpoint è la chiave naturale del dispositivo.
     */
    async saveSubscription(
        payload: PushSubscriptionPayload,
        userAgent?: string | null
    ): Promise<StoredPushSubscription> {
        if (!this.supabase) {
            throw new Error('Database push non configurato (SUPABASE_SERVICE_ROLE_KEY mancante).');
        }
        if (!payload?.endpoint || !this.isValidEndpoint(payload.endpoint)) {
            throw new Error('Endpoint push non valido.');
        }
        if (!payload.keys?.p256dh || !payload.keys?.auth) {
            throw new Error('Chiavi push (p256dh/auth) mancanti.');
        }

        const now = new Date().toISOString();
        const { data, error } = await this.supabase
            .from('push_subscriptions')
            .upsert(
                {
                    endpoint: payload.endpoint,
                    p256dh: payload.keys.p256dh,
                    auth: payload.keys.auth,
                    user_agent: userAgent || null,
                    is_active: true,
                    last_seen_at: now,
                    updated_at: now,
                },
                { onConflict: 'endpoint' }
            )
            .select('*')
            .single();

        if (error) {
            throw new Error(`Salvataggio subscription fallito: ${error.message}`);
        }

        return data as StoredPushSubscription;
    }

    async removeSubscription(endpoint: string): Promise<void> {
        if (!this.supabase) return;
        if (!endpoint) return;

        const { error } = await this.supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        if (error) {
            console.error('[PushService] Errore rimozione subscription:', error.message);
        }
    }

    /**
     * Invia una notifica a una singola subscription.
     * Se il push service risponde 404/410 la subscription viene rimossa dal database.
     */
    async sendToSubscription(
        subscription: StoredPushSubscription,
        payload: PushMessagePayload
    ): Promise<PushSendResult> {
        if (!this.vapidConfigured) {
            return { sent: false, error: 'VAPID non configurato.' };
        }

        const pushSubscription: PushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
            },
        };

        try {
            const result = await webpush.sendNotification(
                pushSubscription,
                JSON.stringify(payload),
                {
                    TTL: 60 * 60 * 24, // 24 ore
                    urgency: 'normal',
                    timeout: 10000,
                }
            );

            return { sent: true, statusCode: result.statusCode };
        } catch (err: any) {
            const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
            const message = err?.body || err?.message || 'Errore sconosciuto durante l\'invio push.';

            // 404/410 (dispositivo revocato) oppure 400/403 con chiave VAPID mismatch (chiavi cambiate nel server):
            // La subscription è irrecuperabile con queste chiavi VAPID e va rimossa.
            const isVapidMismatch =
                (statusCode === 403 && message.includes('VAPID credentials')) ||
                (statusCode === 400 && message.includes('VapidPkHashMismatch'));

            if (statusCode === 404 || statusCode === 410 || isVapidMismatch) {
                await this.removeSubscription(subscription.endpoint);
                console.warn(
                    `[PushService] Subscription obsoleta/invalida (${statusCode}) rimossa dal database:`,
                    message
                );
                return { sent: false, statusCode, error: message, removed: true };
            }

            console.warn(
                `[PushService] Invio push fallito (${statusCode ?? 'no-status'}) per ${subscription.endpoint.slice(0, 60)}...:`,
                message
            );
            return { sent: false, statusCode, error: message };
        }
    }

    /**
     * Invia la notifica a tutti i dispositivi attivi, con concorrenza limitata
     * per non sovraccaricare il runtime serverless.
     */
    async sendToAll(payload: PushMessagePayload): Promise<BroadcastResult> {
        if (!this.supabase || !this.vapidConfigured) {
            return { total: 0, sent: 0, failed: 0, removed: 0 };
        }

        const { data, error } = await this.supabase
            .from('push_subscriptions')
            .select('*')
            .eq('is_active', true);

        if (error) {
            throw new Error(`Lettura subscription fallita: ${error.message}`);
        }

        const subscriptions = (data || []) as StoredPushSubscription[];
        if (subscriptions.length === 0) {
            return { total: 0, sent: 0, failed: 0, removed: 0 };
        }

        const result: BroadcastResult = {
            total: subscriptions.length,
            sent: 0,
            failed: 0,
            removed: 0,
        };

        const concurrency = 20;
        for (let i = 0; i < subscriptions.length; i += concurrency) {
            const batch = subscriptions.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map((sub) => this.sendToSubscription(sub, payload))
            );

            for (const r of batchResults) {
                if (r.sent) result.sent += 1;
                else result.failed += 1;
                if (r.removed) result.removed += 1;
            }
        }

        return result;
    }

    // ---------------------------------------------------------------------
    // Stato persistente (ultimo ID_CLASS notificato)
    // ---------------------------------------------------------------------

    async getState(key: string): Promise<string | null> {
        if (!this.supabase) return null;

        const { data, error } = await this.supabase
            .from('push_state')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (error) {
            console.error(`[PushService] Lettura stato "${key}" fallita:`, error.message);
            return null;
        }

        return data?.value ?? null;
    }

    async setState(key: string, value: string): Promise<void> {
        if (!this.supabase) return;

        const { error } = await this.supabase
            .from('push_state')
            .upsert(
                { key, value, updated_at: new Date().toISOString() },
                { onConflict: 'key' }
            );

        if (error) {
            console.error(`[PushService] Scrittura stato "${key}" fallita:`, error.message);
        }
    }

    /**
     * Aggiorna lo stato solo se il valore atteso è ancora quello salvato.
     * Funge da lock distribuito: in caso di più istanze serverless solo una
     * riesce ad aggiornare e quindi a inviare la notifica.
     */
    async compareAndSetState(key: string, expected: string, next: string): Promise<boolean> {
        if (!this.supabase) return false;

        const { data, error } = await this.supabase
            .from('push_state')
            .update({ value: next, updated_at: new Date().toISOString() })
            .eq('key', key)
            .eq('value', expected)
            .select('key');

        if (error) {
            console.error(`[PushService] Aggiornamento atomico stato "${key}" fallito:`, error.message);
            return false;
        }

        return Array.isArray(data) && data.length > 0;
    }
}

export const pushService = new PushService();

// -------------------------------------------------------------------------
// Trigger automatico: cambio ID_CLASS delle classifiche FITeT
// -------------------------------------------------------------------------

export const RANKING_ID_CLASS_STATE_KEY = 'latest_ranking_id_class';

export interface RankingChangeResult {
    changed: boolean;
    initialized?: boolean;
    idClass: number;
    previousIdClass?: number;
    total?: number;
    sent?: number;
    failed?: number;
    removed?: number;
}

/**
 * Confronta l'ID_CLASS rilevato con quello dell'ultima notifica inviata.
 * - Prima esecuzione: salva il valore corrente senza notificare.
 * - ID_CLASS aumentato: invia la push a tutti i dispositivi e aggiorna lo stato.
 * - ID_CLASS uguale o inferiore: non fa nulla (evita downgrade da fallback).
 */
export async function notifyRankingChangeIfNeeded(idClass: number): Promise<RankingChangeResult> {
    if (!Number.isFinite(idClass) || idClass <= 0) {
        return { changed: false, idClass };
    }

    if (!pushService.isReady()) {
        return { changed: false, idClass };
    }

    const previous = await pushService.getState(RANKING_ID_CLASS_STATE_KEY);

    // Primo avvio: memorizza il baseline senza inviare notifiche.
    if (previous === null) {
        await pushService.setState(RANKING_ID_CLASS_STATE_KEY, String(idClass));
        return { changed: false, initialized: true, idClass };
    }

    const previousIdClass = parseInt(previous, 10);
    if (!Number.isFinite(previousIdClass) || idClass <= previousIdClass) {
        return { changed: false, idClass, previousIdClass };
    }

    // Lock distribuito: solo la prima istanza che arriva qui invia la push.
    const claimed = await pushService.compareAndSetState(
        RANKING_ID_CLASS_STATE_KEY,
        previous,
        String(idClass)
    );

    if (!claimed) {
        return { changed: false, idClass, previousIdClass };
    }

    console.log(
        `[PushService] Nuovo ID_CLASS rilevato: ${previousIdClass} -> ${idClass}. Invio notifiche...`
    );

    const broadcast = await pushService.sendToAll({
        title: 'Nuova classifica FITeT disponibile',
        body: 'È stata pubblicata la classifica aggiornata. Scopri la tua nuova posizione!',
        url: '/?view=classifiche',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `ranking-id-class-${idClass}`,
    });

    console.log(
        `[PushService] Notifiche ranking inviate: ${broadcast.sent}/${broadcast.total} (rimosse: ${broadcast.removed}).`
    );

    return {
        changed: true,
        idClass,
        previousIdClass,
        ...broadcast,
    };
}
