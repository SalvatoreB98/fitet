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

export interface PushSubscriptionContext {
    playerId?: string | null;
    playerName?: string | null;
    primaryCamId?: number | null;
    camIds?: number[];
    annoId?: number;
    updatedAt?: string;
}

export const SUBSCRIPTION_CONTEXTS_STATE_KEY = 'push_subscription_contexts';

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

        await this.removeSubscriptionContext(endpoint).catch(() => undefined);
    }

    // ---------------------------------------------------------------------
    // Contesto atleta / campionato associato alle singole subscription
    // ---------------------------------------------------------------------

    async getSubscriptionContexts(): Promise<Record<string, PushSubscriptionContext>> {
        const raw = await this.getState(SUBSCRIPTION_CONTEXTS_STATE_KEY);
        if (!raw) return {};

        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, PushSubscriptionContext>;
            }
        } catch (err) {
            console.warn('[PushService] Formato JSON push_subscription_contexts non valido:', err);
        }

        return {};
    }

    async saveSubscriptionContext(
        endpoint: string,
        context: PushSubscriptionContext
    ): Promise<void> {
        if (!this.supabase || !endpoint) return;

        const cleanCamIds = Array.from(
            new Set(
                [
                    ...(Array.isArray(context.camIds) ? context.camIds : []),
                    ...(typeof context.primaryCamId === 'number' ? [context.primaryCamId] : []),
                ].filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
            )
        );

        const primaryCamId =
            typeof context.primaryCamId === 'number' && context.primaryCamId > 0
                ? context.primaryCamId
                : cleanCamIds[0] ?? null;

        const currentMap = await this.getSubscriptionContexts();
        const existing = currentMap[endpoint] || {};

        const camIdsToSave = Array.isArray(context.camIds)
            ? cleanCamIds
            : cleanCamIds.length > 0
              ? cleanCamIds
              : existing.camIds || [];

        currentMap[endpoint] = {
            playerId:
                context.playerId !== undefined ? context.playerId : existing.playerId ?? null,
            playerName:
                context.playerName !== undefined ? context.playerName : existing.playerName ?? null,
            primaryCamId: primaryCamId ?? existing.primaryCamId ?? null,
            camIds: camIdsToSave,
            annoId: context.annoId ?? existing.annoId ?? 41,
            updatedAt: new Date().toISOString(),
        };

        await this.setState(SUBSCRIPTION_CONTEXTS_STATE_KEY, JSON.stringify(currentMap));
    }

    /**
     * Attiva o disattiva la ricezione delle notifiche per un singolo campionato
     */
    async toggleChampionshipSubscription(
        endpoint: string,
        camId: number,
        enabled: boolean
    ): Promise<{ enabled: boolean; camIds: number[]; primaryCamId: number | null }> {
        if (!this.supabase || !endpoint || !camId) {
            throw new Error('Endpoint e camId validi sono obbligatori.');
        }

        const currentMap = await this.getSubscriptionContexts();
        const existing = currentMap[endpoint] || {
            playerId: null,
            playerName: null,
            primaryCamId: null,
            camIds: [],
            annoId: 41,
            updatedAt: new Date().toISOString(),
        };

        const currentCamIds: number[] = Array.isArray(existing.camIds)
            ? existing.camIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
            : [];

        let newCamIds: number[];
        if (enabled) {
            newCamIds = Array.from(new Set([...currentCamIds, camId]));
        } else {
            newCamIds = currentCamIds.filter((id) => id !== camId);
        }

        let newPrimaryCamId = existing.primaryCamId ?? null;
        if (enabled && (!newPrimaryCamId || newPrimaryCamId <= 0)) {
            newPrimaryCamId = camId;
        } else if (!enabled && newPrimaryCamId === camId) {
            newPrimaryCamId = newCamIds[0] ?? null;
        }

        currentMap[endpoint] = {
            ...existing,
            primaryCamId: newPrimaryCamId,
            camIds: newCamIds,
            updatedAt: new Date().toISOString(),
        };

        await this.setState(SUBSCRIPTION_CONTEXTS_STATE_KEY, JSON.stringify(currentMap));

        return {
            enabled,
            camIds: newCamIds,
            primaryCamId: newPrimaryCamId,
        };
    }

    /**
     * Restituisce i campionati sottoscritti per un singolo endpoint
     */
    async getSubscriptionChampionships(
        endpoint: string
    ): Promise<{ camIds: number[]; primaryCamId: number | null }> {
        if (!this.supabase || !endpoint) return { camIds: [], primaryCamId: null };
        const currentMap = await this.getSubscriptionContexts();
        const existing = currentMap[endpoint];
        if (!existing) return { camIds: [], primaryCamId: null };
        return {
            camIds: Array.isArray(existing.camIds) ? existing.camIds : [],
            primaryCamId: existing.primaryCamId ?? null,
        };
    }

    async removeSubscriptionContext(endpoint: string): Promise<void> {
        if (!this.supabase || !endpoint) return;

        const currentMap = await this.getSubscriptionContexts();
        if (!(endpoint in currentMap)) return;

        delete currentMap[endpoint];
        await this.setState(SUBSCRIPTION_CONTEXTS_STATE_KEY, JSON.stringify(currentMap));
    }

    /**
     * Restituisce l'elenco univoco dei campionati (camId) seguiti dai dispositivi attivi.
     */
    async getSubscribedChampionshipIds(): Promise<number[]> {
        if (!this.supabase) return [];

        const [{ data, error }, contexts] = await Promise.all([
            this.supabase
                .from('push_subscriptions')
                .select('endpoint')
                .eq('is_active', true),
            this.getSubscriptionContexts(),
        ]);

        if (error || !data) return [];

        const activeEndpoints = new Set(data.map((row: { endpoint: string }) => row.endpoint));
        const camIds = new Set<number>();

        for (const [endpoint, ctx] of Object.entries(contexts)) {
            if (!activeEndpoints.has(endpoint) || !ctx) continue;
            if (typeof ctx.primaryCamId === 'number' && ctx.primaryCamId > 0) {
                camIds.add(ctx.primaryCamId);
            }
            if (Array.isArray(ctx.camIds)) {
                for (const id of ctx.camIds) {
                    if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
                        camIds.add(id);
                    }
                }
            }
        }

        return Array.from(camIds);
    }

    /**
     * Invia la notifica a tutti i dispositivi attivi iscritti a uno specifico campionato (camId).
     */
    async sendToChampionshipSubscribers(
        camId: number,
        payload: PushMessagePayload
    ): Promise<BroadcastResult> {
        if (!this.supabase || !this.vapidConfigured) {
            return { total: 0, sent: 0, failed: 0, removed: 0 };
        }

        const [{ data, error }, contexts] = await Promise.all([
            this.supabase
                .from('push_subscriptions')
                .select('*')
                .eq('is_active', true),
            this.getSubscriptionContexts(),
        ]);

        if (error) {
            throw new Error(`Lettura subscription fallita: ${error.message}`);
        }

        const allSubscriptions = (data || []) as StoredPushSubscription[];
        if (allSubscriptions.length === 0) {
            return { total: 0, sent: 0, failed: 0, removed: 0 };
        }

        const matchingSubscriptions = allSubscriptions.filter((sub) => {
            const ctx = contexts[sub.endpoint];
            if (!ctx) return false;
            if (ctx.primaryCamId === camId) return true;
            if (Array.isArray(ctx.camIds) && ctx.camIds.includes(camId)) return true;
            return false;
        });

        if (matchingSubscriptions.length === 0) {
            return { total: 0, sent: 0, failed: 0, removed: 0 };
        }

        const result: BroadcastResult = {
            total: matchingSubscriptions.length,
            sent: 0,
            failed: 0,
            removed: 0,
        };

        const concurrency = 20;
        for (let i = 0; i < matchingSubscriptions.length; i += concurrency) {
            const batch = matchingSubscriptions.slice(i, i + concurrency);
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

            // 404/410: il dispositivo ha revocato il permesso o la subscription è scaduta -> rimuovi dal DB.
            if (statusCode === 404 || statusCode === 410) {
                await this.removeSubscription(subscription.endpoint);
                console.warn(
                    `[PushService] Subscription obsoleta/scaduta (${statusCode}) rimossa dal database:`,
                    message
                );
                return { sent: false, statusCode, error: message, removed: true };
            }

            // 400/403 con VAPID mismatch: NON rimuovere dal DB per evitare che un test locale
            // con chiavi .env diverse cancelli le subscription registrate in produzione (o viceversa).
            const isVapidMismatch =
                (statusCode === 403 && message.includes('VAPID credentials')) ||
                (statusCode === 400 && message.includes('VapidPkHashMismatch'));

            if (isVapidMismatch) {
                console.warn(
                    `[PushService] ⚠️ VAPID key mismatch (${statusCode}): le chiavi VAPID di questo ambiente non coincidono con quelle usate dal browser per creare la subscription.`,
                    message
                );
                return { sent: false, statusCode, error: message, removed: false };
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

    async deleteState(key: string): Promise<void> {
        if (!this.supabase) return;

        const { error } = await this.supabase
            .from('push_state')
            .delete()
            .eq('key', key);

        if (error) {
            console.error(`[PushService] Eliminazione stato "${key}" fallita:`, error.message);
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
