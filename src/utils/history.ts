import { useState, useEffect, useCallback } from 'react';

export interface RecentAthlete {
  id: string;
  name: string;
  squadra?: string;
  ranking?: number;
  punti?: number;
  categoria?: string;
  timestamp: number;
}

export interface RecentChampionship {
  id: number;
  nome: string;
  regione: string;
  categoria?: string;
  anno?: number;
  timestamp: number;
}

const RECENT_ATHLETES_KEY = 'fitet_recent_athletes';
const RECENT_CHAMPIONSHIPS_KEY = 'fitet_recent_championships';
const MAX_RECENT_ITEMS = 12;

export function getRecentAthletes(): RecentAthlete[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ATHLETES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentAthlete(athlete: {
  id: string;
  name: string;
  squadra?: string;
  ranking?: number;
  punti?: number;
  categoria?: string;
}): void {
  if (typeof window === 'undefined' || !athlete.id) return;
  try {
    const current = getRecentAthletes();
    const existing = current.find((a) => a.id === athlete.id);
    const filtered = current.filter((a) => a.id !== athlete.id);
    const updated: RecentAthlete[] = [
      {
        id: athlete.id,
        name: athlete.name,
        squadra: athlete.squadra ?? existing?.squadra,
        ranking: athlete.ranking ?? existing?.ranking,
        punti: athlete.punti ?? existing?.punti,
        categoria: athlete.categoria ?? existing?.categoria,
        timestamp: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_ATHLETES_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch (e) {
    console.warn('Could not save recent athlete:', e);
  }
}

export function removeRecentAthlete(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getRecentAthletes();
    const updated = current.filter((a) => a.id !== id);
    localStorage.setItem(RECENT_ATHLETES_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch {}
}

export function clearRecentAthletes(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_ATHLETES_KEY);
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch {}
}

export function getRecentChampionships(): RecentChampionship[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_CHAMPIONSHIPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentChampionship(championship: {
  id: number;
  nome: string;
  regione: string;
  categoria?: string;
  anno?: number;
}): void {
  if (typeof window === 'undefined' || !championship.id) return;
  try {
    const current = getRecentChampionships();
    const filtered = current.filter((c) => c.id !== championship.id);
    const updated: RecentChampionship[] = [
      {
        id: championship.id,
        nome: championship.nome,
        regione: championship.regione,
        categoria: championship.categoria,
        anno: championship.anno || 41,
        timestamp: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_CHAMPIONSHIPS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch (e) {
    console.warn('Could not save recent championship:', e);
  }
}

export function removeRecentChampionship(id: number): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getRecentChampionships();
    const updated = current.filter((c) => c.id !== id);
    localStorage.setItem(RECENT_CHAMPIONSHIPS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch {}
}

export function clearRecentChampionships(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_CHAMPIONSHIPS_KEY);
    window.dispatchEvent(new CustomEvent('fitet_history_updated'));
  } catch {}
}

export function useRecentHistory() {
  const [recentAthletes, setRecentAthletes] = useState<RecentAthlete[]>(() => getRecentAthletes());
  const [recentChampionships, setRecentChampionships] = useState<RecentChampionship[]>(() =>
    getRecentChampionships()
  );

  const refresh = useCallback(() => {
    setRecentAthletes(getRecentAthletes());
    setRecentChampionships(getRecentChampionships());
  }, []);

  useEffect(() => {
    const handleUpdate = () => refresh();
    window.addEventListener('fitet_history_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('fitet_history_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [refresh]);

  return {
    recentAthletes,
    recentChampionships,
    clearAthletes: clearRecentAthletes,
    clearChampionships: clearRecentChampionships,
    removeAthlete: removeRecentAthlete,
    removeChampionship: removeRecentChampionship,
  };
}
