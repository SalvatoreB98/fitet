import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { DashboardData, ChampionshipItem } from './types/fitet';
import { fetchDashboard, fetchCampionati } from './services/api';
import { Header } from './components/Header';
import { ClassificaTab } from './components/ClassificaTab';
import { CalendarioTab } from './components/CalendarioTab';
import { StatisticheTab } from './components/StatisticheTab';
import { AtletaModal } from './components/AtletaModal';
import { ChampionshipModal } from './components/ChampionshipModal';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Championship selection state
  const [camId, setCamId] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCam = urlParams.get('cam');
      if (urlCam && /^\d+$/.test(urlCam)) return parseInt(urlCam, 10);
      const savedCam = localStorage.getItem('fitet_selected_cam');
      if (savedCam && /^\d+$/.test(savedCam)) return parseInt(savedCam, 10);
    }
    return 1902;
  });

  const [annoId, setAnnoId] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlAnno = urlParams.get('anno');
      if (urlAnno && /^\d+$/.test(urlAnno)) return parseInt(urlAnno, 10);
    }
    return 41;
  });

  const [campionati, setCampionati] = useState<ChampionshipItem[]>([]);
  const [loadingCampionati, setLoadingCampionati] = useState<boolean>(false);
  const [isChampionshipModalOpen, setIsChampionshipModalOpen] = useState<boolean>(false);

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

  const loadDashboard = async (targetCam = camId, targetAnno = annoId, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await fetchDashboard(targetCam, targetAnno, force);
      setData(result);

      if (result.championship) {
        document.title = `FITeT ${result.championship.nome} - ${result.championship.regione} | Risultati & Classifica`;
      }
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento dei dati FITeT');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Pre-fetch championship catalog on mount
  useEffect(() => {
    let active = true;
    setLoadingCampionati(true);
    fetchCampionati()
      .then((items) => {
        if (active) setCampionati(items);
      })
      .catch((err) => console.error('Errore caricamento campionati:', err))
      .finally(() => {
        if (active) setLoadingCampionati(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch dashboard whenever camId or annoId changes
  useEffect(() => {
    loadDashboard(camId, annoId);

    // Sync URL and localStorage
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('cam', String(camId));
      if (annoId !== 41) url.searchParams.set('anno', String(annoId));
      else url.searchParams.delete('anno');
      window.history.replaceState({}, '', url.toString());
      localStorage.setItem('fitet_selected_cam', String(camId));
    }
  }, [camId, annoId]);

  const handleSelectChampionship = (newCam: number, newAnno = 41) => {
    setSelectedTeamFilter(null);
    setCamId(newCam);
    setAnnoId(newAnno);
  };

  const handleTabChange = (tab: 'classifica' | 'calendario' | 'statistiche') => {
    setActiveTab(tab);
    // Smoothly scroll to the portal navigation / top of content if user was scrolled down
    const nav = document.querySelector('.portal-nav');
    if (nav) {
      const rect = nav.getBoundingClientRect();
      if (rect.top < 0) {
        window.scrollTo({ top: window.scrollY + rect.top, behavior: 'smooth' });
      }
    } else {
      const portal = document.querySelector('.portal-container');
      if (portal) {
        const rect = portal.getBoundingClientRect();
        if (rect.top < 0) {
          window.scrollTo({ top: window.scrollY + rect.top, behavior: 'smooth' });
        }
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
        onRefresh={() => loadDashboard(camId, annoId, true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        counts={{
          classifica: data?.classifica.length || 0,
          calendario: data?.calendario.length || 0,
          statistiche: data?.statisticheAtleti.length || 0,
        }}
        onSelectAthleteById={(id, name) => setSelectedAthlete({ id, name })}
        championshipName={data?.championship.nome}
        championshipRegion={data?.championship.regione}
        onOpenChampionshipModal={() => setIsChampionshipModalOpen(true)}
      />

      {/* Loading Indicator */}
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '60px 20px', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-main, #1e293b)', marginBottom: '8px', fontSize: '1.25rem' }}>
            Connessione a portale.fitet.org...
          </h3>
          <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '13px', margin: 0 }}>
            Caricamento dati campionato #{camId} in corso
          </p>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div style={{ padding: '14px 20px', background: '#fee2e2', borderBottom: '1px solid #fca5a5', color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>Errore di connessione a portale.fitet.org:</strong> {error}
          </div>
          <button className="btn-action" onClick={() => loadDashboard(camId, annoId, true)}>
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
                currentCamId={camId}
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
              <strong>Federazione Italiana Tennistavolo (FITeT)</strong> • {data?.championship.nome} ({data?.championship.regione})
              <div className="text-center">
                Dati sincronizzati ufficialmente con portale.fitet.org
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Championship Picker Modal */}
      <ChampionshipModal
        isOpen={isChampionshipModalOpen}
        currentCamId={camId}
        campionati={campionati}
        isLoadingCampionati={loadingCampionati}
        onClose={() => setIsChampionshipModalOpen(false)}
        onSelectChampionship={handleSelectChampionship}
      />

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
