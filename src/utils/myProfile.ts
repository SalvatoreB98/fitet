import { DettaglioAtleta } from '../types/fitet';

export const MY_PLAYER_ID_KEY = 'my_player_id';
export const MY_PLAYER_NAME_KEY = 'my_player_name';

const PROFILE_SNAPSHOT_KEY = 'fitet_my_profile_snapshot';
const PROFILE_EVENT_NAME = 'fitet_my_profile_updated';

export interface MyProfileFormMatch {
  esito: 'V' | 'S';
  data: string;
  avversario: string;
  evento?: string;
}

export interface MyProfileSnapshot {
  id: string;
  name: string;
  squadra?: string;
  ranking?: number | null;
  punti?: number | null;
  categoria?: string;
  fotoUrl?: string;
  form?: MyProfileFormMatch[];
  campionatoId?: number | null;
  hasChampionship?: boolean;
  updatedAt: number;
}

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
};

const parseSnapshot = (raw: string | null): MyProfileSnapshot | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    return parsed as MyProfileSnapshot;
  } catch {
    return null;
  }
};

const emitProfileUpdate = (snapshot: MyProfileSnapshot | null) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PROFILE_EVENT_NAME, {
      detail: snapshot,
    })
  );
};

const parseDateValue = (value?: string): number => {
  if (!value) return 0;
  const parts = value.trim().split(/[\/\-\.]/);
  if (parts.length !== 3) return 0;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;

  if (!day || !month || !year) return 0;
  return new Date(year, month - 1, day).getTime();
};

const normalizeCategoria = (categoria?: string): string => {
  if (!categoria) return '';
  const trimmed = categoria.trim();
  const numeric = trimmed.match(/\d+/);
  if (numeric) return `${parseInt(numeric[0], 10)}ª Categoria`;
  return trimmed;
};

export function getMyPlayerId(): string | null {
  return readStorage(MY_PLAYER_ID_KEY);
}

export function getMyPlayerName(): string | null {
  return readStorage(MY_PLAYER_NAME_KEY);
}

export function getMyProfileSnapshot(expectedId?: string | null): MyProfileSnapshot | null {
  const snapshot = parseSnapshot(readStorage(PROFILE_SNAPSHOT_KEY));
  if (!snapshot) return null;
  if (expectedId && snapshot.id !== expectedId) return null;
  if (!expectedId && getMyPlayerId() !== snapshot.id) return null;
  return snapshot;
}

export function saveMyProfileSnapshot(snapshot: MyProfileSnapshot): void {
  if (typeof window === 'undefined' || !snapshot.id) return;

  // Avoid writing stale data after the athlete has been changed or removed.
  if (getMyPlayerId() !== snapshot.id) return;

  try {
    localStorage.setItem(PROFILE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The profile still works without the local cache.
  }
}

export function setMyPlayer(id: string, name?: string): void {
  if (typeof window === 'undefined') return;

  const cleanId = id?.trim();
  if (!cleanId) return;

  const cleanName = name?.trim();
  const existingSnapshot = getMyProfileSnapshot(cleanId);
  const seed: MyProfileSnapshot =
    existingSnapshot && cleanName
      ? { ...existingSnapshot, name: cleanName }
      : existingSnapshot || {
          id: cleanId,
          name: cleanName || `Atleta #${cleanId}`,
          updatedAt: Date.now(),
        };

  try {
    localStorage.setItem(MY_PLAYER_ID_KEY, cleanId);
    if (seed.name) {
      localStorage.setItem(MY_PLAYER_NAME_KEY, seed.name);
    }
    localStorage.setItem(PROFILE_SNAPSHOT_KEY, JSON.stringify(seed));
  } catch {
    // localStorage can be unavailable in private browsing; the in-memory state still updates.
  }

  emitProfileUpdate(seed);
}

export function clearMyPlayer(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(MY_PLAYER_ID_KEY);
    localStorage.removeItem(MY_PLAYER_NAME_KEY);
    localStorage.removeItem(PROFILE_SNAPSHOT_KEY);
  } catch {
    // Ignore storage failures.
  }

  emitProfileUpdate(null);
}

export function buildMyProfileSnapshot(data: DettaglioAtleta): MyProfileSnapshot {
  const storico = data.storicoClassifica || [];
  const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

  let punti = data.anagrafica?.punti;
  if ((punti === undefined || punti === null || punti < 10) && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
    punti = ultimoSnapshot.punti;
  }

  const rankingMatches: MyProfileFormMatch[] = [
    ...(data.partiteRanking?.campionato || []).map((match) => ({
      esito: match.isVittoria ? ('V' as const) : ('S' as const),
      data: match.data,
      avversario: match.avversario,
      evento: match.campionato,
    })),
    ...(data.partiteRanking?.tornei || []).map((match) => ({
      esito: match.isVittoria ? ('V' as const) : ('S' as const),
      data: match.data,
      avversario: match.avversario,
      evento: match.torneo,
    })),
  ]
    .filter((match) => Boolean(match.data))
    .sort((a, b) => parseDateValue(a.data) - parseDateValue(b.data));

  const form = rankingMatches.slice(-5);
  const champId = data.campionatoAttuale?.camId;
  const hasChampionship = typeof champId === 'number' && champId > 0;

  return {
    id: data.id,
    name: data.anagrafica?.nome?.trim() || `Atleta #${data.id}`,
    squadra: data.anagrafica?.societa || data.campionatoAttuale?.squadra || undefined,
    ranking: ultimoSnapshot?.posizione ?? null,
    punti: punti ?? null,
    categoria: normalizeCategoria(data.anagrafica?.categoria || ultimoSnapshot?.categoria),
    fotoUrl:
      data.anagrafica?.fotoUrl ||
      `https://portale.fitet.org/images/atleti/${encodeURIComponent(data.id)}.jpg`,
    form,
    campionatoId: hasChampionship ? champId : null,
    hasChampionship,
    updatedAt: Date.now(),
  };
}

export function subscribeToMyProfile(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (
      !event.key ||
      [MY_PLAYER_ID_KEY, MY_PLAYER_NAME_KEY, PROFILE_SNAPSHOT_KEY].includes(event.key)
    ) {
      callback();
    }
  };

  window.addEventListener(PROFILE_EVENT_NAME, handleUpdate);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(PROFILE_EVENT_NAME, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}
