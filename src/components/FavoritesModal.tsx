import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFavoriteAthletes, FavoriteAthlete, saveFavoriteAthlete } from '../utils/favorites';
import { fetchAtleta } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { SearchAtletaModal } from './SearchAtletaModal';

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAthlete: (id: string, name: string) => void;
  onGoToSearch?: () => void;
}

export const FavoritesModal: React.FC<FavoritesModalProps> = ({
  isOpen,
  onClose,
  onSelectAthlete,
  onGoToSearch,
}) => {
  useBodyScrollLock(isOpen);
  const { favorites, removeFavorite, clearAllFavorites } = useFavoriteAthletes();
  const [filterText, setFilterText] = useState('');
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncedRef = useRef<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Sincronizza in background i dati dei preferiti con l'ultimo snapshot ufficiale (ranking reale, punti)
  useEffect(() => {
    if (!isOpen || favorites.length === 0 || syncedRef.current) return;
    syncedRef.current = true;

    favorites.forEach((fav) => {
      if (!fav.id || !/^\d+$/.test(fav.id)) return;
      fetchAtleta(fav.id)
        .then((data) => {
          const storico = data.storicoClassifica || [];
          const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
          const rankingReale = ultimoSnapshot?.posizione ?? undefined;
          const puntiReali = data.anagrafica.punti || ultimoSnapshot?.punti || undefined;
          const catReale = data.anagrafica.categoria || ultimoSnapshot?.categoria || undefined;

          if (
            (rankingReale !== undefined && rankingReale !== fav.ranking) ||
            (puntiReali !== undefined && puntiReali !== fav.punti) ||
            (catReale !== undefined && catReale !== fav.categoria) ||
            (!fav.squadra && data.anagrafica.societa)
          ) {
            saveFavoriteAthlete({
              id: data.id,
              name: data.anagrafica.nome,
              squadra: data.anagrafica.societa || fav.squadra,
              ranking: rankingReale ?? fav.ranking,
              punti: puntiReali ?? fav.punti,
              categoria: catReale ?? fav.categoria,
              dataNascita: data.anagrafica.dataNascita || fav.dataNascita,
              fotoUrl: data.anagrafica.fotoUrl || fav.fotoUrl,
            });
          }
        })
        .catch(() => {});
    });
  }, [isOpen, favorites]);

  // Reset del sync quando si chiude il modale
  useEffect(() => {
    if (!isOpen) {
      syncedRef.current = false;
    }
  }, [isOpen]);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Se la ricerca è aperta, è lei a gestire ESC
        if (isSearchOpen) return;
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, isSearchOpen]);

  // Focus filter input when modal opens with multiple favorites
  useEffect(() => {
    if (isOpen && favorites.length > 4) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [isOpen, favorites.length]);

  const filtered = useMemo(() => {
    if (!filterText.trim()) return favorites;
    const q = filterText.toLowerCase().trim();
    return favorites.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.squadra && f.squadra.toLowerCase().includes(q)) ||
        (f.id && f.id.toLowerCase().includes(q)) ||
        (f.categoria && f.categoria.toLowerCase().includes(q))
    );
  }, [favorites, filterText]);

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

  const formatCategoria = (cat?: string): string | null => {
    if (!cat) return null;
    const trimmed = cat.trim();
    const num = trimmed.replace(/\D/g, '');
    if (num) {
      return `${num}ª Cat.`;
    }
    return trimmed;
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop-simple favorites-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorites-modal-title"
    >
      <div
        className="modal-card-simple favorites-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', width: '94%' }}
      >
        {/* Header */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div className="modal-header-icon-box is-amber">
              <i className="bi bi-star-fill"></i>
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 id="favorites-modal-title" className="modal-header-title-serif">
                Atleti Preferiti
              </h3>
              <div className="modal-header-subtext">
                {favorites.length === 0
                  ? 'Nessun atleta salvato nei preferiti'
                  : `${favorites.length} ${favorites.length === 1 ? 'atleta salvato' : 'atleti salvati'} per un accesso rapido`}
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
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple" style={{ padding: '18px 20px', maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Quick Filter when multiple favorites */}
          {favorites.length > 3 && (
            <div className="modal-search-wrapper">
              <i className="bi bi-search modal-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="cerca-atleta-input modal-search-input-field"
                style={{ paddingRight: filterText ? '32px' : '12px' }}
                placeholder="Filtra tra i tuoi atleti preferiti..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  className="modal-search-clear-btn"
                  title="Cancella filtro"
                >
                  <i className="bi bi-x-circle-fill"></i>
                </button>
              )}
            </div>
          )}

          {/* Empty State */}
          {favorites.length === 0 && (
            <div className="modal-empty-state-box">
              <div className="modal-empty-state-icon-amber">
                <i className="bi bi-star"></i>
              </div>
              <h4 className="modal-empty-state-title">
                Nessun Atleta nei Preferiti
              </h4>
              <p className="modal-empty-state-desc">
                Aggiungi atleti ai preferiti cliccando sull&apos;icona della stella{' '}
                <span style={{ color: '#d97706', fontWeight: 600 }}>⭐</span> nella scheda di un atleta o durante la ricerca
                per averli sempre a portata di mano.
              </p>
              <button
                type="button"
                className="btn-action modal-empty-action-btn"
                onClick={() => setIsSearchOpen(true)}
              >
                <i className="bi bi-search"></i>
                Cerca Atleti da Salvare
              </button>
            </div>
          )}

          {/* Filtered Empty State */}
          {favorites.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #64748b)' }}>
              <i className="bi bi-search" style={{ fontSize: '24px', opacity: 0.6, marginBottom: '8px', display: 'block' }}></i>
              <p style={{ margin: 0, fontSize: '13.5px' }}>
                Nessun atleta preferito corrisponde a &quot;<strong>{filterText}</strong>&quot;
              </p>
            </div>
          )}

          {/* Favorites Grid */}
          {filtered.length > 0 && (
            <div className="modal-cards-grid">
              {filtered.map((fav: FavoriteAthlete) => {
                const hasImgError = failedImgs[fav.id];
                const fotoUrl = fav.fotoUrl || `https://portale.fitet.org/images/atleti/${fav.id}.jpg`;

                return (
                  <div
                    key={fav.id}
                    className="favorite-athlete-card"
                    onClick={() => {
                      onClose();
                      onSelectAthlete(fav.id, fav.name);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClose();
                        onSelectAthlete(fav.id, fav.name);
                      }
                    }}
                    title={`Apri la scheda di ${fav.name}`}
                  >
                    {/* Athlete Avatar */}
                    <div className="favorite-card-avatar">
                      {!hasImgError ? (
                        <img
                          src={fotoUrl}
                          alt={fav.name}
                          onError={() => handleImageError(fav.id)}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <span className="favorite-card-initials">{getInitials(fav.name)}</span>
                      )}
                    </div>

                    {/* Athlete Info */}
                    <div className="favorite-card-info">
                      <div className="favorite-card-name" title={fav.name}>
                        {fav.name}
                      </div>
                      {fav.squadra && (
                        <div className="favorite-card-sub" title={fav.squadra}>
                          <i className="bi bi-shield-shaded me-1" style={{ fontSize: '11px', opacity: 0.8 }}></i>
                          {fav.squadra}
                        </div>
                      )}
                      <div className="favorite-card-tags">
                        {(() => {
                          const rankingVal = typeof fav.ranking === 'string' ? parseInt(fav.ranking, 10) : fav.ranking;
                          return rankingVal ? (
                            <span
                              className="favorite-card-tag ranking-tag"
                              title={`Ranking Nazionale: Posizione #${rankingVal}`}
                            >
                              <i className="bi bi-trophy-fill" style={{ fontSize: '9.5px' }}></i>
                              Rank #{rankingVal}
                            </span>
                          ) : null;
                        })()}
                        {fav.punti !== undefined && (
                          <span
                            className="favorite-card-tag points-tag"
                            title={`Punti Classifica: ${Math.round(fav.punti).toLocaleString('it-IT')} pt`}
                          >
                            <i className="bi bi-graph-up" style={{ fontSize: '9.5px' }}></i>
                            {Math.round(fav.punti).toLocaleString('it-IT')} pt
                          </span>
                        )}
                        {fav.categoria && (
                          <span
                            className="favorite-card-tag cat-tag"
                            title={`Categoria: ${formatCategoria(fav.categoria)}`}
                          >
                            <i className="bi bi-person-badge-fill" style={{ fontSize: '9.5px' }}></i>
                            {formatCategoria(fav.categoria)}
                          </span>
                        )}
                        <span
                          className="favorite-card-tag id-tag"
                          title={fav.tessera ? `Tessera FITeT: ${fav.tessera}` : `ID Federale FITeT: ${fav.id}`}
                        >
                          <i className="bi bi-person-vcard" style={{ fontSize: '9.5px' }}></i>
                          {fav.tessera ? `Tess. ${fav.tessera}` : `ID ${fav.id}`}
                        </span>
                      </div>
                    </div>

                    {/* Quick Unfavorite Button */}
                    <button
                      type="button"
                      className="favorite-card-star-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(fav.id);
                      }}
                      title="Rimuovi dai preferiti"
                      aria-label={`Rimuovi ${fav.name} dai preferiti`}
                    >
                      <i className="bi bi-star-fill"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {favorites.length > 0 && (
          <div className="modal-footer-bar">
            <div>
              <button
                type="button"
                className="modal-footer-add-btn"
                onClick={() => setIsSearchOpen(true)}
              >
                <i className="bi bi-plus-circle"></i>
                Cerca altri atleti
              </button>
            </div>

            <div>
              {!confirmClear ? (
                <button
                  type="button"
                  className="modal-footer-clear-btn"
                  onClick={() => setConfirmClear(true)}
                  title="Elimina tutti gli atleti salvati"
                >
                  Svuota lista
                </button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#dc2626' }}>Confermi?</span>
                  <button
                    type="button"
                    className="modal-footer-confirm-btn"
                    onClick={() => {
                      clearAllFavorites();
                      setConfirmClear(false);
                    }}
                  >
                    Sì, svuota
                  </button>
                  <button
                    type="button"
                    className="modal-footer-cancel-btn"
                    onClick={() => setConfirmClear(false)}
                  >
                    Annulla
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modale ricerca atleta */}
        <SearchAtletaModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectAthlete={(id, name) => {
            onClose();
            onSelectAthlete(id, name);
          }}
        />
      </div>
    </div>,
    document.body
  );
};
