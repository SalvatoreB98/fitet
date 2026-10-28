/* eslint-env serviceworker */
/* global self, clients */

const DEFAULT_ICON = '/icon.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Handler `fetch` minimo: Chrome/Edge lo richiedono per considerare la PWA
 * installabile. Non chiamiamo `respondWith`, quindi le richieste proseguono
 * normalmente sulla rete senza cache aggiuntiva.
 */
self.addEventListener('fetch', () => {
  // Passthrough: nessuna intercettazione.
});

/**
 * Payload atteso dal backend:
 * {
 *   title: string,
 *   body: string,
 *   url?: string,
 *   icon?: string,
 *   badge?: string,
 *   image?: string,
 *   tag?: string,
 *   renotify?: boolean,
 *   vibrate?: number[],
 *   data?: object
 * }
 */
self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Portale Risultati FITeT';
  const url = payload.url || '/';

  const options = {
    body: payload.body || payload.message || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_ICON,
    data: Object.assign({}, payload.data || {}, { url }),
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [120, 60, 120],
  };

  if (payload.image) options.image = payload.image;
  if (Array.isArray(payload.actions)) options.actions = payload.actions;
  if (payload.requireInteraction) options.requireInteraction = true;

  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = Boolean(payload.renotify);
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Al click sulla notifica:
 * - chiude la notifica;
 * - se esiste già una finestra dell'app la porta in primo piano;
 * - altrimenti ne apre una nuova sull'URL indicato nel payload.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  let absoluteUrl;
  try {
    absoluteUrl = new URL(targetUrl, self.location.origin).href;
  } catch (err) {
    absoluteUrl = self.location.origin + '/';
  }

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // 1. Finestra già aperta esattamente sull'URL richiesto.
      for (const client of windowClients) {
        if (client.url === absoluteUrl && 'focus' in client) {
          return client.focus();
        }
      }

      // 2. Qualsiasi finestra della stessa origine: naviga e porta in primo piano.
      for (const client of windowClients) {
        try {
          const sameOrigin = new URL(client.url).origin === self.location.origin;
          if (sameOrigin && 'navigate' in client) {
            await client.navigate(absoluteUrl);
            return 'focus' in client ? client.focus() : undefined;
          }
        } catch (err) {
          // Ignora client non navigabili.
        }
      }

      // 3. Nessuna finestra aperta: aprine una nuova.
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }

      return undefined;
    })()
  );
});

/**
 * Se il push service invalida la subscription, prova a registrarla di nuovo
 * e a sincronizzarla con il backend.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch('/api/push/public-key', { cache: 'no-store' });
        if (!response.ok) return;

        const data = await response.json();
        if (!data || !data.publicKey) return;

        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
        const subscription =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          }));

        const json = subscription.toJSON();

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime,
            keys: json.keys,
          }),
        });
      } catch (err) {
        console.warn('[SW] pushsubscriptionchange fallito:', err);
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = self.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
