import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFavoriteAthletes, FavoriteAthlete } from '../utils/favorites';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

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

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

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
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
                fontSize: '20px',
                flexShrink: 0,
              }}
            >
              <i className="bi bi-star-fill"></i>
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3
                id="favorites-modal-title"
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                }}
              >
                Atleti Preferiti
              </h3>
              <div
                style={{
                  fontSize: '11.5px',
                  color: '#bfdbfe',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
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
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <i
                className="bi bi-search"
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: '13px',
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                className="cerca-atleta-input"
                style={{
                  paddingLeft: '34px',
                  paddingRight: filterText ? '32px' : '12px',
                  fontSize: '13px',
                  height: '38px',
                  borderRadius: '6px',
                  width: '100%',
                }}
                placeholder="Filtra tra i tuoi atleti preferiti..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  title="Cancella filtro"
                >
                  <i className="bi bi-x-circle-fill"></i>
                </button>
              )}
            </div>
          )}

          {/* Empty State */}
          {favorites.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(251, 191, 36, 0.12)',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  marginBottom: '16px',
                }}
              >
                <i className="bi bi-star"></i>
              </div>
              <h4
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: 'var(--text-main, #0f172a)',
                  margin: '0 0 8px 0',
                }}
              >
                Nessun Atleta nei Preferiti
              </h4>
              <p
                style={{
                  color: 'var(--text-muted, #64748b)',
                  fontSize: '13.5px',
                  maxWidth: '400px',
                  lineHeight: 1.5,
                  margin: '0 0 24px 0',
                }}
              >
                Aggiungi atleti ai preferiti cliccando sull&apos;icona della stella{' '}
                <span style={{ color: '#d97706', fontWeight: 600 }}>⭐</span> nella scheda di un atleta o durante la ricerca
                per averli sempre a portata di mano.
              </p>
              {onGoToSearch && (
                <button
                  type="button"
                  className="btn-action"
                  style={{
                    padding: '9px 20px',
                    fontSize: '13.5px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => {
                    onClose();
                    onGoToSearch();
                  }}
                >
                  <i className="bi bi-search"></i>
                  Cerca Atleti da Salvare
                </button>
              )}
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
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
                        {fav.ranking && (
                          <span className="favorite-card-tag ranking-tag">
                            #{fav.ranking}
                          </span>
                        )}
                        {fav.punti !== undefined && (
                          <span className="favorite-card-tag points-tag">
                            {fav.punti} pt
                          </span>
                        )}
                        {fav.categoria && (
                          <span className="favorite-card-tag cat-tag">
                            {fav.categoria}
                          </span>
                        )}
                        <span className="favorite-card-tag id-tag">
                          ID {fav.id}
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
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-light, #f1f5f9)',
              background: 'var(--bg-th, #f8fafc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: 'var(--text-muted, #64748b)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div>
              {onGoToSearch && (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary-600, #2563eb)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => {
                    onClose();
                    onGoToSearch();
                  }}
                >
                  <i className="bi bi-plus-circle"></i>
                  Cerca altri atleti
                </button>
              )}
            </div>

            <div>
              {!confirmClear ? (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    padding: '2px 6px',
                  }}
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
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      clearAllFavorites();
                      setConfirmClear(false);
                    }}
                  >
                    Sì, svuota
                  </button>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #64748b)',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                    onClick={() => setConfirmClear(false)}
                  >
                    Annulla
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
