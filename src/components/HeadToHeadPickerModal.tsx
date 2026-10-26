import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AthleteSearchResult } from '../types/fitet';
import { searchAtletiScelta } from '../services/api';
import { getMyPlayerId, getMyPlayerName } from '../utils/myProfile';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { AthleteAvatar } from './AthleteAvatar';
import './HeadToHeadPickerModal.css';

export interface HeadToHeadPlayer {
  id: string;
  name: string;
  dataNascita?: string | null;
}

interface HeadToHeadPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompare: (player1: HeadToHeadPlayer, player2: HeadToHeadPlayer) => void;
}

interface PlayerSlotProps {
  slot: 1 | 2;
  label: string;
  player: HeadToHeadPlayer | null;
  otherPlayer: HeadToHeadPlayer | null;
  selfPlayer: HeadToHeadPlayer | null;
  onSelect: (player: HeadToHeadPlayer | null) => void;
  autoFocus?: boolean;
}

const PlayerSlot: React.FC<PlayerSlotProps> = ({
  slot,
  label,
  player,
  otherPlayer,
  selfPlayer,
  onSelect,
  autoFocus = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const timerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsId = `h2h-picker-results-${slot}`;

  const performSearch = useCallback(
    async (term: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setHasSearched(true);

      try {
        const data = await searchAtletiScelta(term, otherPlayer?.id);
        if (requestId === requestIdRef.current) {
          setResults(data);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [otherPlayer?.id]
  );

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const term = query.trim();
    if (term.length < 2) {
      requestIdRef.current++;
      setResults([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setResults([]);
    setLoading(true);
    setHasSearched(false);

    timerRef.current = window.setTimeout(() => {
      void performSearch(term);
    }, 320);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [query, performSearch]);

  useEffect(() => {
    return () => {
      requestIdRef.current++;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;

    const isTouchOrMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 768;

    if (!isTouchOrMobile) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSelect = (athlete: HeadToHeadPlayer) => {
    onSelect(athlete);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setLoading(false);
  };

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    inputRef.current?.focus();
  };

  const canUseSelf = Boolean(selfPlayer && selfPlayer.id !== otherPlayer?.id);

  if (player) {
    return (
      <div className={`h2h-picker-slot is-selected is-p${slot}`}>
        <div className="h2h-picker-slot-head">
          <span className="h2h-picker-slot-label">
            <span className="h2h-picker-slot-dot" aria-hidden="true"></span>
            {label}
          </span>
          <button
            type="button"
            className="h2h-picker-change"
            onClick={() => onSelect(null)}
            title={`Cambia ${label.toLowerCase()}`}
            aria-label={`Cambia ${label.toLowerCase()}`}
          >
            <i className="bi bi-arrow-repeat" aria-hidden="true"></i>
            <span>Cambia</span>
          </button>
        </div>

        <div className="h2h-picker-selected">
          <AthleteAvatar atletaId={player.id} nome={player.name} size={48} />
          <div className="h2h-picker-selected-copy">
            <span className="h2h-picker-selected-name" title={player.name}>
              {player.name}
            </span>
            <span className="h2h-picker-selected-meta">
              {player.dataNascita ? (
                <>
                  <i className="bi bi-calendar3" aria-hidden="true"></i>
                  {player.dataNascita}
                </>
              ) : (
                <>
                  <i className="bi bi-hash" aria-hidden="true"></i>
                  Tessera {player.id}
                </>
              )}
            </span>
          </div>
          <i className="bi bi-check-circle-fill h2h-picker-selected-check" aria-hidden="true"></i>
        </div>
      </div>
    );
  }

  return (
    <div className={`h2h-picker-slot is-p${slot}`}>
      <div className="h2h-picker-slot-head">
        <span className="h2h-picker-slot-label">
          <span className="h2h-picker-slot-dot" aria-hidden="true"></span>
          {label}
        </span>
      </div>

      <div className="h2h-picker-search">
        <i className="bi bi-search h2h-picker-search-icon" aria-hidden="true"></i>
        <input
          ref={inputRef}
          type="search"
          className="h2h-picker-input"
          placeholder="Cerca per cognome o nome..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={Boolean(query.trim().length >= 2)}
          aria-controls={resultsId}
          aria-autocomplete="list"
          aria-label={`Cerca ${label.toLowerCase()}`}
        />
        {loading ? (
          <span className="h2h-picker-inline-spinner" role="status" aria-label="Ricerca in corso">
            <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
          </span>
        ) : (
          query && (
            <button
              type="button"
              className="h2h-picker-clear"
              onClick={handleClearSearch}
              aria-label="Cancella ricerca"
              title="Cancella ricerca"
            >
              <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
            </button>
          )
        )}
      </div>

      {canUseSelf && selfPlayer && (
        <button
          type="button"
          className="h2h-picker-self"
          onClick={() => handleSelect(selfPlayer)}
          title={`Usa ${selfPlayer.name} come ${label.toLowerCase()}`}
        >
          <span className="h2h-picker-self-icon" aria-hidden="true">
            <i className="bi bi-person-badge"></i>
          </span>
          <span className="h2h-picker-self-copy">
            <span className="h2h-picker-self-eyebrow">Sei tu?</span>
            <span className="h2h-picker-self-name">{selfPlayer.name}</span>
          </span>
          <span className="h2h-picker-self-action">Usa il mio profilo</span>
        </button>
      )}

      {query.trim().length >= 2 && (
        <div className="h2h-picker-results-wrap">
          {loading && results.length === 0 && (
            <div className="h2h-picker-results-state">
              <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
              Ricerca atleti FITeT...
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && (
            <div className="h2h-picker-results-state">
              <i className="bi bi-search" aria-hidden="true"></i>
              Nessun atleta trovato. Prova con cognome e nome.
            </div>
          )}

          {results.length > 0 && (
            <>
              <div
                id={resultsId}
                className="h2h-picker-results"
                role="listbox"
                aria-label={`Risultati ricerca ${label.toLowerCase()}`}
              >
                {results.slice(0, 30).map((athlete) => (
                  <button
                    key={athlete.id}
                    type="button"
                    className="h2h-picker-result"
                    role="option"
                    aria-selected={false}
                    onClick={() =>
                      handleSelect({
                        id: athlete.id,
                        name: athlete.value,
                        dataNascita: athlete.dataNascita,
                      })
                    }
                  >
                    <AthleteAvatar atletaId={athlete.id} nome={athlete.value} size={34} />
                    <span className="h2h-picker-result-copy">
                      <span className="h2h-picker-result-name" title={athlete.value}>
                        {athlete.value}
                      </span>
                      <span className="h2h-picker-result-meta">
                        {athlete.dataNascita && (
                          <span>
                            <i className="bi bi-calendar3" aria-hidden="true"></i>
                            {athlete.dataNascita}
                          </span>
                        )}
                        {athlete.tessera && (
                          <span>
                            <i className="bi bi-card-heading" aria-hidden="true"></i>
                            {athlete.tessera}
                          </span>
                        )}
                        <span>
                          <i className="bi bi-hash" aria-hidden="true"></i>
                          {athlete.id}
                        </span>
                      </span>
                    </span>
                    <i className="bi bi-plus-circle h2h-picker-result-add" aria-hidden="true"></i>
                  </button>
                ))}
              </div>
              {results.length > 30 && (
                <p className="h2h-picker-results-note">
                  Mostrati i primi 30 risultati. Scrivi nome e cognome per raffinare la ricerca.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const HeadToHeadPickerModal: React.FC<HeadToHeadPickerModalProps> = ({
  isOpen,
  onClose,
  onCompare,
}) => {
  useBodyScrollLock(isOpen);

  const [player1, setPlayer1] = useState<HeadToHeadPlayer | null>(null);
  const [player2, setPlayer2] = useState<HeadToHeadPlayer | null>(null);
  const [selfPlayer, setSelfPlayer] = useState<HeadToHeadPlayer | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const id = getMyPlayerId();
    const name = getMyPlayerName();
    setSelfPlayer(id && name ? { id, name } : null);
    setPlayer1(null);
    setPlayer2(null);
    setValidationError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const canCompare = Boolean(player1 && player2 && player1.id !== player2.id);

  const handleSelect = (slot: 1 | 2, athlete: HeadToHeadPlayer | null) => {
    const otherPlayer = slot === 1 ? player2 : player1;

    if (athlete && otherPlayer?.id === athlete.id) {
      setValidationError('Seleziona due atleti diversi per il confronto.');
      return;
    }

    setValidationError(null);
    if (slot === 1) {
      setPlayer1(athlete);
    } else {
      setPlayer2(athlete);
    }
  };

  const handleSwap = () => {
    if (!player1 || !player2) return;
    setPlayer1(player2);
    setPlayer2(player1);
    setValidationError(null);
  };

  const handleCompare = () => {
    if (!player1 || !player2) return;

    if (player1.id === player2.id) {
      setValidationError('Seleziona due atleti diversi per il confronto.');
      return;
    }

    onCompare(player1, player2);
  };

  return createPortal(
    <div
      className="modal-backdrop-simple modal-h2h-backdrop h2h-picker-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="h2h-picker-title"
    >
      <div
        className="modal-card-simple h2h-picker-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header-simple h2h-picker-header">
          <div className="h2h-picker-header-main">
            <div className="modal-header-icon-box is-white" aria-hidden="true">
              <i className="bi bi-arrow-left-right"></i>
            </div>
            <div className="h2h-picker-header-copy">
              <h3 id="h2h-picker-title" className="modal-header-title-serif">
                Testa a Testa
              </h3>
              <div className="modal-header-subtext">
                Scegli due atleti e confronta i loro precedenti FITeT
              </div>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Chiudi finestra (ESC)"
            aria-label="Chiudi finestra"
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        <div className="h2h-picker-body">
          <div className="h2h-picker-intro">
            <div className="h2h-picker-intro-copy">
              <h4 className="h2h-picker-intro-title">Confronta due giocatori</h4>
              <p className="h2h-picker-intro-text">
                Cerca per cognome o nome tra gli atleti tesserati FITeT.
                {selfPlayer && ' Puoi anche usare il tuo profilo con un clic.'}
              </p>
            </div>
          </div>

          <div className="h2h-picker-grid">
            <PlayerSlot
              slot={1}
              label="Giocatore 1"
              player={player1}
              otherPlayer={player2}
              selfPlayer={selfPlayer}
              onSelect={(athlete) => handleSelect(1, athlete)}
              autoFocus
            />

            <div className="h2h-picker-middle" aria-hidden={!player1 || !player2}>
              <span className="h2h-picker-vs">VS</span>
              {player1 && player2 ? (
                <button
                  type="button"
                  className="h2h-picker-swap"
                  onClick={handleSwap}
                  title="Inverti i due giocatori"
                  aria-label="Inverti i due giocatori"
                >
                  <i className="bi bi-arrow-left-right" aria-hidden="true"></i>
                </button>
              ) : (
                <span className="h2h-picker-swap is-static">
                  <i className="bi bi-arrow-left-right" aria-hidden="true"></i>
                </span>
              )}
            </div>

            <PlayerSlot
              slot={2}
              label="Giocatore 2"
              player={player2}
              otherPlayer={player1}
              selfPlayer={selfPlayer}
              onSelect={(athlete) => handleSelect(2, athlete)}
            />
          </div>

          {validationError && (
            <div className="h2h-picker-validation" role="alert">
              <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              {validationError}
            </div>
          )}
        </div>

        <div className="h2h-picker-footer">
          <span className={`h2h-picker-status ${canCompare ? 'is-ready' : ''}`}>
            {canCompare ? (
              <>
                <i className="bi bi-check2-circle" aria-hidden="true"></i>
                Pronto per il confronto
              </>
            ) : (
              <>
                <i className="bi bi-info-circle" aria-hidden="true"></i>
                Seleziona entrambi i giocatori
              </>
            )}
          </span>

          <div className="h2h-picker-footer-actions">
            <button type="button" className="h2h-picker-btn is-secondary" onClick={onClose}>
              Annulla
            </button>
            <button
              type="button"
              className="h2h-picker-btn is-primary"
              onClick={handleCompare}
              disabled={!canCompare}
            >
              <i className="bi bi-arrow-left-right" aria-hidden="true"></i>
              Confronta
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
