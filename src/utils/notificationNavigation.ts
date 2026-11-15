/**
 * Deep-link delle notifiche push.
 *
 * Alcune piattaforme (in particolare le PWA iOS) aprono la notifica sullo
 * `start_url` del manifest ignorando l'URL passato a `clients.openWindow()`.
 * Per non perdere la destinazione, il service worker salva l'URL in Cache
 * Storage e la pagina lo consuma appena viene caricata o riportata in primo piano.
 */

export const PENDING_NOTIFICATION_NAV_CACHE = 'fitet-pending-nav-v1';
export const PENDING_NOTIFICATION_NAV_KEY = '/__pending_notification_nav__';
const PENDING_NOTIFICATION_NAV_MAX_AGE_MS = 2 * 60 * 1000;

interface PendingNotificationNavigation {
  url: string;
  timestamp: number;
  data?: unknown;
}

/**
 * Valida un URL di notifica: deve essere same-origin.
 * Restituisce l'URL assoluto oppure null.
 */
export function resolveNotificationUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof window === 'undefined') return null;
  try {
    const target = new URL(rawUrl, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    return target.href;
  } catch {
    return null;
  }
}

/**
 * Applica un URL di notifica alla barra degli indirizzi.
 * Non ricarica la pagina: lo stato della SPA viene aggiornato dal chiamante.
 */
export function navigateToNotificationUrl(
  rawUrl: string | null | undefined,
  mode: 'push' | 'replace' = 'push'
): boolean {
  const target = resolveNotificationUrl(rawUrl);
  if (!target || typeof window === 'undefined') return false;

  if (window.location.href !== target) {
    const state = { ...(window.history.state || {}) };
    if (mode === 'replace') {
      window.history.replaceState(state, '', target);
    } else {
      window.history.pushState(state, '', target);
    }
  }

  return true;
}

/**
 * Legge (e rimuove) l'URL di notifica salvato dal service worker.
 * Restituisce null se non c'è nulla, se è troppo vecchio o se non è valido.
 */
export async function consumePendingNotificationNavigation(): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;

  try {
    const cache = await window.caches.open(PENDING_NOTIFICATION_NAV_CACHE);
    const response = await cache.match(PENDING_NOTIFICATION_NAV_KEY);
    if (!response) return null;

    await cache.delete(PENDING_NOTIFICATION_NAV_KEY);

    let payload: PendingNotificationNavigation | null = null;
    try {
      payload = (await response.json()) as PendingNotificationNavigation;
    } catch {
      payload = null;
    }

    if (!payload || typeof payload.url !== 'string') return null;
    if (
      typeof payload.timestamp === 'number' &&
      Date.now() - payload.timestamp > PENDING_NOTIFICATION_NAV_MAX_AGE_MS
    ) {
      return null;
    }

    return resolveNotificationUrl(payload.url);
  } catch {
    return null;
  }
}

export async function clearPendingNotificationNavigation(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await window.caches.open(PENDING_NOTIFICATION_NAV_CACHE);
    await cache.delete(PENDING_NOTIFICATION_NAV_KEY);
  } catch {
    // Ignora: la cache potrebbe non essere disponibile (es. navigazione privata).
  }
}
