import type { SocietaInfo } from '../types/fitet';

export const MY_SOCIETY_ID_KEY = 'fitet_my_society_id';
export const MY_SOCIETY_INFO_KEY = 'fitet_my_society_info';
export const MY_SOCIETY_DETECT_FAILED_KEY = 'fitet_my_society_detect_failed';
export const MY_SOCIETY_UPDATED_EVENT = 'fitet_my_society_updated';

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
};

export function getMySocietyId(): string | null {
  return readStorage(MY_SOCIETY_ID_KEY);
}

export function getMySocietyInfo(): SocietaInfo | null {
  const raw = readStorage(MY_SOCIETY_INFO_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.societyId) return null;
    return parsed as SocietaInfo;
  } catch {
    return null;
  }
}

function emitSocietyUpdate(societyId: string | null, info: SocietaInfo | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(MY_SOCIETY_UPDATED_EVENT, {
      detail: { societyId, info },
    })
  );
}

export function setMySociety(societyId: string, info?: SocietaInfo | null): void {
  if (typeof window === 'undefined') return;
  const cleanId = String(societyId || '').trim();
  if (!cleanId) return;

  try {
    localStorage.setItem(MY_SOCIETY_ID_KEY, cleanId);
    if (info) {
      localStorage.setItem(MY_SOCIETY_INFO_KEY, JSON.stringify(info));
    }
    localStorage.removeItem(MY_SOCIETY_DETECT_FAILED_KEY);
  } catch {
    // La società funziona anche senza cache locale.
  }

  emitSocietyUpdate(cleanId, info || getMySocietyInfo());
}

export function clearMySociety(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MY_SOCIETY_ID_KEY);
    localStorage.removeItem(MY_SOCIETY_INFO_KEY);
    localStorage.removeItem(MY_SOCIETY_DETECT_FAILED_KEY);
  } catch {
    // Ignora: lo stato in memoria resta valido.
  }
  emitSocietyUpdate(null, null);
}

export function isSocietyDetectionFailed(atletaId?: string | null): boolean {
  const failed = readStorage(MY_SOCIETY_DETECT_FAILED_KEY);
  if (!failed) return false;
  return !atletaId || failed === atletaId;
}

export function markSocietyDetectionFailed(atletaId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MY_SOCIETY_DETECT_FAILED_KEY, atletaId);
  } catch {
    // Ignora.
  }
}

export function subscribeToMySociety(
  callback: (societyId: string | null, info: SocietaInfo | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { societyId: string | null; info: SocietaInfo | null }
      | undefined;
    callback(detail?.societyId ?? null, detail?.info ?? null);
  };
  window.addEventListener(MY_SOCIETY_UPDATED_EVENT, handler);
  return () => window.removeEventListener(MY_SOCIETY_UPDATED_EVENT, handler);
}
