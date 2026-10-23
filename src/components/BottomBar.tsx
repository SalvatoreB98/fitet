import React from 'react';
import './BottomBar.css';

export type MainViewType = 'home' | 'campionato' | 'classifiche';

export interface BottomBarProps {
  activeView: MainViewType;
  onChangeView: (view: MainViewType) => void;
  onOpenSearchModal: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  activeView,
  onChangeView,
  onOpenSearchModal,
}) => {
  return (
    <nav className="portal-bottom-bar-wrapper" aria-label="Navigazione principale">
      <div className="portal-bottom-bar">
        {/* 1. Home */}
        <button
          type="button"
          className={`bottom-bar-item ${activeView === 'home' ? 'is-active' : ''}`}
          onClick={() => onChangeView('home')}
          aria-label="Home Dashboard"
          aria-current={activeView === 'home' ? 'page' : undefined}
        >
          <div className="bottom-bar-icon-wrap">
            <i className="bi bi-house-door-fill"></i>
          </div>
          <span className="bottom-bar-label">Home</span>
        </button>

        {/* 2. Campionato */}
        <button
          type="button"
          className={`bottom-bar-item ${activeView === 'campionato' ? 'is-active' : ''}`}
          onClick={() => onChangeView('campionato')}
          aria-label="Campionato FITeT"
          aria-current={activeView === 'campionato' ? 'page' : undefined}
        >
          <div className="bottom-bar-icon-wrap">
            <i className="bi bi-trophy-fill"></i>
          </div>
          <span className="bottom-bar-label">Campionato</span>
        </button>

        {/* 3. Classifiche */}
        <button
          type="button"
          className={`bottom-bar-item ${activeView === 'classifiche' ? 'is-active' : ''}`}
          onClick={() => onChangeView('classifiche')}
          aria-label="Classifiche Ranking FITeT"
          aria-current={activeView === 'classifiche' ? 'page' : undefined}
        >
          <div className="bottom-bar-icon-wrap">
            <i className="bi bi-bar-chart-fill"></i>
          </div>
          <span className="bottom-bar-label">Classifiche</span>
        </button>

        {/* 4. Cerca Atleta */}
        <button
          type="button"
          className="bottom-bar-item bottom-bar-search-item"
          onClick={onOpenSearchModal}
          aria-label="Cerca Atleta"
          title="Cerca atleta FITeT"
        >
          <div className="bottom-bar-icon-wrap">
            <i className="bi bi-search"></i>
          </div>
          <span className="bottom-bar-label">Cerca Atleta</span>
        </button>
      </div>
    </nav>
  );
};
