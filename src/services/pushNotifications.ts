/**
 * Web Push Notifications (PWA)
 *
 * Supporta iOS 16.4+ (solo app installata nella schermata Home) e Android/Chrome.
 * Il service worker `public/sw.js` gestisce gli eventi `push` e `notificationclick`.
 */

import {
  getMyPlayerId,
  getMyPlayerName,
  getMyChampionshipId,
  getMyPlayedChampionships,
  PUSH_CONTEXT_CHANGED_EVENT,
} from '../utils/myProfile';

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface PushNotificationStatus {
  supported: boolean;
  permission: PushPermissionState;
  subscribed: boolean;
  standalone: boolean;
}

export interface ClientPushContext {
  playerId: string | null;
  playerName: string | null;
  primaryCamId: number | null;
  camIds: number[];
}

const SERVICE_WORKER_URL = '/sw.js';
const PUBLIC_KEY_ENDPOINT = '/api/push/public-key';
const SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
export const SUBSCRIBED_CAMS_STORAGE_KEY = 'fitet_subscribed_cams';
export const SUBSCRIBED_CAMS_CHANGED_EVENT = 'fitet_subscribed_cams_changed';

export function getSubscribedCams(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SUBSCRIBED_CAMS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      }
    }
  } catch {}

  const myCam = getMyChampionshipId();
  const defaults: number[] = [];
  if (typeof myCam === 'number' && myCam > 0) defaults.push(myCam);
  return defaults;
}

export function saveSubscribedCams(camIds: number[]): void {
  if (typeof window === 'undefined') return;
  const clean = Array.from(new Set(camIds.filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)));
  try {
    localStorage.setItem(SUBSCRIBED_CAMS_STORAGE_KEY, JSON.stringify(clean));
  } catch {}
  window.dispatchEvent(new CustomEvent(SUBSCRIBED_CAMS_CHANGED_EVENT, { detail: clean }));
}

export function isChampionshipPushSubscribed(camId: number | null | undefined): boolean {
  if (!camId || camId <= 0) return false;
  return getSubscribedCams().includes(camId);
}

export function subscribeToSubscribedCams(callback: (cams: number[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<number[]>).detail || getSubscribedCams();
    callback(detail);
  };
  window.addEventListener(SUBSCRIBED_CAMS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(SUBSCRIBED_CAMS_CHANGED_EVENT, handler);
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let publicKeyPromise: Promise<string> | null = null;
let cachedPublicKey: string | null = null;
let syncedSignatureInSession: string | null = null;
let contextListenerAttached = false;
let contextSyncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Raccoglie dal profilo e dalle impostazioni locali l'atleta e i campionati
 * associati al dispositivo, così che il server possa inviare notifiche mirate
 * quando ci sono nuovi match o aggiornamenti di classifica in quel campionato.
 */
export function getClientPushContext(): ClientPushContext {
  if (typeof window === 'undefined') {
    return { playerId: null, playerName: null, primaryCamId: null, camIds: [] };
  }

  const playerId = getMyPlayerId();
  const playerName = getMyPlayerName();
  const myCamId = getMyChampionshipId();
  const playedCamps = getMyPlayedChampionships();

  const camSet = new Set<number>();
  if (typeof myCamId === 'number' && myCamId > 0) {
    camSet.add(myCamId);
  }
  for (const c of playedCamps) {
    if (typeof c?.camId === 'number' && c.camId > 0) {
      camSet.add(c.camId);
    }
  }
  const explicitCams = getSubscribedCams();
  for (const id of explicitCams) {
    camSet.add(id);
  }

  // Fallback sul campionato selezionato se l'atleta non ha ancora un campionato associato
  if (camSet.size === 0) {
    try {
      const savedCam = localStorage.getItem('fitet_selected_cam');
      if (savedCam && /^\d+$/.test(savedCam)) {
        const parsed = parseInt(savedCam, 10);
        if (parsed > 0) camSet.add(parsed);
      }
    } catch {}
  }

  const camIds = Array.from(camSet);
  const primaryCamId =
    typeof myCamId === 'number' && myCamId > 0
      ? myCamId
      : camIds.length > 0
        ? camIds[0]
        : null;

  return {
    playerId,
    playerName,
    primaryCamId,
    camIds,
  };
}

function buildSyncSignature(endpoint: string, ctx: ClientPushContext): string {
  return `${endpoint}|${ctx.playerId || ''}|${ctx.primaryCamId || ''}|${ctx.camIds.join(',')}`;
}

/**
 * Rileva se l'app è aperta come PWA installata.
 * Su iOS Safari `navigator.standalone` è true quando si apre dalla Home.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return displayModeStandalone || navigatorWithStandalone.standalone === true;
}

/**
 * Rileva se il dispositivo è iOS/iPadOS.
 * Su iPadOS 13+ il user agent può essere "MacIntel": in quel caso
 * `maxTouchPoints > 1` identifica un iPad.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const platform = (navigator as Navigator & { platform?: string }).platform || '';
  const isIPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/i.test(ua) || isIPadOS;
}

/**
 * Rileva se il dispositivo è Android.
 */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Rileva se si tratta di un browser desktop (Windows, macOS, Linux).
 */
export function isDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !isAndroid() && !isIOS();
}

/**
 * Safari desktop supporta Web Push solo per le web app aggiunte al Dock,
 * non per le normali schede del browser.
 */
function isSafariDesktop(): boolean {
  if (!isDesktop()) return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS/i.test(ua);
}

/**
 * Indica se le notifiche push possono essere attivate anche senza installare
 * la PWA. Su Android e sui browser desktop (Chrome, Edge, Firefox) Web Push
 * funziona anche nelle schede normali; su iOS e su Safari desktop serve
 * l'app installata.
 */
export function canEnablePushInBrowser(): boolean {
  return isAndroid() || (isDesktop() && !isSafariDesktop());
}

/**
 * Verifica il supporto alle Web Push nel browser corrente.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Registra il service worker. È idempotente: più chiamate condividono la stessa Promise.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  if (!contextListenerAttached) {
    contextListenerAttached = true;
    window.addEventListener(PUSH_CONTEXT_CHANGED_EVENT, () => {
      if (contextSyncTimer) clearTimeout(contextSyncTimer);
      contextSyncTimer = setTimeout(() => {
        syncPushSubscriptionContext().catch(() => undefined);
      }, 250);
    });
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        // Forza il controllo di aggiornamenti del service worker.
        registration.update().catch(() => undefined);
        return registration;
      })
      .catch((err) => {
        console.warn('[Push] Registrazione service worker fallita:', err);
        registrationPromise = null;
        return null;
      });
  }

  return registrationPromise;
}

/**
 * Restituisce una registrazione attiva del service worker.
 */
async function getActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await registerServiceWorker();
  if (!registration) return null;

  try {
    // `ready` risolve quando esiste un service worker attivo per la pagina.
    return await navigator.serviceWorker.ready;
  } catch {
    return registration;
  }
}

/**
 * Recupera (e mette in cache) la chiave pubblica VAPID dal backend.
 */
export async function getVapidPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;

  if (!publicKeyPromise) {
    publicKeyPromise = fetch(PUBLIC_KEY_ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.publicKey) {
          throw new Error(
            data?.error || 'Chiave pubblica VAPID non disponibile sul server.'
          );
        }
        cachedPublicKey = String(data.publicKey);
        return cachedPublicKey;
      })
      .catch((err) => {
        publicKeyPromise = null;
        throw err;
      });
  }

  return publicKeyPromise;
}

/**
 * Precarica service worker e chiave VAPID (utile al mount della Home).
 * Non richiede permessi e non mostra nulla all'utente.
 */
export async function preparePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  await Promise.allSettled([registerServiceWorker(), getVapidPublicKey()]);
}

/**
 * Stato corrente delle notifiche per il dispositivo.
 * Se il permesso è già concesso e c'è una subscription locale, verifica che la chiave VAPID
 * coincida con quella attuale del server e sincronizza silenziosamente la subscription su Supabase.
 */
export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  const supported = isPushSupported();
  const standalone = isStandaloneMode();

  if (!supported) {
    return { supported: false, permission: 'unsupported', subscribed: false, standalone };
  }

  const permission = Notification.permission;
  let subscribed = false;

  if (permission === 'granted') {
    try {
      const registration = await getActiveRegistration();
      let subscription = await registration?.pushManager.getSubscription();

      if (registration && subscription) {
        try {
          const publicKey = await getVapidPublicKey();
          const targetKeyBytes = urlBase64ToUint8Array(publicKey);
          const currentAppServerKey = subscription.options?.applicationServerKey;
          let keyMatches = false;

          if (currentAppServerKey) {
            const currentBytes = new Uint8Array(currentAppServerKey);
            keyMatches =
              currentBytes.length === targetKeyBytes.length &&
              currentBytes.every((val, i) => val === targetKeyBytes[i]);
          }

          if (!keyMatches) {
            console.warn('[Push] Chiave VAPID cambiata rispetto alla subscription locale: rinnovo automatico...');
            await subscription.unsubscribe().catch(() => undefined);
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: targetKeyBytes,
            });
            syncedSignatureInSession = null;
          }

          if (subscription) {
            const currentContext = getClientPushContext();
            const expectedSig = buildSyncSignature(subscription.endpoint, currentContext);
            if (syncedSignatureInSession !== expectedSig) {
              const syncRes = await sendSubscriptionToBackend(subscription, true);
              if (syncRes.ok) {
                syncedSignatureInSession = expectedSig;
              }
            }
          }
        } catch (syncErr) {
          console.warn('[Push] Verifica/sync silenzioso subscription non riuscito:', syncErr);
        }
      }

      subscribed = Boolean(subscription);
    } catch (err) {
      console.warn('[Push] Lettura subscription fallita:', err);
    }
  }

  return { supported, permission, subscribed, standalone };
}

/**
 * Converte la chiave VAPID da base64url a Uint8Array (formato richiesto da applicationServerKey).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

interface BackendSubscriptionResult {
  ok: boolean;
  welcomeSent?: boolean;
  error?: string;
}

async function sendSubscriptionToBackend(
  subscription: PushSubscription,
  silent = false
): Promise<BackendSubscriptionResult> {
  const json = subscription.toJSON();
  const context = getClientPushContext();

  try {
    const res = await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: json.keys,
        silent,
        context,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Errore server (${res.status}).`,
      };
    }

    syncedSignatureInSession = buildSyncSignature(subscription.endpoint, context);
    return { ok: true, welcomeSent: Boolean(data?.welcomeSent) };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Impossibile contattare il server.',
    };
  }
}

/**
 * Sincronizza silenziosamente con il backend l'atleta e il campionato
 * associati alla subscription push attiva (se presente).
 */
export async function syncPushSubscriptionContext(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const registration = await getActiveRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    const currentContext = getClientPushContext();
    const expectedSig = buildSyncSignature(subscription.endpoint, currentContext);
    if (syncedSignatureInSession === expectedSig) {
      return true;
    }

    const res = await sendSubscriptionToBackend(subscription, true);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Attiva le notifiche push.
 * Deve essere chiamata direttamente da un gesto dell'utente (tap/click).
 */
export async function subscribeToPush(): Promise<{
  subscription: PushSubscription;
  welcomeSent: boolean;
}> {
  if (!isPushSupported()) {
    throw new Error('Questo dispositivo o browser non supporta le notifiche push.');
  }

  // Su iOS le push funzionano solo dalla PWA installata nella Home.
  // Su Android invece il browser supporta Web Push anche nelle schede normali.
  if (!isStandaloneMode() && !canEnablePushInBrowser()) {
    throw new Error(
      'Per attivare le notifiche aggiungi prima l\'app alla schermata Home.'
    );
  }

  // Richiedi il permesso subito, dentro il gesto utente (fondamentale su iOS).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Permesso notifiche negato. Abilitalo dalle impostazioni del dispositivo.'
        : 'Permesso notifiche non concesso.'
    );
  }

  const registration = await getActiveRegistration();
  if (!registration) {
    throw new Error('Service worker non disponibile. Ricarica la pagina e riprova.');
  }

  const publicKey = await getVapidPublicKey();
  const targetKeyBytes = urlBase64ToUint8Array(publicKey);

  let subscription = await registration.pushManager.getSubscription();

  // Se esiste già una subscription nel browser, verifichiamo che utilizzi la stessa chiave VAPID attuale.
  // Se la chiave del server è cambiata rispetto a prima, la annulliamo per rigenerarne una nuova.
  if (subscription) {
    let keyMatches = false;
    try {
      const currentAppServerKey = subscription.options?.applicationServerKey;
      if (currentAppServerKey) {
        const currentBytes = new Uint8Array(currentAppServerKey);
        keyMatches =
          currentBytes.length === targetKeyBytes.length &&
          currentBytes.every((val, i) => val === targetKeyBytes[i]);
      }
    } catch {
      keyMatches = false;
    }

    if (!keyMatches) {
      console.warn('[Push] La chiave VAPID del server è cambiata rispetto alla subscription locale. Rinnovo...');
      await subscription.unsubscribe().catch(() => undefined);
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: targetKeyBytes,
    });
  }

  const backendResult = await sendSubscriptionToBackend(subscription);

  if (!backendResult.ok) {
    // Se la subscription non è valida o il server la rifiuta,
    // annulliamola localmente in modo da non riprovare con una subscription non valida.
    await subscription.unsubscribe().catch(() => undefined);
    throw new Error(
      backendResult.error || 'Salvataggio della subscription non riuscito.'
    );
  }

  return {
    subscription,
    welcomeSent: Boolean(backendResult.welcomeSent),
  };
}

/**
 * Disattiva le notifiche push: rimuove la subscription dal backend e dal dispositivo.
 */
export async function unsubscribeFromPush(): Promise<void> {
  const registration = await getActiveRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return;

  try {
    await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch (err) {
    console.warn('[Push] Rimozione subscription dal backend fallita:', err);
  }

  await subscription.unsubscribe().catch((err) => {
    console.warn('[Push] unsubscribe locale fallito:', err);
  });
  syncedSignatureInSession = null;
}


/**
 * Attiva o disattiva le notifiche push per un singolo campionato.
 * Se il dispositivo non è ancora iscritto alle push, richiede il permesso al browser.
 */
export async function toggleChampionshipPush(
  camId: number,
  targetEnabled?: boolean
): Promise<{ enabled: boolean; welcomeSent?: boolean }> {
  if (!camId || camId <= 0) {
    throw new Error('ID Campionato non valido.');
  }

  const status = await getPushNotificationStatus();
  if (!status.supported) {
    throw new Error('Questo dispositivo o browser non supporta le notifiche push.');
  }
  if (status.permission === 'denied') {
    throw new Error('Permesso notifiche bloccato nel browser. Abilitalo dalle impostazioni del dispositivo.');
  }

  // Su iOS le push richiedono la PWA installata
  if (!isStandaloneMode() && !canEnablePushInBrowser()) {
    throw new Error("Per abilitare le notifiche su iPhone/iPad aggiungi l'app alla schermata Home.");
  }

  const currentlySubscribed = isChampionshipPushSubscribed(camId);
  const nextEnabled = targetEnabled !== undefined ? targetEnabled : !currentlySubscribed;

  // Se l'utente non ha ancora una subscription attiva, chiediamo il permesso e registriamo
  if (!status.subscribed) {
    const currentList = getSubscribedCams();
    const updated = Array.from(new Set([...currentList, camId]));
    saveSubscribedCams(updated);

    const subResult = await subscribeToPush();
    return { enabled: true, welcomeSent: subResult.welcomeSent };
  }

  // Se l'utente è già sottoscritto alle push, aggiorniamo il backend con l'endpoint
  const reg = await getActiveRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) {
    const currentList = getSubscribedCams();
    if (nextEnabled) {
      saveSubscribedCams(Array.from(new Set([...currentList, camId])));
    }
    const subResult = await subscribeToPush();
    return { enabled: true, welcomeSent: subResult.welcomeSent };
  }

  const res = await fetch('/api/push/championship-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      camId,
      enabled: nextEnabled,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Errore server (${res.status}) durante l'aggiornamento.`);
  }

  const currentList = getSubscribedCams();
  let updatedList: number[];
  if (nextEnabled) {
    updatedList = Array.from(new Set([...currentList, camId]));
  } else {
    updatedList = currentList.filter((id) => id !== camId);
  }
  saveSubscribedCams(updatedList);

  return { enabled: nextEnabled, welcomeSent: false };
}