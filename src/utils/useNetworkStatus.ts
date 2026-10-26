import { useState, useEffect, useCallback } from 'react';
import { getVenueCacheSummary } from './venueCache';

export interface NetworkStatus {
  isOnline: boolean;
  isWeakConnection: boolean;
  usingCachedData: boolean;
  cachedTime: string | null;
  connectionSpeed?: string; // '4g' | '3g' | '2g' | 'slow-2g'
  cachedItemsCount: number;
  triggerRetry: () => void;
}

// Global state listeners to synchronize across components
let globalIsFallback = false;
let globalCachedTime: string | null = null;
const listeners = new Set<() => void>();

export function notifyVenueFallback(time: string) {
  globalIsFallback = true;
  globalCachedTime = time;
  listeners.forEach((fn) => fn());
}

export function notifyVenueSyncSuccess() {
  globalIsFallback = false;
  listeners.forEach((fn) => fn());
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const [connectionSpeed, setConnectionSpeed] = useState<string | undefined>(() => {
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      return (navigator as any).connection.effectiveType;
    }
    return undefined;
  });

  const [usingCachedData, setUsingCachedData] = useState<boolean>(globalIsFallback);
  const [cachedTime, setCachedTime] = useState<string | null>(globalCachedTime);
  const [cachedItemsCount, setCachedItemsCount] = useState<number>(() => {
    return getVenueCacheSummary().totalItems;
  });

  // Aggiorna conteggio elementi salvati
  const refreshSummary = useCallback(() => {
    setCachedItemsCount(getVenueCacheSummary().totalItems);
  }, []);

  useEffect(() => {
    const handleSyncChange = () => {
      setUsingCachedData(globalIsFallback);
      setCachedTime(globalCachedTime);
      refreshSummary();
    };

    listeners.add(handleSyncChange);
    return () => {
      listeners.delete(handleSyncChange);
    };
  }, [refreshSummary]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Quando torna online, se eravamo in fallback proviamo a resettare
      window.dispatchEvent(new CustomEvent('fitet-connection-restored'));
    };

    const handleOffline = () => {
      setIsOnline(false);
      globalIsFallback = true;
      listeners.forEach((fn) => fn());
    };

    const handleConnectionChange = () => {
      if ((navigator as any).connection) {
        setConnectionSpeed((navigator as any).connection.effectiveType);
      }
    };

    const handleCacheUpdate = () => {
      refreshSummary();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('fitet-venue-cache-updated', handleCacheUpdate);

    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('fitet-venue-cache-updated', handleCacheUpdate);
      if ((navigator as any).connection) {
        (navigator as any).connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [refreshSummary]);

  const isSlowSpeed = connectionSpeed === 'slow-2g' || connectionSpeed === '2g';
  const isWeakConnection = !isOnline || isSlowSpeed || usingCachedData;

  const triggerRetry = useCallback(() => {
    window.dispatchEvent(new CustomEvent('fitet-venue-retry'));
  }, []);

  return {
    isOnline,
    isWeakConnection,
    usingCachedData,
    cachedTime,
    connectionSpeed,
    cachedItemsCount,
    triggerRetry,
  };
}
