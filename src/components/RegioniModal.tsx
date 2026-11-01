import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChampionshipItem } from '../types/fitet';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import {
  getCachedUserRegion,
  setUserRegion as saveUserRegion,
  subscribeToUserRegion,
  ITALIAN_REGIONS,
  regionToSlug,
  getRegionSeoMeta,
} from '../utils/geolocation';
import { useFavoriteChampionships } from '../utils/favorites';
import {
  SerieGroupKey,
  SERIE_CONFIGS,
  getChampionshipSerieKey,
  cleanChampionshipCardName,
  getChampionshipGender,
} from '../utils/championshipUtils';

interface RegioniModalProps {
  isOpen: boolean;
  activeRegion: string | null;
  currentCamId: number;
  myCamId?: number | null;
  campionati: ChampionshipItem[];
  isLoadingCampionati?: boolean;
  onSelectRegion: (region: string | null) => void;
  onSelectChampionship: (camId: number, annoId?: number, formulaId?: number) => void;
  onClose: () => void;
}

export const RegioniModal: React.FC<RegioniModalProps> = ({
  isOpen,
  activeRegion,
  currentCamId,
  myCamId,
  campionati,
  isLoadingCampionati = false,
  onSelectRegion,
  onSelectChampionship,
  onClose,
}) => {
  useBodyScrollLock(isOpen);

  const [userRegion, setUserRegionState] = useState<string>(getCachedUserRegion);
  const [searchQuery, setSearchQuery] = useState('');
  const { favoriteIds, toggleFavorite: toggleFavChampionship } = useFavoriteChampionships();

  // Regione correntemente visualizzata nella modale (priorità a activeRegion da URL, altrimenti userRegion)
  const selectedRegion = activeRegion || userRegion || null;

  useEffect(() => {
    return subscribeToUserRegion((nextRegion) => {
      setUserRegionState(nextRegion);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChooseRegion = (region: string | null) => {
    setSearchQuery('');
    if (region) {
      saveUserRegion(region);
      setUserRegionState(region);
    } else {
      saveUserRegion('');
      setUserRegionState('');
    }
    onSelectRegion(region);
  };

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const champ = campionati.find((c) => c.id === id);
    toggleFavChampionship(id, champ);
  };

  // Conteggio gironi per ciascun comitato regionale
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ITALIAN_REGIONS.forEach((r) => {
      counts[r] = 0;
    });
    campionati.forEach((c) => {
      const reg = (c.regione || '').trim();
      const matched = ITALIAN_REGIONS.find((r) => r.toLowerCase() === reg.toLowerCase());
      if (matched) {
        counts[matched] = (counts[matched] || 0) + 1;
      }
    });
    return counts;
  }, [campionati]);

  // Campionati filtrati per la regione selezionata
  const regionalChampionships = useMemo(() => {
    if (!selectedRegion) return [];
    const target = selectedRegion.toLowerCase();
    let list = campionati.filter((c) => (c.regione || '').toLowerCase() === target);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          (c.categoria && c.categoria.toLowerCase().includes(q))
      );
    }
    return list;
  }, [campionati, selectedRegion, searchQuery]);

  const groupedBySerie = useMemo(() => {
    const groups: Record<SerieGroupKey, ChampionshipItem[]> = {
      serie_a: [],
      serie_b: [],
      serie_c: [],
      serie_d: [],
      altri: [],
    };
    regionalChampionships.forEach((c) => {
      const key = getChampionshipSerieKey(c);
      groups[key].push(c);
    });
    return groups;
  }, [regionalChampionships]);

  const seoMeta = useMemo(() => {
    if (!selectedRegion) return null;
    return getRegionSeoMeta(selectedRegion);
  }, [selectedRegion]);

  const renderCard = (champ: ChampionshipItem) => {
    const isSelected = champ.id === currentCamId;
    const isFav = favoriteIds.includes(champ.id);
    const gender = getChampionshipGender(champ);
    const isFem = gender === 'F';
    const cleanedTitle = cleanChampionshipCardName(champ.nome, champ.categoria);
    const needsFemLabel = isFem && !/\bfemm/i.test(cleanedTitle) && !/\bfemminil/i.test(cleanedTitle);

    return (
      <button
        key={`${champ.regione}_${champ.id}`}
        type="button"
        className={`championship-card ${isSelected ? 'is-selected' : ''} ${isFem ? 'card-femminile' : 'card-maschile'}`}
        onClick={() => {
          onSelectChampionship(champ.id, champ.anno || 41, champ.formula || 19);
        }}
      >
        <div className="championship-card-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className={`cat-badge cat-${champ.categoria.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`}>
              {champ.categoria}
            </span>
            <span className={`champ-gender-badge ${isFem ? 'gender-badge-f' : 'gender-badge-m'}`}>
              <i className={`bi ${isFem ? 'bi-gender-female' : 'bi-gender-male'}`}></i>
              {isFem ? 'Femminile' : 'Maschile'}
            </span>
            <span className="region-tag">{champ.regione}</span>
          </div>

          <button
            type="button"
            className={`champ-fav-btn ${isFav ? 'is-fav' : ''}`}
            onClick={(e) => toggleFavorite(champ.id, e)}
            title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
          >
            <i className={`bi ${isFav ? 'bi-star-fill text-warning' : 'bi-star'}`}></i>
          </button>
        </div>

        <div className="championship-card-name">
          <strong>
            {cleanedTitle}
            {needsFemLabel && <span className="fem-title-tag"> (Femminile)</span>}
          </strong>
        </div>

        <div className="championship-card-footer">
          <span className="cam-id-hint">ID FITeT: #{champ.id}</span>
          {myCamId && champ.id === myCamId ? (
            <span className="selected-indicator my-champ-pill" title="Il tuo campionato (fissato)">
              <i className="bi bi-shield-check"></i> Il tuo campionato
            </span>
          ) : isSelected ? (
            <span className="selected-indicator" title="Attualmente in consultazione">
              <i className="bi bi-eye-fill"></i> In consultazione
            </span>
          ) : (
            <span className="select-action">
              Consulta <i className="bi bi-arrow-right-short"></i>
            </span>
          )}
        </div>
      </button>
    );
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
      aria-labelledby="regioni-modal-title"
    >
      <div className="championship-modal-dialog">
        {/* Modal Header */}
        <div className="championship-modal-header">
          <div className="header-icon-box">
            <i className="bi bi-geo-alt-fill"></i>
          </div>
          <div className="header-titles">
            <h2 id="regioni-modal-title">
              {seoMeta ? seoMeta.h1 : 'Comitati Regionali FITeT'}
            </h2>
            <p>
              {seoMeta
                ? seoMeta.description
                : 'Seleziona il tuo Comitato Regionale FITeT per consultare i campionati e i gironi della regione'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Chiudi e torna alla Home"
            title="Chiudi e torna alla Home"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Barra rapida di navigazione tra i 21 Comitati Regionali */}
        <div className="championship-regions-bar">
          <button
            type="button"
            className={`region-pill ${!selectedRegion ? 'active' : ''}`}
            onClick={() => handleChooseRegion(null)}
          >
            <i className="bi bi-grid-fill me-1"></i>
            Tutti i Comitati ({ITALIAN_REGIONS.length})
          </button>

          {ITALIAN_REGIONS.map((region) => {
            const slug = regionToSlug(region);
            const isSelected = selectedRegion?.toLowerCase() === region.toLowerCase();
            const count = regionCounts[region] || 0;
            return (
              <a
                key={slug}
                href={`/regioni/${slug}`}
                className={`region-pill ${isSelected ? 'active' : ''}`}
                style={{ textDecoration: 'none' }}
                onClick={(e) => {
                  e.preventDefault();
                  handleChooseRegion(region);
                }}
                title={`Portale Risultati FITeT ${region} – Classifiche e Gironi`}
              >
                {region}
                {count > 0 && <span className="pill-badge">{count}</span>}
              </a>
            );
          })}
        </div>

        {/* Barra di ricerca interna quando un comitato è selezionato */}
        {selectedRegion && (
          <div className="championship-search-section">
            <div className="search-input-wrapper">
              <i className="bi bi-search search-icon"></i>
              <input
                type="text"
                className="championship-search-input"
                placeholder={`Filtra gironi di ${selectedRegion} (es. C2, D1, D2, Girone A)...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
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
        )}

        {/* Contenuto Modale: Griglia Comitati Regionali oppure Gironi del Comitato selezionato */}
        <div className="championship-list-container">
          {isLoadingCampionati && campionati.length === 0 ? (
            <div className="championship-loading-state">
              <div className="spinner-border text-primary mb-2" role="status" style={{ width: '2rem', height: '2rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <p>Caricamento comitati e campionati FITeT in corso...</p>
            </div>
          ) : !selectedRegion ? (
            <div className="championship-group-section">
              <div className="championship-group-header" style={{ borderLeftColor: '#0284c7' }}>
                <div className="group-header-left">
                  <div className="group-header-title-box">
                    <h3 className="group-header-title">
                      <span
                        className="group-header-icon-box"
                        style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)' }}
                      >
                        <i className="bi bi-geo-alt-fill"></i>
                      </span>
                      Scegli un Comitato Regionale FITeT
                    </h3>
                  </div>
                </div>
                <span className="group-header-badge">
                  {ITALIAN_REGIONS.length} comitati
                </span>
              </div>

              <div className="championship-grid">
                {ITALIAN_REGIONS.map((region) => {
                  const slug = regionToSlug(region);
                  const count = regionCounts[region] || 0;
                  return (
                    <a
                      key={slug}
                      href={`/regioni/${slug}`}
                      className="championship-card"
                      style={{ textDecoration: 'none' }}
                      onClick={(e) => {
                        e.preventDefault();
                        handleChooseRegion(region);
                      }}
                    >
                      <div className="championship-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="region-tag">
                            <i className="bi bi-geo-alt-fill me-1"></i>
                            Comitato Regionale
                          </span>
                        </div>
                        <span className="group-header-badge">
                          {count} {count === 1 ? 'girone' : 'gironi'}
                        </span>
                      </div>

                      <div className="championship-card-name">
                        <strong>FITeT {region}</strong>
                      </div>

                      <div className="championship-card-footer">
                        <span className="cam-id-hint">Classifiche &amp; Gironi {region}</span>
                        <span className="select-action">
                          Apri comitato <i className="bi bi-arrow-right-short"></i>
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : regionalChampionships.length === 0 ? (
            <div className="championship-empty-state">
              <i className="bi bi-search mb-2" style={{ fontSize: '28px', color: 'var(--text-muted)' }}></i>
              <p>
                Nessun girone trovato per &quot;{searchQuery || selectedRegion}&quot;
              </p>
              <button
                type="button"
                className="btn-action mt-2"
                onClick={() => {
                  if (searchQuery) {
                    setSearchQuery('');
                  } else {
                    handleChooseRegion(null);
                  }
                }}
              >
                {searchQuery ? 'Mostra tutti i gironi della regione' : 'Mostra tutti i comitati'}
              </button>
            </div>
          ) : (
            <div>
              {(['serie_a', 'serie_b', 'serie_c', 'serie_d', 'altri'] as SerieGroupKey[]).map((groupKey) => {
                const list = groupedBySerie[groupKey];
                if (!list || list.length === 0) return null;
                const config = SERIE_CONFIGS[groupKey];

                return (
                  <div key={groupKey} className="championship-group-section">
                    <div
                      className="championship-group-header"
                      style={{ borderLeftColor: config.accent }}
                    >
                      <div className="group-header-left">
                        <div className="group-header-title-box">
                          <h3 className="group-header-title">
                            <span
                              className="group-header-icon-box"
                              style={{ color: config.accent, background: config.accentBg }}
                            >
                              <i className={`bi ${config.icon}`}></i>
                            </span>{' '}
                            {config.title} – {selectedRegion}
                          </h3>
                        </div>
                      </div>
                      <span className="group-header-badge">
                        {list.length} {list.length === 1 ? 'girone' : 'gironi'}
                      </span>
                    </div>

                    <div className="championship-grid">
                      {list.map((champ) => renderCard(champ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RegioniModal;

