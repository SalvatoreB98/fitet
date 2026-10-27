import React, { useEffect, useRef, useState } from 'react';
import './CoffeeNudge.css';

/**
 * Promemoria gentile per sostenere il progetto.
 *
 * Regole scelte per non essere invadenti:
 * - appare solo dopo 5 minuti di navigazione "attiva" (scheda visibile + almeno un'interazione);
 * - una sola volta nella vita del browser: appena mostrato salviamo il flag in localStorage;
 * - non compare mai sopra intro o modali aperte;
 * - si chiude con la X e non torna più.
 *
 * Anteprima: ?paywall=true mostra subito il banner senza toccare localStorage.
 */

const STORAGE_KEY = 'fitet_coffee_nudge_v1';
const MIN_ENGAGED_SECONDS = 2 * 60;
const COFFEE_URL = 'https://buymeacoffee.com/salvatore.butera';

/**
 * URL di test: aggiungendo ?paywall=true (o ?paywall=1) il promemoria
 * compare subito, senza aspettare i 5 minuti e senza salvare nulla in
 * localStorage. Utile solo per verificare l'aspetto del banner.
 */
const isPaywallTestMode = () => {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('paywall');
  return value === 'true' || value === '1';
};

interface CoffeeNudgeProps {
  /** true quando intro o un modale sono aperti: in quel caso il promemoria resta in attesa */
  isSuppressed?: boolean;
}

export const CoffeeNudge: React.FC<CoffeeNudgeProps> = ({ isSuppressed = false }) => {
  const [isTestMode] = useState(isPaywallTestMode);
  const [isVisible, setIsVisible] = useState(isTestMode);
  const [isLeaving, setIsLeaving] = useState(false);

  const engagedSecondsRef = useRef(0);
  const hasInteractedRef = useRef(false);
  const hasBeenShownRef = useRef(false);
  const isSuppressedRef = useRef(isSuppressed);

  isSuppressedRef.current = isSuppressed;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isTestMode) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const markInteraction = () => {
      hasInteractedRef.current = true;
    };

    window.addEventListener('pointerdown', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction);
    window.addEventListener('scroll', markInteraction, { passive: true });

    const intervalId = window.setInterval(() => {
      if (hasBeenShownRef.current) return;
      if (document.visibilityState !== 'visible') return;
      if (!hasInteractedRef.current) return;

      engagedSecondsRef.current += 1;

      if (engagedSecondsRef.current < MIN_ENGAGED_SECONDS) return;
      if (isSuppressedRef.current) return;

      hasBeenShownRef.current = true;
      // Segniamo subito "visto": anche se l'utente lo ignora o ricarica, non lo rivedrà.
      localStorage.setItem(STORAGE_KEY, 'seen');
      setIsVisible(true);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('keydown', markInteraction);
      window.removeEventListener('scroll', markInteraction);
    };
  }, [isTestMode]);

  const dismiss = () => {
    setIsLeaving(true);
    window.setTimeout(() => setIsVisible(false), 180);
  };

  const handleSupportClick = () => {
    if (!isTestMode) {
      localStorage.setItem(STORAGE_KEY, 'clicked');
    }
  };

  if (!isVisible) return null;

  return (
    <aside
      className={`coffee-nudge ${isLeaving ? 'is-leaving' : ''}`}
      aria-label="Sostieni FITeT"
    >
      <button
        type="button"
        className="coffee-nudge-close"
        onClick={dismiss}
        aria-label="Chiudi il promemoria"
      >
        <i className="bi bi-x-lg" aria-hidden="true"></i>
      </button>

      <span className="coffee-nudge-icon" aria-hidden="true">
        <i className="bi bi-cup-hot-fill"></i>
      </span>

      <div className="coffee-nudge-text">
        <strong>FITeT-20 è gratuito e senza pubblicità.</strong>
        <span>Se ti è utile, puoi offrirmi un caffè. Nessun obbligo, davvero.</span>
        <a
          className="coffee-nudge-link"
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleSupportClick}
        >
          Offri un caffè ☕
        </a>
      </div>
    </aside>
  );
};
