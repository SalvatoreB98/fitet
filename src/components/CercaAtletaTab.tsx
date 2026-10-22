import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AthleteSearchResult } from '../types/fitet';
import { searchAtleti } from '../services/api';
import './CercaAtletaTab.css';

interface CercaAtletaTabProps {
  onOpenAtletaModal: (id: string, name: string) => void;
  compactMode?: boolean;
  autoFocus?: boolean;
}

export const CercaAtletaTab: React.FC<CercaAtletaTabProps> = ({
  onOpenAtletaModal,
  compactMode = false,
  autoFocus = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const performSearch = useCallback(async (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const data = await searchAtleti(trimmed);
      setResults(data);
    } catch (err) {
      console.error('Errore durante la ricerca atleti:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (value.trim().length >= 2) {
      setLoading(true);
      debounceTimerRef.current = setTimeout(() => {
        performSearch(value);
      }, 280);
    } else {
      setResults([]);
      setLoading(false);
      setHasSearched(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleChipClick = (suggestion: string) => {
    setQuery(suggestion);
    performSearch(suggestion);
    inputRef.current?.focus();
  };

  const handleImageError = (id: string) => {
    setFailedImgs((prev) => ({ ...prev, [id]: true }));
  };

  const getInitials = (name: string): string => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [autoFocus]);

  return (
    <div className={`cerca-atleta-container ${compactMode ? 'is-compact' : ''}`}>

      <div className="cerca-atleta-header">
        <div className="cerca-atleta-icon-box">
          <i className="bi bi-search"></i>
        </div>
        <h2>Ricerca Atleta FITeT</h2>
        <p>
          Cerca qualsiasi atleta tesserato per cognome e nome per consultare scheda ranking, punti e storico posizioni.
        </p>
      </div>


      {/* Search Input Bar */}
      <div className="cerca-atleta-search-box">
        <div className="cerca-atleta-input-wrapper">
          <i className="bi bi-search cerca-atleta-input-icon"></i>
          <input
            ref={inputRef}
            type="text"
            className="cerca-atleta-input"
            placeholder="Cerca atleta per cognome o nome (es. BUTERA S, ROSSI, BOBOCICA)..."
            value={query}
            onChange={handleInputChange}
            aria-label="Cerca atleta FITeT"
          />
          {loading && (
            <div className="spinner-border spinner-border-sm text-primary cerca-atleta-spinner" role="status">
              <span className="visually-hidden">Ricerca...</span>
            </div>
          )}
          {query && !loading && (
            <button
              type="button"
              className="cerca-atleta-clear-btn"
              onClick={handleClear}
              aria-label="Cancella ricerca"
              title="Cancella"
            >
              <i className="bi bi-x-circle-fill"></i>
            </button>
          )}
        </div>

        {/* Suggestion Chips */}
        {!hasSearched && (
          <div className="cerca-atleta-chips">
            <span className="cerca-atleta-chips-label">Suggerimenti rapidi:</span>
            {['STOYANOV', 'OYEBODE', 'SZOCS', 'PICCOLIN', 'MONFARDINI'].map((chip) => (
              <button
                key={chip}
                type="button"
                className="cerca-atleta-chip"
                onClick={() => handleChipClick(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Header */}
      {hasSearched && (
        <div className="cerca-atleta-results-bar">
          <div>
            Risultati per &quot;<strong>{query}</strong>&quot;
          </div>
          <div>{results.length} atleti trovati</div>
        </div>
      )}

      {/* Results List / Grid */}
      {results.length > 0 && (
        <div className="cerca-atleta-results-grid">
          {results.map((atleta) => {
            const hasImgError = failedImgs[atleta.id];
            const fotoUrl = atleta.fotoUrl || `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`;

            return (
              <div
                key={atleta.id}
                className="cerca-atleta-card"
                onClick={() => onOpenAtletaModal(atleta.id, atleta.value)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenAtletaModal(atleta.id, atleta.value);
                  }
                }}
              >
                {/* Photo / Avatar */}
                <div className="cerca-atleta-avatar">
                  {!hasImgError ? (
                    <img
                      src={fotoUrl}
                      alt={atleta.value}
                      onError={() => handleImageError(atleta.id)}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <span className="cerca-atleta-initials">{getInitials(atleta.value)}</span>
                  )}
                </div>

                {/* Athlete Data */}
                <div className="cerca-atleta-info">
                  <div
                    className="cerca-atleta-name"
                    title={atleta.value}
                    dangerouslySetInnerHTML={{
                      __html: atleta.label ? atleta.label.split('(')[0] : atleta.value,
                    }}
                  />
                  <div className="cerca-atleta-badges">
                    {atleta.dataNascita && (
                      <span className="cerca-atleta-badge">
                        <i className="bi bi-calendar3"></i> {atleta.dataNascita}
                      </span>
                    )}
                    {atleta.tessera && (
                      <span className="cerca-atleta-badge">
                        <i className="bi bi-card-heading"></i> Tessera {atleta.tessera}
                      </span>
                    )}
                    <span className="cerca-atleta-badge">
                      <i className="bi bi-hash"></i> {atleta.id}
                    </span>
                  </div>
                </div>

                {/* Right Arrow Action */}
                <div className="cerca-atleta-action" aria-hidden="true">
                  <i className="bi bi-chevron-right"></i>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty / Not Found State */}
      {hasSearched && !loading && results.length === 0 && (
        <div className="cerca-atleta-empty">
          <i className="bi bi-search"></i>
          <h3>Nessun atleta trovato per &quot;{query}&quot;</h3>
          <p>
            Prova a cercare con solo il cognome (es. &quot;BUTERA&quot; o &quot;ROSSI&quot;) oppure verifica l&apos;ortografia.
          </p>
        </div>
      )}
    </div>
  );
};
