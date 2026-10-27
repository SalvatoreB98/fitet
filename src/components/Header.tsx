import React, { useRef, useEffect, useState } from 'react';
import { getCachedUserRegion } from '../utils/geolocation';
import { useFavoriteAthletes } from '../utils/favorites';

export type MainViewType = 'home' | 'campionato' | 'classifiche';
export type ChampionshipTabType = 'classifica' | 'calendario' | 'statistiche';

interface HeaderProps {
  mainView: MainViewType;
  onChangeMainView: (view: MainViewType) => void;
  lastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: (event?: React.MouseEvent) => void;
  activeTab: ChampionshipTabType;
  onChangeTab: (tab: ChampionshipTabType) => void;
  counts: {
    classifica: number;
    calendario: number;
    statistiche: number;
  };
  onSelectAthleteById: (id: string, name: string) => void;
  championshipName?: string;
  championshipRegion?: string;
  isConsulting?: boolean;
  onReturnToMyChampionship?: () => void;
  onOpenChampionshipModal?: () => void;
  onOpenFavoritesModal?: () => void;
  onOpenSearchModal?: () => void;
  onOpenInstallAppModal?: () => void;
  onPrecacheChampionship?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mainView,
  onChangeMainView,
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
  isConsulting = false,
  onReturnToMyChampionship,
  onOpenChampionshipModal,
  onOpenFavoritesModal,
  onOpenSearchModal,
  onOpenInstallAppModal,
  onPrecacheChampionship,
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

  const centerTab = (tab: ChampionshipTabType, targetBtn?: HTMLElement | null) => {
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

  const handleTabClick = (tab: ChampionshipTabType, e: React.MouseEvent<HTMLButtonElement>) => {
    centerTab(tab, e.currentTarget);
    onChangeTab(tab);
  };

  useEffect(() => {
    if (mainView === 'campionato') {
      centerTab(activeTab);
    }
  }, [activeTab, mainView]);

  return (
    <>
      <nav>
        {/* Official Blue Top Header Bar */}
        <div className="portal-header">
          <div className='portal-header-logo'>
            <a href="https://portale.fitet.org/" target="_blank" rel="noopener noreferrer">
              <img className='logo-fitet' src="bw.png" alt="FITeT" />
            </a>
          </div>

          {/* Championship Switcher Button - Shown ONLY in 'campionato' view per user request */}
          {mainView === 'campionato' ? (
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
                  {isConsulting && (
                    <span className="header-consulting-badge" title="Stai visualizzando questo campionato in consultazione">
                      <i className="bi bi-eye-fill me-1"></i> Consultazione
                    </span>
                  )}
                  <span className="championship-switcher-badge" aria-hidden="true">
                    <i className="bi bi-chevron-down"></i>
                  </span>
                </div>
                <small>{(championshipRegion || getCachedUserRegion() || 'FITET').toUpperCase()}</small>
              </div>
            </button>
          ) : (
            <div className="portal-title-block portal-title-static" style={{ cursor: 'default' }}>
              <div className="portal-title-heading-row">
                <h1>{mainView === 'home' ? 'PORTALE FITET' : 'CLASSIFICHE'}</h1>
              </div>
              <small>{mainView === 'home' ? 'HOME & PREFERITI' : 'RANKING UFFICIALE FITET'}</small>
            </div>
          )}

          <div className="portal-header-sponsor">
            <img className='logo-stag' src="STAG.png" alt="STAG" />
          </div>

          <div className="portal-header-actions" ref={menuRef}>
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
                    <button className="burger-menu-close" onClick={() => setIsMenuOpen(false)}><i className='bi bi-x-lg'></i></button>
                  </div>

                  <div className="burger-menu-items">
                    {/* 1. Home Dashboard */}
                    <button
                      type="button"
                      role="menuitem"
                      className={`burger-menu-item ${mainView === 'home' ? 'is-active' : ''}`}
                      onClick={() => {
                        setIsMenuOpen(false);
                        onChangeMainView('home');
                      }}
                    >
                      <div className="burger-item-icon-box icon-home">
                        <i className="bi bi-house-door-fill"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Home Dashboard</span>
                        <span className="burger-item-desc">Preferiti, cronologia e accesso rapido</span>
                      </div>
                      {mainView === 'home' ? (
                        <span className="burger-item-badge-active">Attivo</span>
                      ) : (
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      )}
                    </button>

                    {/* 2. Campionato */}
                    <button
                      type="button"
                      role="menuitem"
                      className={`burger-menu-item ${mainView === 'campionato' ? 'is-active' : ''}`}
                      onClick={() => {
                        setIsMenuOpen(false);
                        onChangeMainView('campionato');
                      }}
                    >
                      <div className="burger-item-icon-box icon-trophy">
                        <i className="bi bi-trophy-fill"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Campionato</span>
                        <span className="burger-item-desc">
                          {championshipName ? `${championshipName}` : 'Classifica squadre e calendario'}
                        </span>
                      </div>
                      {mainView === 'campionato' ? (
                        <span className="burger-item-badge-active">Attivo</span>
                      ) : (
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      )}
                    </button>

                    {/* 2b. Azione Rapida: Torna al mio campionato (se in consultazione) */}
                    {isConsulting && onReturnToMyChampionship && (
                      <button
                        type="button"
                        role="menuitem"
                        className="burger-menu-item is-consulting-return"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onReturnToMyChampionship();
                        }}
                      >
                        <div className="burger-item-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}>
                          <i className="bi bi-arrow-return-left"></i>
                        </div>
                        <div className="burger-item-content">
                          <span className="burger-item-title" style={{ color: '#047857', fontWeight: 600 }}>
                            Torna al mio campionato
                          </span>
                          <span className="burger-item-desc">Chiudi la consultazione attiva</span>
                        </div>
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      </button>
                    )}

                    {/* 3. Classifiche Nazionali / Regionali */}
                    <button
                      type="button"
                      role="menuitem"
                      className={`burger-menu-item ${mainView === 'classifiche' ? 'is-active' : ''}`}
                      onClick={() => {
                        setIsMenuOpen(false);
                        onChangeMainView('classifiche');
                      }}
                    >
                      <div className="burger-item-icon-box icon-star">
                        <i className="bi bi-bar-chart-fill"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Classifiche Ufficiali</span>
                        <span className="burger-item-desc">Ranking nazionale e comitati regionali</span>
                      </div>
                      {mainView === 'classifiche' ? (
                        <span className="burger-item-badge-active">Attivo</span>
                      ) : (
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      )}
                    </button>

                    {/* 4. Ricerca / Scheda Atleta (Apre SearchAtletaModal) */}
                    <button
                      type="button"
                      role="menuitem"
                      className="burger-menu-item"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSearchModal?.();
                      }}
                    >
                      <div className="burger-item-icon-box icon-search">
                        <i className="bi bi-search"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Ricerca Atleta</span>
                        <span className="burger-item-desc">Cerca atleti e apri schede profilo</span>
                      </div>
                      <i className="bi bi-chevron-right burger-item-arrow"></i>
                    </button>

                    {/* 5. Atleti Preferiti */}
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
                          <i className="bi bi-person-hearts"></i>
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

                    {/* 6. Cambia Campionato */}
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
                        <i className="bi bi-grid-3x3-gap-fill"></i>
                      </div>
                      <div className="burger-item-content">
                        <span className="burger-item-title">Cambia Campionato</span>
                        <span className="burger-item-desc" title={championshipName || 'Seleziona campionato'}>
                          {championshipName || 'Seleziona campionato FITeT'}
                        </span>
                      </div>
                      <i className="bi bi-chevron-right burger-item-arrow"></i>
                    </button>

                    {/* 7. Scarica App */}
                    {onOpenInstallAppModal && (
                      <button
                        type="button"
                        role="menuitem"
                        className="burger-menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onOpenInstallAppModal();
                        }}
                      >
                        <div className="burger-item-icon-box icon-download">
                          <i className="bi bi-download"></i>
                        </div>
                        <div className="burger-item-content">
                          <span className="burger-item-title">Scarica App</span>
                          <span className="burger-item-desc">Installa per uso a schermo intero (PWA)</span>
                        </div>
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      </button>
                    )}

                    {/* 7b. Salva per la Palestra (Offline Pre-cache) */}
                    {onPrecacheChampionship && (
                      <button
                        type="button"
                        role="menuitem"
                        className="burger-menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onPrecacheChampionship();
                        }}
                      >
                        <div className="burger-item-icon-box" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#0284c7' }}>
                          <i className="bi bi-cloud-arrow-down-fill"></i>
                        </div>
                        <div className="burger-item-content">
                          <span className="burger-item-title">Salva per la Palestra</span>
                          <span className="burger-item-desc">Scarica dati per consultazione offline</span>
                        </div>
                        <i className="bi bi-chevron-right burger-item-arrow"></i>
                      </button>
                    )}

                    {/* 8. Toggle Dark / Light Mode */}
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

        {/* Sub-Navigation Tabs: SHOWN ONLY when mainView === 'campionato' */}
        {mainView === 'campionato' && (
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
              <span>Atleti Girone</span>
              <span className="tab-badge">{counts.statistiche}</span>
            </button>
          </div>
        )}
      </nav>

      <style>{`
        .spin-anim {
          animation: spin 0.5s linear infinite;
        }
        @keyframes spin {
          from { 
            transform: rotate(0deg);
            opacity: 0;
          }
          to { 
            transform: rotate(360deg); 
            opacity: 1; 
          }
        }
      `}</style>
    </>
  );
};
