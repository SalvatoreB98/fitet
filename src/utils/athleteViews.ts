const VIEWS_STORAGE_KEY = 'fitet_athlete_views';

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
 * Invia la visualizzazione al server e restituisce subito l'ultimo valore noto in cache locale.
 * Quando il server risponde, invoca onServerUpdate con il valore reale aggiornato dal DB.
 */
export function recordAndGetAthleteViews(
  athleteKey: string,
  onServerUpdate?: (views: number) => void
): number {
  if (typeof window === 'undefined' || !athleteKey) return 0;
  const cleanKey = athleteKey.toLowerCase().trim();
  const map = getStoredViewsMap();

  // Ritorna subito il valore già memorizzato (senza forzare +1 a caso)
  const cachedViews = map[cleanKey] || 0;

  // Sincronizzazione con il backend (è Supabase a decidere se incrementare o no)
  fetch(`/api/atleta/${encodeURIComponent(cleanKey)}/view`, { method: 'POST' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      // Accetta qualsiasi numero valido restituito dal server
      const serverViews = Number(data?.views);
      if (!isNaN(serverViews)) {
        const freshMap = getStoredViewsMap();
        freshMap[cleanKey] = serverViews;
        saveStoredViewsMap(freshMap);

        if (onServerUpdate) {
          onServerUpdate(serverViews);
        }
      }
    })
    .catch((err) => {
      console.warn('[Views] Impossibile sincronizzare views con il server:', err);
    });

  return cachedViews;
}

/**
 * Legge il conteggio visualizzazioni memorizzato in locale
 */
export function getAthleteViews(athleteKey: string): number {
  if (typeof window === 'undefined' || !athleteKey) return 0;
  const cleanKey = athleteKey.toLowerCase().trim();
  const map = getStoredViewsMap();
  return map[cleanKey] || 0;
}