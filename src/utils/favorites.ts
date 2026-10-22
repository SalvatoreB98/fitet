import { useState, useEffect, useCallback } from 'react';

export interface FavoriteAthlete {
  id: string;
  name: string;
  squadra?: string;
  ranking?: number;
  punti?: number;
  categoria?: string;
  tessera?: string;
  dataNascita?: string;
  fotoUrl?: string;
  addedAt: number;
}

const STORAGE_KEY = 'fitet_favorite_athletes';
const EVENT_NAME = 'fitet_favorites_updated';

/**
 * Retrieve all favorite athletes from localStorage
 */
export function getFavoriteAthletes(): FavoriteAthlete[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    console.error('Errore lettura atleti preferiti:', e);
    return [];
  }
}

/**
 * Check if an athlete is currently in favorites
 */
export function isFavoriteAthlete(idOrName: string): boolean {
  if (!idOrName) return false;
  const list = getFavoriteAthletes();
  const needle = idOrName.toLowerCase().trim();
  return list.some(
    (item) =>
      item.id.toLowerCase().trim() === needle ||
      item.name.toLowerCase().trim() === needle
  );
}

/**
 * Add or update an athlete in favorites
 */
export function saveFavoriteAthlete(
  athlete: Omit<FavoriteAthlete, 'addedAt'> & { addedAt?: number }
): FavoriteAthlete[] {
  if (typeof window === 'undefined' || !athlete.id) return [];
  try {
    const list = getFavoriteAthletes();
    const needle = athlete.id.toLowerCase().trim();
    const existingIndex = list.findIndex(
      (item) =>
        item.id.toLowerCase().trim() === needle ||
        item.name.toLowerCase().trim() === athlete.name.toLowerCase().trim()
    );

    const now = athlete.addedAt || Date.now();
    const entry: FavoriteAthlete = {
      ...athlete,
      addedAt: now,
    };

    let updated: FavoriteAthlete[];
    if (existingIndex >= 0) {
      // Merge with existing entry to keep previous details if not provided
      const existing = list[existingIndex];
      updated = [...list];
      updated[existingIndex] = {
        ...existing,
        ...entry,
        // Keep earliest addedAt
        addedAt: existing.addedAt || entry.addedAt,
      };
    } else {
      updated = [entry, ...list];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
    return updated;
  } catch (e) {
    console.error('Errore salvataggio atleta preferito:', e);
    return getFavoriteAthletes();
  }
}

/**
 * Remove an athlete from favorites by ID or Name
 */
export function removeFavoriteAthlete(idOrName: string): FavoriteAthlete[] {
  if (typeof window === 'undefined' || !idOrName) return [];
  try {
    const list = getFavoriteAthletes();
    const needle = idOrName.toLowerCase().trim();
    const filtered = list.filter(
      (item) =>
        item.id.toLowerCase().trim() !== needle &&
        item.name.toLowerCase().trim() !== needle
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: filtered }));
    return filtered;
  } catch (e) {
    console.error('Errore rimozione atleta preferito:', e);
    return getFavoriteAthletes();
  }
}

/**
 * Toggle favorite status. Returns true if added, false if removed.
 */
export function toggleFavoriteAthlete(
  athlete: Omit<FavoriteAthlete, 'addedAt'>
): boolean {
  if (isFavoriteAthlete(athlete.id) || isFavoriteAthlete(athlete.name)) {
    removeFavoriteAthlete(athlete.id || athlete.name);
    return false;
  } else {
    saveFavoriteAthlete(athlete);
    return true;
  }
}

/**
 * Clear all favorite athletes
 */
export function clearAllFavoriteAthletes(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: [] }));
  } catch (e) {
    console.error('Errore eliminazione atleti preferiti:', e);
  }
}

/**
 * React hook to reactively subscribe to favorite athletes across any component
 */
export function useFavoriteAthletes() {
  const [favorites, setFavorites] = useState<FavoriteAthlete[]>(() =>
    getFavoriteAthletes()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setFavorites(getFavoriteAthletes());
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const checkIsFavorite = useCallback(
    (idOrName: string) => {
      if (!idOrName) return false;
      const needle = idOrName.toLowerCase().trim();
      return favorites.some(
        (item) =>
          item.id.toLowerCase().trim() === needle ||
          item.name.toLowerCase().trim() === needle
      );
    },
    [favorites]
  );

  const toggle = useCallback(
    (athlete: Omit<FavoriteAthlete, 'addedAt'>) => {
      return toggleFavoriteAthlete(athlete);
    },
    []
  );

  const remove = useCallback((idOrName: string) => {
    return removeFavoriteAthlete(idOrName);
  }, []);

  return {
    favorites,
    favoritesCount: favorites.length,
    isFavorite: checkIsFavorite,
    toggleFavorite: toggle,
    removeFavorite: remove,
    clearAllFavorites: clearAllFavoriteAthletes,
  };
}
