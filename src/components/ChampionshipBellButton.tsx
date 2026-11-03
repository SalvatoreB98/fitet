import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  isChampionshipPushSubscribed,
  subscribeToSubscribedCams,
  toggleChampionshipPush,
  getPushNotificationStatus,
} from '../services/pushNotifications';
import './ChampionshipBellButton.css';

interface ChampionshipBellButtonProps {
  camId: number | null | undefined;
  championshipName?: string;
  className?: string;
}

interface ToastState {
  type: 'success' | 'info' | 'error';
  title: string;
  message: string;
}

export const ChampionshipBellButton: React.FC<ChampionshipBellButtonProps> = ({
  camId,
  championshipName,
  className = '',
}) => {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    return isChampionshipPushSubscribed(camId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanName = (championshipName || (camId ? `Campionato #${camId}` : 'questo campionato')).trim();

  // Sincronizza lo stato quando camId cambia o quando lo storage locale cambia
  useEffect(() => {
    setIsSubscribed(isChampionshipPushSubscribed(camId));

    const unsubscribe = subscribeToSubscribedCams(() => {
      setIsSubscribed(isChampionshipPushSubscribed(camId));
    });

    return () => unsubscribe();
  }, [camId]);

  // Controlla se la subscription push nel browser è ancora viva
  useEffect(() => {
    let active = true;
    getPushNotificationStatus().then((status) => {
      if (!active) return;
      if (!status.subscribed) {
        setIsSubscribed(false);
      } else {
        setIsSubscribed(isChampionshipPushSubscribed(camId));
      }
    });
    return () => {
      active = false;
    };
  }, [camId]);

  const showToast = (state: ToastState) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(state);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 4200);
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!camId || isLoading) return;

    setIsLoading(true);

    try {
      const res = await toggleChampionshipPush(camId);
      setIsSubscribed(res.enabled);

      if (res.enabled) {
        showToast({
          type: 'success',
          title: 'Notifiche abilitate!',
          message: `Riceverai gli avvisi sui nuovi risultati e variazioni di classifica per ${cleanName}.`,
        });
      } else {
        showToast({
          type: 'info',
          title: 'Notifiche disabilitate',
          message: `Non riceverai più notifiche per ${cleanName}.`,
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Attenzione',
        message: err?.message || 'Impossibile aggiornare le notifiche in questo momento.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!camId) return null;

  const tooltipText = isSubscribed
    ? `Notifiche abilitate per ${cleanName} — Clicca per disabilitarle`
    : `Ricevi notifiche per ${cleanName}`;

  return (
    <>
      <button
        type="button"
        className={`championship-bell-btn ${isSubscribed ? 'is-active' : 'is-inactive'} ${isLoading ? 'is-loading' : ''} ${className}`}
        onClick={handleClick}
        disabled={isLoading}
        title={tooltipText}
        aria-label={tooltipText}
        aria-pressed={isSubscribed}
      >
        <span className="championship-bell-icon-box">
          {isLoading ? (
            <span className="spinner-border spinner-border-sm championship-bell-spinner" role="status" aria-hidden="true" />
          ) : isSubscribed ? (
            <i className="bi bi-bell-fill" aria-hidden="true" />
          ) : (
            <i className="bi bi-bell-slash-fill" aria-hidden="true" />
          )}
        </span>
      </button>

      {/* Snackbar / Toast visualizzato in Portal per sovrapporsi a tutta l'interfaccia */}
      {toast &&
        typeof document !== 'undefined' &&
        createPortal(
          <aside
            className={`championship-snackbar is-${toast.type}`}
            role="status"
            aria-live="polite"
            onClick={() => setToast(null)}
          >
            <div className="championship-snackbar-icon" aria-hidden="true">
              {toast.type === 'success' && <i className="bi bi-bell-fill" />}
              {toast.type === 'info' && <i className="bi bi-bell-slash-fill" />}
              {toast.type === 'error' && <i className="bi bi-exclamation-triangle-fill" />}
            </div>
            <div className="championship-snackbar-body">
              <strong className="championship-snackbar-title">{toast.title}</strong>
              <span className="championship-snackbar-message">{toast.message}</span>
            </div>
            <button
              type="button"
              className="championship-snackbar-close"
              onClick={(e) => {
                e.stopPropagation();
                setToast(null);
              }}
              aria-label="Chiudi avviso"
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </aside>,
          document.body
        )}
    </>
  );
};

