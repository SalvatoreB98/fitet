import React from 'react';

interface HeaderProps {
  lastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: (event?: React.MouseEvent) => void;
  activeTab: 'classifica' | 'calendario' | 'statistiche';
  onChangeTab: (tab: 'classifica' | 'calendario' | 'statistiche') => void;
  counts: {
    classifica: number;
    calendario: number;
    statistiche: number;
  };
  onSelectAthleteById: (id: string, name: string) => void;
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
}) => {
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
        <div className="portal-title-block">
          <h1>D1 G.NORD </h1>
          <small>CALABRIA</small>
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

          <button
            type="button"
            className="btn-header"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Ricarica dati dal portale FITeT"
          >
            <i className={`bi bi-arrow-clockwise ${isRefreshing ? 'spin-anim' : ''}`}></i>
          </button>

        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="portal-nav">
        <button
          type="button"
          className={`portal-nav-tab ${activeTab === 'classifica' ? 'active' : ''}`}
          onClick={() => onChangeTab('classifica')}
        >
          <i className="bi bi-trophy"></i>
          <span>Classifica Squadre</span>
          <span className="tab-badge">{counts.classifica}</span>
        </button>

        <button
          type="button"
          className={`portal-nav-tab ${activeTab === 'calendario' ? 'active' : ''}`}
          onClick={() => onChangeTab('calendario')}
        >
          <i className="bi bi-calendar3"></i>
          <span>Calendario & Risultati</span>
          <span className="tab-badge">{counts.calendario}G</span>
        </button>

        <button
          type="button"
          className={`portal-nav-tab ${activeTab === 'statistiche' ? 'active' : ''}`}
          onClick={() => onChangeTab('statistiche')}
        >
          <i className="bi bi-person-lines-fill"></i>
          <span>Statistiche Atleti</span>
          <span className="tab-badge">{counts.statistiche}</span>
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
