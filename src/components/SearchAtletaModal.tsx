import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CercaAtletaTab } from './CercaAtletaTab';

interface SearchAtletaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAthlete: (id: string, name: string) => void;
}

export const SearchAtletaModal: React.FC<SearchAtletaModalProps> = ({
  isOpen,
  onClose,
  onSelectAthlete,
}) => {
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

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop-simple search-atleta-modal-backdrop"
      style={{ zIndex: 1100 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-atleta-modal-title"
    >
      <div
        className="modal-card-simple search-atleta-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '720px', width: '94%' }}
      >
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div className="modal-header-icon-box is-white">
              <i className="bi bi-search"></i>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 id="search-atleta-modal-title" className="modal-header-title-serif">
                Cerca Atleta
              </h3>
              <div className="modal-header-subtext">
                Trova un atleta e aprine la scheda
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

        <div className="modal-body-simple" style={{ padding: '8px 20px 20px', maxHeight: '78vh', overflowY: 'auto' }}>
          <CercaAtletaTab
            compactMode
            autoFocus
            hideHeader
            hideFavorites
            onOpenAtletaModal={(id, name) => {
              onClose();
              onSelectAthlete(id, name);
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
