import React, { useRef, useEffect, useState } from 'react';
import { getCachedUserRegion } from '../utils/geolocation';
import { useFavoriteAthletes } from '../utils/favorites';

interface HeaderProps {
  lastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: (event?: React.MouseEvent) => void;
  activeTab: 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta';
  onChangeTab: (tab: 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta') => void;
  counts: {
    classifica: number;
    calendario: number;
    statistiche: number;
  };
  onSelectAthleteById: (id: string, name: string) => void;
  championshipName?: string;
  championshipRegion?: string;
  onOpenChampionshipModal?: () => void;
  onOpenFavoritesModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  lastUpdated,
  isRefreshing,
  onRefresh,
  theme = 'light',
  onToggleTheme,
  activeTab,
  onChangeTab,
  counts,
  onSelectAthleteById,
  championshipName,
  championshipRegion,
  onOpenChampionshipModal,
  onOpenFavoritesModal,
}) => {
  const { favoritesCount } = useFavoriteAthletes();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  const centerTab = (tab: 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta', targetBtn?: HTMLElement | null) => {
    const nav = navRef.current;
    if (!nav) return;

    const btn = targetBtn || nav.querySelector<HTMLButtonElement>(`.portal-nav-tab[data-tab="${tab}"]`);
    if (!btn) return;

    // Precise horizontal centering inside portal-nav
    const targetLeft = btn.offsetLeft + (btn.offsetWidth / 2) - (nav.clientWidth / 2);
    nav.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  };

  const handleTabClick = (tab: 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta', e: React.MouseEvent<HTMLButtonElement>) => {
    centerTab(tab, e.currentTarget);
    onChangeTab(tab);
  };

  useEffect(() => {
    centerTab(activeTab);
  }, [activeTab]);

  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : '--:--';

  return (
    <>
      {/* Official Blue Top Header Bar */}
      <div className="portal-header">
        <div className='portal-header-logo'>
          <a href="https://portale.fitet.org/">
            <img className='logo-fitet' src="logo-fitet-portal.png" alt="" />
          </a>
        </div>
        <button
          type="button"
          className="portal-title-btn"
          onClick={onOpenChampionshipModal}
          title="Cambia campionato FITeT"
          aria-label="Cambia campionato FITeT"
        >
          <div className="portal-title-block">
            <div className="portal-title-heading-row">
              <h1>{championshipName || 'CAMPIONATO'}</h1>
              <span className="championship-switcher-badge" aria-hidden="true">
                <i className="bi bi-chevron-down"></i>
              </span>
            </div>
            <small>{(championshipRegion || getCachedUserRegion() || 'FITET').toUpperCase()}</small>
          </div>
        </button>
        <div className="portal-header-sponsor">
          <img className='logo-stag' src="STAG.png" alt="STAG" />
        </div>
        <div className="portal-header-actions" ref={menuRef}>
          {/* Quick Favorite Star Button */}
          {onOpenFavoritesModal && (
            <button
              type="button"
              className={`portal-quick-fav-btn ${favoritesCount > 0 ? 'has-favorites' : ''}`}
              onClick={onOpenFavoritesModal}
              title={favoritesCount > 0 ? `Atleti Preferiti (${favoritesCount})` : 'Atleti Preferiti'}
              aria-label="Atleti Preferiti"
            >
              <i className={favoritesCount > 0 ? 'bi bi-person-hearts text-warning' : 'bi bi-person-hearts'}></i>
              {favoritesCount > 0 && (
                <span className="portal-quick-fav-badge">{favoritesCount}</span>
              )}
            </button>
          )}

          {/* Burger Button in Alto a Destra */}
          <button
            type="button"
            className={`portal-burger-btn ${isMenuOpen ? 'is-open' : ''}`}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            title={isMenuOpen ? 'Chiudi menu' : 'Menu opzioni'}
            aria-label="Menu opzioni"
            aria-expanded={isMenuOpen}
          >
            <span className="burger-box">
              <span className="burger-bar burger-bar-1"></span>
              <span className="burger-bar burger-bar-2"></span>
              <span className="burger-bar burger-bar-3"></span>
            </span>
          </button>

          {/* Floating Dropdown & Backdrop */}
          {isMenuOpen && (
            <>
              <div
                className="portal-burger-backdrop"
                onClick={() => setIsMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="portal-burger-dropdown" role="menu">
                <div className="burger-menu-header">
                  <span className="burger-menu-title">Menu Rapido</span>
                  <span className="burger-menu-badge">FITeT</span>
                </div>

                <div className="burger-menu-items">
                  {/* 1. Atleti Preferiti */}
                  {onOpenFavoritesModal && (
                    <button
                      type="button"
                      role="menuitem"
                      className="burger-menu-item"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenFavoritesModal();
                      }}
                    >
                      <div className="burger-item-icon-box icon-star">
                        <i className="bi bi-star-fill"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Atleti Preferiti</span>
                        <span className="burger-item-desc">
                          {favoritesCount > 0
                            ? `${favoritesCount} ${favoritesCount === 1 ? 'atleta salvato' : 'atleti salvati'}`
                            : 'Schede atleti salvate'}
                        </span>
                      </div>
                      {favoritesCount > 0 ? (
                        <span className="burger-item-badge-count">{favoritesCount}</span>
                      ) : (
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      )}
                    </button>
                  )}

                  {/* 2. Ricerca Atleta / Scheda */}
                  <button
                    type="button"
                    role="menuitem"
                    className={`burger-menu-item ${activeTab === 'cercaAtleta' ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsMenuOpen(false);
                      onChangeTab('cercaAtleta');
                    }}
                  >
                    <div className="burger-item-icon-box icon-search">
                      <i className="bi bi-person-lines-fill"></i>
                    </div>
                    <div className="burger-item-content">
                      <span className="burger-item-title">Ricerca / Scheda Atleta</span>
                      <span className="burger-item-desc">Cerca atleti e apri schede ranking</span>
                    </div>
                    {activeTab === 'cercaAtleta' ? (
                      <span className="burger-item-badge-active">Attivo</span>
                    ) : (
                      <i className="bi bi-chevron-right burger-item-arrow"></i>
                    )}
                  </button>

                  {/* 2. Cambia Campionato */}
                  <button
                    type="button"
                    role="menuitem"
                    className="burger-menu-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenChampionshipModal?.();
                    }}
                  >
                    <div className="burger-item-icon-box icon-trophy">
                      <i className="bi bi-trophy-fill"></i>
                    </div>
                    <div className="burger-item-content">
                      <span className="burger-item-title">Cambia Campionato</span>
                      <span className="burger-item-desc" title={championshipName || 'Seleziona campionato'}>
                        {championshipName || 'Seleziona campionato FITeT'}
                      </span>
                    </div>
                    <i className="bi bi-chevron-right burger-item-arrow"></i>
                  </button>

                  {/* 3. Toggle Dark / Light Mode */}
                  {onToggleTheme && (
                    <div
                      role="menuitem"
                      tabIndex={0}
                      className="burger-menu-item burger-menu-item-theme"
                      onClick={(e) => onToggleTheme(e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggleTheme();
                        }
                      }}
                    >
                      <div className={`burger-item-icon-box ${theme === 'dark' ? 'icon-moon' : 'icon-sun'}`}>
                        <i className={theme === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill'}></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">
                          {theme === 'dark' ? 'Modalità Scura' : 'Modalità Chiara'}
                        </span>
                        <span className="burger-item-desc">
                          {theme === 'dark' ? 'Passa alla modalità chiara' : 'Passa alla modalità scura'}
                        </span>
                      </div>
                      <div className="burger-item-action" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`theme-toggle-pill ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
                          onClick={(e) => onToggleTheme(e)}
                          title={theme === 'dark' ? 'Passa alla modalità Chiara (Giorno)' : 'Passa alla modalità Scura (Notte)'}
                          aria-label="Cambia tema giorno/notte"
                        >
                          <span className="theme-toggle-track">
                            <span className="theme-toggle-icon icon-sun" aria-hidden="true">
                              <i className="bi bi-sun-fill"></i>
                            </span>
                            <span className="theme-toggle-icon icon-moon" aria-hidden="true">
                              <i className="bi bi-moon-stars-fill"></i>
                            </span>
                            <span className="theme-toggle-thumb" aria-hidden="true">
                              <i className={theme === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill'}></i>
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="portal-nav" ref={navRef}>
        <button
          type="button"
          data-tab="classifica"
          className={`portal-nav-tab ${activeTab === 'classifica' ? 'active' : ''}`}
          onClick={(e) => handleTabClick('classifica', e)}
        >
          <i className="bi bi-trophy"></i>
          <span>Classifica Squadre</span>
          <span className="tab-badge">{counts.classifica}</span>
        </button>

        <button
          type="button"
          data-tab="calendario"
          className={`portal-nav-tab ${activeTab === 'calendario' ? 'active' : ''}`}
          onClick={(e) => handleTabClick('calendario', e)}
        >
          <i className="bi bi-calendar3"></i>
          <span>Calendario & Risultati</span>
          <span className="tab-badge">{counts.calendario}G</span>
        </button>

        <button
          type="button"
          data-tab="statistiche"
          className={`portal-nav-tab ${activeTab === 'statistiche' ? 'active' : ''}`}
          onClick={(e) => handleTabClick('statistiche', e)}
        >
          <i className="bi bi-person-lines-fill"></i>
          <span>Statistiche Atleti</span>
          <span className="tab-badge">{counts.statistiche}</span>
        </button>

        <button
          type="button"
          data-tab="cercaAtleta"
          className={`portal-nav-tab ${activeTab === 'cercaAtleta' ? 'active' : ''}`}
          onClick={(e) => handleTabClick('cercaAtleta', e)}
        >
          <i className="bi bi-search"></i>
          <span>Ricerca Atleta</span>
        </button>
      </div>

      <style>{`
        .spin-anim {
          animation: spin 0.5s linear infinite;
        }
        @keyframes spin {
          from { 
            transform: rotate(0deg);
            opacity: 0 }
          to { 
            transform: rotate(360deg); 
            opacity: 1 
          }
        }
      `}</style>
    </>
  );
};
