/**
 * Web Push Notifications (PWA)
 *
 * Supporta iOS 16.4+ (solo app installata nella schermata Home) e Android/Chrome.
 * Il service worker `public/sw.js` gestisce gli eventi `push` e `notificationclick`.
 */

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface PushNotificationStatus {
  supported: boolean;
  permission: PushPermissionState;
  subscribed: boolean;
  standalone: boolean;
}

const SERVICE_WORKER_URL = '/sw.js';
const PUBLIC_KEY_ENDPOINT = '/api/push/public-key';
const SUBSCRIBE_ENDPOINT = '/api/push/subscribe';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let publicKeyPromise: Promise<string> | null = null;
let cachedPublicKey: string | null = null;

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
      const subscription = await registration?.pushManager.getSubscription();
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
  subscription: PushSubscription
): Promise<BackendSubscriptionResult> {
  const json = subscription.toJSON();

  try {
    const res = await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: json.keys,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Errore server (${res.status}).`,
      };
    }

    return { ok: true, welcomeSent: Boolean(data?.welcomeSent) };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Impossibile contattare il server.',
    };
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
}
