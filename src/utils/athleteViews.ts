const VIEWS_STORAGE_KEY = 'fitet_athlete_views';

// Traccia gli ultimi incrementi registrati in memoria
// per evitare doppi scatti causati da React.StrictMode in dev (doppio mount immediato)
const lastRecordedTimes: Record<string, number> = {};

function getStoredViewsMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredViewsMap(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save athlete views:', e);
  }
}

/**
 * Incrementa e restituisce il conteggio REALE delle visualizzazioni per un atleta.
 * Registra localmente in localStorage e sincronizza con il backend.
 * Include una protezione contro il doppio montaggio di React.StrictMode in sviluppo.
 */
export function recordAndGetAthleteViews(
  athleteKey: string,
  onServerUpdate?: (views: number) => void
): number {
  if (typeof window === 'undefined' || !athleteKey) return 0;
  const cleanKey = athleteKey.toLowerCase().trim();
  const map = getStoredViewsMap();
  const current = map[cleanKey] || 0;

  const now = Date.now();
  const lastTime = lastRecordedTimes[cleanKey] || 0;

  // React 18 in StrictMode esegue ogni useEffect 2 volte a distanza di pochi millisecondi.
  // Se l'atleta è già stato incrementato negli ultimi 2.5 secondi, restituiamo il conteggio senza re-incrementare.
  if (now - lastTime < 2500) {
    return current || 1;
  }
  lastRecordedTimes[cleanKey] = now;

  const next = current + 1;
  map[cleanKey] = next;
  saveStoredViewsMap(map);

  // Sincronizzazione asincrona con il server per conteggio reale condiviso
  fetch(`/api/atleta/${encodeURIComponent(cleanKey)}/view`, { method: 'POST' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && typeof data.views === 'number' && data.views > next) {
        map[cleanKey] = data.views;
        saveStoredViewsMap(map);
        if (onServerUpdate) {
          onServerUpdate(data.views);
        }
      }
    })
    .catch(() => {
      // Offline fallback: mantiene il conteggio reale locale
    });

  return next;
}

/**
 * Legge il conteggio visualizzazioni reale senza incrementare
 */
export function getAthleteViews(athleteKey: string): number {
  if (typeof window === 'undefined' || !athleteKey) return 0;
  const cleanKey = athleteKey.toLowerCase().trim();
  const map = getStoredViewsMap();
  return map[cleanKey] || 0;
}
