import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/bootstrap-icons-subset.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './index.css';
import './transitions.css';
import { App } from './App';
import { registerServiceWorker } from './services/pushNotifications';
import { initDelegatedClickTracking } from './utils/analyticsTracker';
import {
  consumePendingNotificationNavigation,
  navigateToNotificationUrl,
} from './utils/notificationNavigation';

// Registra il service worker per le Web Push Notifications (PWA).
// È idempotente e non blocca il rendering dell'app.
registerServiceWorker().catch(() => undefined);
initDelegatedClickTracking();

async function bootstrap(): Promise<void> {
  // Su alcune piattaforme (es. PWA iOS) il click sulla notifica apre lo
  // start_url: recuperiamo l'URL reale salvato dal service worker prima di
  // inizializzare lo stato della SPA.
  try {
    const pendingUrl = await consumePendingNotificationNavigation();
    if (pendingUrl) {
      navigateToNotificationUrl(pendingUrl, 'replace');
    }
  } catch {
    // Ignora: l'app deve avviarsi comunque.
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
