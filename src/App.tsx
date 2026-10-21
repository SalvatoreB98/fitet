import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { DashboardData } from './types/fitet';
import { fetchDashboard } from './services/api';
import { Header } from './components/Header';
import { ClassificaTab } from './components/ClassificaTab';
import { CalendarioTab } from './components/CalendarioTab';
import { StatisticheTab } from './components/StatisticheTab';
import { AtletaModal } from './components/AtletaModal';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'classifica' | 'calendario' | 'statistiche'>('classifica');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<{ id: string; name: string; fromReferto?: boolean } | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fitet_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fitet_theme', theme);
  }, [theme]);

  const isTransitioningRef = useRef(false);

  const handleToggleTheme = (event?: React.MouseEvent) => {
    if (isTransitioningRef.current) return;
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    // Simple and robust circular reveal using View Transition API
    if (typeof document !== 'undefined' && typeof (document as any).startViewTransition === 'function') {
      isTransitioningRef.current = true;

      let x = window.innerWidth - 60;
      let y = 35;

      if (event && event.clientX && event.clientY) {
        x = event.clientX;
        y = event.clientY;
      } else {
        const toggleBtn = document.querySelector('.theme-toggle-pill');
        if (toggleBtn) {
          const rect = toggleBtn.getBoundingClientRect();
          x = rect.left + rect.width / 2;
          y = rect.top + rect.height / 2;
        }
      }

      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const transition = (document as any).startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('fitet_theme', nextTheme);
      });

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 380,
            easing: 'ease-out',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      }).catch(() => {
        // Fallback if transition was cancelled
      });

      transition.finished.finally(() => {
        isTransitioningRef.current = false;
      });
    } else {
      setTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('fitet_theme', nextTheme);
    }
  };

  const loadDashboard = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await fetchDashboard(force);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento dei dati FITeT');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleTabChange = (tab: 'classifica' | 'calendario' | 'statistiche') => {
    setActiveTab(tab);
    // Prevent violent scroll jumps if switched from a very long tab
    const portal = document.querySelector('.portal-container');
    if (portal) {
      const rect = portal.getBoundingClientRect();
      if (rect.top < 0) {
        window.scrollTo({ top: window.scrollY + rect.top, behavior: 'smooth' });
      }
    }
  };

  const handleSelectTeamFromClassifica = (teamName: string) => {
    setSelectedTeamFilter(teamName);
    handleTabChange('calendario');
  };

  return (
    <div className="portal-container">
      {/* Top Header with integrated nav tabs */}
      <Header
        lastUpdated={data?.lastUpdated || null}
        isRefreshing={refreshing}
        onRefresh={() => loadDashboard(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        counts={{
          classifica: data?.classifica.length || 10,
          calendario: data?.calendario.length || 9,
          statistiche: data?.statisticheAtleti.length || 35,
        }}
        onSelectAthleteById={(id, name) => setSelectedAthlete({ id, name })}
      />

      {/* Loading Indicator */}
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '60px 20px', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: '#1e293b', marginBottom: '8px', fontSize: '1.25rem' }}>
            Connessione a portale.fitet.org...
          </h3>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            Caricamento dati ufficiali Serie D/1 Girone Nord Calabria in corso
          </p>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div style={{ padding: '14px 20px', background: '#fee2e2', borderBottom: '1px solid #fca5a5', color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>Errore di connessione a portale.fitet.org:</strong> {error}
          </div>
          <button className="btn-action" onClick={() => loadDashboard(true)}>
            Riprova
          </button>
        </div>
      )}

      {/* Main Content Area: Retains mounted tab panels to eliminate CLS */}
      {data && (
        <>
          <main className="portal-main">
            <div
              className={`tab-pane ${activeTab === 'classifica' ? 'active' : ''}`}
              role="tabpanel"
              id="tabpanel-classifica"
            >
              <ClassificaTab
                classifica={data.classifica}
                onSelectTeam={handleSelectTeamFromClassifica}
              />
            </div>

            <div
              className={`tab-pane ${activeTab === 'calendario' ? 'active' : ''}`}
              role="tabpanel"
              id="tabpanel-calendario"
            >
              <CalendarioTab
                calendario={data.calendario}
                selectedTeamFilter={selectedTeamFilter}
                statisticheAtleti={data.statisticheAtleti}
                isSubmodalOpen={Boolean(selectedAthlete)}
                onClearTeamFilter={() => setSelectedTeamFilter(null)}
                onSelectTeamFilter={(team) => setSelectedTeamFilter(team)}
                onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: true })}
              />
            </div>

            <div
              className={`tab-pane ${activeTab === 'statistiche' ? 'active' : ''}`}
              role="tabpanel"
              id="tabpanel-statistiche"
            >
              <StatisticheTab
                statistiche={data.statisticheAtleti}
                onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
              />
            </div>
          </main>

          {/* Footer */}
          <footer className="portal-footer mt-5 text-center">
            <div>
              <strong>Federazione Italiana Tennistavolo (FITeT)</strong> • Portale Non Ufficiale Regionale Calabria
              <div className="text-center">
                Dati sincronizzati con portale.fitet.org
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Athlete Detail Profile Modal */}
      {selectedAthlete && (
        <AtletaModal
          atletaId={selectedAthlete.id}
          athleteName={selectedAthlete.name}
          returnLabel={selectedAthlete.fromReferto ? 'Torna al referto' : 'Indietro'}
          onClose={() => setSelectedAthlete(null)}
        />
      )}
    </div>
  );
};
