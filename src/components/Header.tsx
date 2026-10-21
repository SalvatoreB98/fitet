import React, { useRef, useEffect } from 'react';
import { getCachedUserRegion } from '../utils/geolocation';

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
}) => {
  const navRef = useRef<HTMLDivElement>(null);

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
        <div className="portal-header-actions">
          {/* Compact Icon-Only Motion Graphic Toggle */}
          {onToggleTheme && (
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
          <span>Cerca Atleta</span>
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
