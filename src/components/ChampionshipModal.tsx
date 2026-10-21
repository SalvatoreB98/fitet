import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChampionshipItem } from '../types/fitet';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { detectUserRegion, getCachedUserRegion } from '../utils/geolocation';
import { searchCampionati } from '../utils/searchCampionati';

interface ChampionshipModalProps {
  isOpen: boolean;
  currentCamId: number;
  campionati: ChampionshipItem[];
  isLoadingCampionati?: boolean;
  onClose: () => void;
  onSelectChampionship: (camId: number, annoId?: number, formulaId?: number) => void;
}

export const ChampionshipModal: React.FC<ChampionshipModalProps> = ({
  isOpen,
  currentCamId,
  campionati,
  isLoadingCampionati = false,
  onClose,
  onSelectChampionship,
}) => {
  useBodyScrollLock(isOpen);

  const [searchQuery, setSearchQuery] = useState('');
  const [userRegion, setUserRegion] = useState<string>(getCachedUserRegion);
  const [selectedRegion, setSelectedRegion] = useState<string>(() => {
    return getCachedUserRegion() || 'Tutti';
  });
  const [hasGeoLocation, setHasGeoLocation] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('fitet_detected_region');
    }
    return false;
  });
  const [customCamInput, setCustomCamInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Detect user region via geolocation
  useEffect(() => {
    let isCancelled = false;
    detectUserRegion().then((detected) => {
      if (!isCancelled && detected) {
        setUserRegion((prevUserRegion) => {
          setSelectedRegion((prevSelected) => {
            // Keep selectedRegion in sync if user hasn't chosen another specific region
            if (prevSelected === prevUserRegion || prevSelected === 'Tutti' || !prevSelected) {
              return detected;
            }
            return prevSelected;
          });
          return detected;
        });
        setHasGeoLocation(true);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  // Unique list of regions from the catalog
  const regionsList = useMemo(() => {
    const set = new Set<string>();
    campionati.forEach((c) => {
      if (c.regione) set.add(c.regione);
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
    if (userRegion) {
      return ['Tutti', userRegion, 'Nazionale', ...list.filter((r) => r !== userRegion && r !== 'Nazionale')];
    }
    return ['Tutti', 'Nazionale', ...list.filter((r) => r !== 'Nazionale')];
  }, [campionati, userRegion]);

  // Filtered championships using tokenized search & normalization
  const filteredCampionati = useMemo(() => {
    const q = searchQuery.trim();

    if (q) {
      return searchCampionati(campionati, q);
    }

    if (selectedRegion === 'Tutti') {
      return campionati;
    }

    return campionati.filter((c) => c.regione.toLowerCase() === selectedRegion.toLowerCase());
  }, [campionati, selectedRegion, searchQuery]);

  // Quick stats
  const countUserRegion = useMemo(
    () => campionati.filter((c) => c.regione === userRegion).length,
    [campionati, userRegion]
  );
  const countNazionale = useMemo(() => campionati.filter((c) => c.regione === 'Nazionale').length, [campionati]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const trimmed = customCamInput.trim();
    if (!trimmed) return;

    // Check if user pasted a FITeT URL
    let camId: number | null = null;
    const urlMatch = trimmed.match(/CAM=(\d+)/i);
    if (urlMatch) {
      camId = parseInt(urlMatch[1], 10);
    } else if (/^\d+$/.test(trimmed)) {
      camId = parseInt(trimmed, 10);
    }

    if (!camId || isNaN(camId)) {
      setCustomError('Inserisci un codice numerico valido o un URL FITeT contenente CAM=...');
      return;
    }

    onSelectChampionship(camId);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="championship-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="championship-modal-title"
    >
      <div className="championship-modal-dialog">
        {/* Modal Header */}
        <div className="championship-modal-header">
          <div className="header-icon-box">
            <i className="bi bi-trophy-fill"></i>
          </div>
          <div className="header-titles">
            <h2 id="championship-modal-title">Seleziona Campionato</h2>
            <p>
              {campionati.length > 0
                ? `${campionati.length} campionati disponibili (Nazionali e tutte le Regioni)`
                : 'Connessione al catalogo campionati FITeT...'}
            </p>
          </div>
          <button
            type="button"
            className="championship-modal-close"
            onClick={onClose}
            aria-label="Chiudi finestra"
            title="Chiudi finestra (ESC)"
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div className="championship-search-section">
          <div className="search-input-wrapper">
            <i className="bi bi-search search-icon"></i>
            <input
              type="text"
              className="championship-search-input"
              placeholder="Cerca per girone, serie o regione (es. D1, C2, Serie A, Girone A)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Cancella ricerca"
              >
                <i className="bi bi-x-circle-fill"></i>
              </button>
            )}
          </div>
        </div>

        {/* Region Filter Tabs */}
        <div className="championship-regions-bar">
          {userRegion && (
            <button
              type="button"
              className={`region-pill ${selectedRegion === userRegion && !searchQuery ? 'active' : ''}`}
              onClick={() => {
                setSelectedRegion(userRegion);
                setSearchQuery('');
              }}
              title={hasGeoLocation ? `Regione rilevata dalla posizione: ${userRegion}` : `Regione: ${userRegion}`}
            >
              <span className="pill-star">{hasGeoLocation ? '📍' : '⭐'}</span> {userRegion}
              {countUserRegion > 0 && <span className="pill-badge">{countUserRegion}</span>}
            </button>
          )}

          <button
            type="button"
            className={`region-pill ${selectedRegion === 'Nazionale' && !searchQuery ? 'active' : ''}`}
            onClick={() => {
              setSelectedRegion('Nazionale');
              setSearchQuery('');
            }}
          >
            <span className="pill-flag">🇮🇹</span> Nazionali
            {countNazionale > 0 && <span className="pill-badge">{countNazionale}</span>}
          </button>

          <button
            type="button"
            className={`region-pill ${selectedRegion === 'Tutti' && !searchQuery ? 'active' : ''}`}
            onClick={() => {
              setSelectedRegion('Tutti');
              setSearchQuery('');
            }}
          >
            Tutti ({campionati.length})
          </button>

          {/* Other Regions Dropdown */}
          <div className="region-select-wrapper">
            <select
              className="region-select-dropdown"
              value={[userRegion, 'Nazionale', 'Tutti'].filter(Boolean).includes(selectedRegion) ? '' : selectedRegion}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedRegion(e.target.value);
                  setSearchQuery('');
                }
              }}
              aria-label="Altre regioni"
            >
              <option value="" disabled>
                Altre regioni...
              </option>
              {regionsList
                .filter((r) => (userRegion ? r !== userRegion : true) && r !== 'Nazionale' && r !== 'Tutti')
                .map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Championships List */}
        <div className="championship-list-container">
          {isLoadingCampionati && campionati.length === 0 ? (
            <div className="championship-loading-state">
              <div className="spinner-border text-primary mb-2" role="status" style={{ width: '2rem', height: '2rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <p>Caricamento campionati FITeT in corso...</p>
            </div>
          ) : filteredCampionati.length === 0 ? (
            <div className="championship-empty-state">
              <i className="bi bi-search mb-2" style={{ fontSize: '28px', color: 'var(--text-muted)' }}></i>
              <p>Nessun campionato trovato per &quot;{searchQuery || selectedRegion}&quot;</p>
              <button
                type="button"
                className="btn-action mt-2"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedRegion('Tutti');
                }}
              >
                Mostra tutti i campionati
              </button>
            </div>
          ) : (
            <div className="championship-grid">
              {filteredCampionati.map((champ) => {
                const isSelected = champ.id === currentCamId;

                return (
                  <button
                    key={`${champ.regione}_${champ.id}`}
                    type="button"
                    className={`championship-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      onSelectChampionship(champ.id, champ.anno || 41, champ.formula || 19);
                      onClose();
                    }}
                  >
                    <div className="championship-card-top">
                      <span className={`cat-badge cat-${champ.categoria.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`}>
                        {champ.categoria}
                      </span>
                      <span className="region-tag">{champ.regione}</span>
                    </div>

                    <div className="championship-card-name">
                      <strong>{champ.nome}</strong>
                    </div>

                    <div className="championship-card-footer">
                      <span className="cam-id-hint">ID FITeT: #{champ.id}</span>
                      {isSelected ? (
                        <span className="selected-indicator">
                          <i className="bi bi-check-circle-fill"></i> Attivo
                        </span>
                      ) : (
                        <span className="select-action">
                          Seleziona <i className="bi bi-arrow-right-short"></i>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom Manual Code Entry Footer */}
        <div className="championship-modal-footer">
          <form className="custom-cam-form" onSubmit={handleCustomSubmit}>
            <div className="custom-cam-label">
              <i className="bi bi-link-45deg"></i>
              <span>Hai un codice o link FITeT specifico?</span>
            </div>
            <div className="custom-cam-input-group">
              <input
                type="text"
                className="custom-cam-input"
                placeholder="Es: 1902 oppure incolla URL FITeT"
                value={customCamInput}
                onChange={(e) => setCustomCamInput(e.target.value)}
              />
              <button type="submit" className="custom-cam-btn">
                Carica
              </button>
            </div>
            {customError && <span className="custom-cam-error">{customError}</span>}
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
