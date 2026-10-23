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

/* ==========================================================================
   Championship Favorites Management
   ========================================================================== */

import { ChampionshipItem } from '../types/fitet';

const CHAMPIONSHIPS_STORAGE_KEY = 'fitet_favorite_championships';
const CHAMPIONSHIPS_META_KEY = 'fitet_favorite_championships_meta';
const CHAMPIONSHIPS_EVENT_NAME = 'fitet_favorite_championships_updated';

export function getFavoriteChampionshipIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHAMPIONSHIPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteChampionshipIds(favs: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAMPIONSHIPS_STORAGE_KEY, JSON.stringify(favs));
    window.dispatchEvent(new CustomEvent(CHAMPIONSHIPS_EVENT_NAME, { detail: favs }));
  } catch (e) {
    console.error('Failed to save championship favorites to localStorage:', e);
  }
}

export function isFavoriteChampionship(id: number): boolean {
  if (!id) return false;
  const list = getFavoriteChampionshipIds();
  return list.includes(id);
}

export function getCachedChampionshipMeta(): Record<number, Partial<ChampionshipItem>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CHAMPIONSHIPS_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function cacheChampionshipMeta(item: Partial<ChampionshipItem> & { id: number }): void {
  if (typeof window === 'undefined' || !item.id) return;
  try {
    const cached = getCachedChampionshipMeta();
    cached[item.id] = { ...cached[item.id], ...item };
    localStorage.setItem(CHAMPIONSHIPS_META_KEY, JSON.stringify(cached));
  } catch (e) {
    console.error('Failed to cache championship metadata:', e);
  }
}

export function toggleFavoriteChampionship(
  id: number,
  meta?: Partial<ChampionshipItem>
): boolean {
  if (!id) return false;
  const current = getFavoriteChampionshipIds();
  const exists = current.includes(id);
  const next = exists ? current.filter((favId) => favId !== id) : [...current, id];
  saveFavoriteChampionshipIds(next);

  if (!exists && meta) {
    cacheChampionshipMeta({ ...meta, id });
  }

  return !exists;
}

export function useFavoriteChampionships() {
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() =>
    getFavoriteChampionshipIds()
  );
  const [cachedMeta, setCachedMeta] = useState<Record<number, Partial<ChampionshipItem>>>(() =>
    getCachedChampionshipMeta()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setFavoriteIds(getFavoriteChampionshipIds());
      setCachedMeta(getCachedChampionshipMeta());
    };

    window.addEventListener(CHAMPIONSHIPS_EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(CHAMPIONSHIPS_EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const checkIsFavorite = useCallback(
    (id: number) => {
      return favoriteIds.includes(id);
    },
    [favoriteIds]
  );

  const toggle = useCallback(
    (id: number, meta?: Partial<ChampionshipItem>) => {
      return toggleFavoriteChampionship(id, meta);
    },
    []
  );

  const remove = useCallback((id: number) => {
    const current = getFavoriteChampionshipIds();
    const next = current.filter((favId) => favId !== id);
    saveFavoriteChampionshipIds(next);
  }, []);

  return {
    favoriteIds,
    favoritesCount: favoriteIds.length,
    cachedMeta,
    isFavorite: checkIsFavorite,
    toggleFavorite: toggle,
    removeFavorite: remove,
  };
}
