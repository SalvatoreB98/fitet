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
import { SquadraModal } from './components/SquadraModal';
import { IntroMotionGraphic } from './components/IntroMotionGraphic';
import { CercaAtletaTab } from './components/CercaAtletaTab';
import { HomeTab } from './components/HomeTab';
import { FavoritesModal } from './components/FavoritesModal';
import { registerTeamLogos } from './utils/teamLogos';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Championship selection state
  const [camId, setCamId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCam = urlParams.get('cam');
      if (urlCam && /^\d+$/.test(urlCam)) return parseInt(urlCam, 10);
      const savedCam = localStorage.getItem('fitet_selected_cam');
      if (savedCam && /^\d+$/.test(savedCam)) return parseInt(savedCam, 10);
    }
    return null;
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
  const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState<boolean>(false);

  // Motion Graphic Intro on first access only
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('intro') === '1') return true;
      const completed = localStorage.getItem('fitet_intro_completed');
      return !completed;
    }
    return false;
  });

  const handleIntroComplete = () => {
    setShowIntro(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fitet_intro_completed', 'true');
    }
  };

  const [activeTab, setActiveTab] = useState<'home' | 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['home', 'classifica', 'calendario', 'statistiche', 'cercaAtleta'].includes(tabParam)) {
        return tabParam as any;
      }
    }
    return 'home';
  });
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null);
  // Stack di modali atleta: ogni apertura crea una nuova istanza senza chiudere le precedenti
  const [athleteStack, setAthleteStack] = useState<Array<{ key: string; id: string; name: string; fromReferto?: boolean }>>([]);
  const athleteKeyCounter = useRef(0);
  const setSelectedAthlete = (a: { id: string; name: string; fromReferto?: boolean }) => {
    setAthleteStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.id === a.id && top.name === a.name) return prev;
      athleteKeyCounter.current += 1;
      return [...prev, { key: `athlete-${athleteKeyCounter.current}`, ...a }];
    });
  };
  const closeTopAthlete = () => setAthleteStack((prev) => prev.slice(0, -1));
  const selectedAthlete = athleteStack.length > 0 ? athleteStack[athleteStack.length - 1] : null;
  const [selectedSquadra, setSelectedSquadra] = useState<{ id: string; name: string } | null>(null);

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
    if (!targetCam) {
      setLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await fetchDashboard(targetCam, targetAnno, force);
      setData(result);
      if (result.classifica) {
        registerTeamLogos(result.classifica);
      }

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
    if (!camId) {
      setLoading(false);
      return;
    }

    loadDashboard(camId, annoId);

    // Sync URL and localStorage
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('cam', String(camId));
      if (annoId !== 41) url.searchParams.set('anno', String(annoId));
      else url.searchParams.delete('anno');
      window.history.replaceState({ ...(window.history.state || {}), cam: camId, anno: annoId }, '', url.toString());
      localStorage.setItem('fitet_selected_cam', String(camId));
    }
  }, [camId, annoId, showIntro]);

  const handleSelectChampionship = (newCam: number, newAnno = 41) => {
    setSelectedTeamFilter(null);
    setCamId(newCam);
    setAnnoId(newAnno);
  };

  const scrollToNav = () => {
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

  // Sync initial tab into history state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (activeTab !== 'home') {
        url.searchParams.set('tab', activeTab);
      } else {
        url.searchParams.delete('tab');
      }
      window.history.replaceState({ ...(window.history.state || {}), tab: activeTab }, '', url.toString());
    }
  }, []);

  // Listen to browser back / forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      const validTabs = ['home', 'classifica', 'calendario', 'statistiche', 'cercaAtleta'] as const;

      const targetTab = tabParam && (validTabs as readonly string[]).includes(tabParam)
        ? (tabParam as typeof validTabs[number])
        : 'home';

      setActiveTab(targetTab);

      // Check if cam also changed
      const urlCam = urlParams.get('cam');
      if (urlCam && /^\d+$/.test(urlCam)) {
        const parsedCam = parseInt(urlCam, 10);
        setCamId((prev) => (prev !== parsedCam ? parsedCam : prev));
      }
      const urlAnno = urlParams.get('anno');
      if (urlAnno && /^\d+$/.test(urlAnno)) {
        const parsedAnno = parseInt(urlAnno, 10);
        setAnnoId((prev) => (prev !== parsedAnno ? parsedAnno : prev));
      }

      scrollToNav();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tab: 'home' | 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta') => {
    if (tab === activeTab) {
      scrollToNav();
      return;
    }

    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab !== 'home') {
        url.searchParams.set('tab', tab);
      } else {
        url.searchParams.delete('tab');
      }
      window.history.pushState({ ...(window.history.state || {}), tab }, '', url.toString());
    }

    scrollToNav();
  };

  const handleOpenSquadra = (teamName: string, squadraId?: string) => {
    let resolvedId = squadraId;
    if (!resolvedId && data?.classifica) {
      const match = data.classifica.find(
        (sq) => sq.nome.toUpperCase().trim() === teamName.toUpperCase().trim()
      );
      if (match) resolvedId = match.squadraId;
    }
    setSelectedSquadra({ id: resolvedId || teamName, name: teamName });
  };

  return (
    <div className="portal-container">
      {/* Motion Graphic Intro (first access only) */}
      {showIntro && <IntroMotionGraphic onComplete={handleIntroComplete} />}

      {/* Top Header with integrated nav tabs */}
      <Header
        lastUpdated={data?.lastUpdated || null}
        isRefreshing={refreshing}
        onRefresh={() => camId && loadDashboard(camId, annoId, true)}
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
        onOpenFavoritesModal={() => setIsFavoritesModalOpen(true)}
      />

      {/* Loading Indicator for non-home screens */}
      {loading && !data && activeTab !== 'home' && (
        <div className="portal-loading-state">
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-main, #1e293b)', marginBottom: '8px', fontSize: '1.25rem' }}>
            Connessione a portale.fitet.org...
          </h3>
          <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '13px', margin: 0 }}>
            {camId ? `Caricamento dati campionato #${camId} in corso` : 'Caricamento dati in corso...'}
          </p>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="portal-error-alert">
          <div>
            <strong>Errore di connessione a portale.fitet.org:</strong> {error}
          </div>
          <button className="btn-action" onClick={() => camId && loadDashboard(camId, annoId, true)}>
            Riprova
          </button>
        </div>
      )}

      {/* Main Content Area: Retains mounted tab panels to eliminate CLS */}
      <main className="portal-main">
        {/* Tab Panel: Home */}
        <div
          className={`tab-pane ${activeTab === 'home' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-home"
        >
          <HomeTab
            currentCamId={camId}
            annoId={annoId}
            currentChampionship={data?.championship}
            campionati={campionati}
            isLoadingCampionati={loadingCampionati}
            onSelectChampionship={handleSelectChampionship}
            onNavigateTab={handleTabChange}
            onOpenChampionshipModal={() => setIsChampionshipModalOpen(true)}
            onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
            dashboardData={data}
          />
        </div>

        {/* Tab Panel: Classifica */}
        <div
          className={`tab-pane ${activeTab === 'classifica' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-classifica"
        >
          {data ? (
            <ClassificaTab
              classifica={data.classifica}
              onSelectTeam={handleOpenSquadra}
            />
          ) : !loading ? (
            <div className="no-championship-screen">
              <div className="no-championship-icon-badge">
                <i className="bi bi-trophy-fill"></i>
              </div>
              <h2 className="no-championship-title">
                Nessun Campionato Selezionato
              </h2>
              <p className="no-championship-desc">
                Scegli il campionato FITeT da consultare per visualizzare la classifica squadre, oppure selezionalo dai preferiti in Home.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-action no-championship-btn"
                  onClick={() => setIsChampionshipModalOpen(true)}
                >
                  <i className="bi bi-trophy me-2"></i>
                  Scegli Campionato
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tab Panel: Calendario */}
        <div
          className={`tab-pane ${activeTab === 'calendario' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-calendario"
        >
          {data ? (
            <CalendarioTab
              calendario={data.calendario}
              selectedTeamFilter={selectedTeamFilter}
              statisticheAtleti={data.statisticheAtleti}
              isSubmodalOpen={Boolean(selectedAthlete) || Boolean(selectedSquadra)}
              currentCamId={camId ?? undefined}
              onClearTeamFilter={() => setSelectedTeamFilter(null)}
              onSelectTeamFilter={(team) => setSelectedTeamFilter(team)}
              onOpenSquadraModal={handleOpenSquadra}
              onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: true })}
            />
          ) : !loading ? (
            <div className="no-championship-screen">
              <div className="no-championship-icon-badge">
                <i className="bi bi-calendar3"></i>
              </div>
              <h2 className="no-championship-title">
                Nessun Campionato Selezionato
              </h2>
              <p className="no-championship-desc">
                Scegli il campionato FITeT da consultare per visualizzare il calendario completo e i risultati.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-action no-championship-btn"
                  onClick={() => setIsChampionshipModalOpen(true)}
                >
                  <i className="bi bi-trophy me-2"></i>
                  Scegli Campionato
                </button>

              </div>
            </div>
          ) : null}
        </div>

        {/* Tab Panel: Statistiche */}
        <div
          className={`tab-pane ${activeTab === 'statistiche' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-statistiche"
        >
          {data ? (
            <StatisticheTab
              statistiche={data.statisticheAtleti}
              onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
            />
          ) : !loading ? (
            <div className="no-championship-screen">
              <div className="no-championship-icon-badge">
                <i className="bi bi-person-lines-fill"></i>
              </div>
              <h2 className="no-championship-title">
                Nessun Campionato Selezionato
              </h2>
              <p className="no-championship-desc">
                Scegli il campionato FITeT da consultare per visualizzare le statistiche degli atleti del girone.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-action no-championship-btn"
                  onClick={() => setIsChampionshipModalOpen(true)}
                >
                  <i className="bi bi-trophy me-2"></i>
                  Scegli Campionato
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tab Panel: Cerca Atleta */}
        <div
          className={`tab-pane ${activeTab === 'cercaAtleta' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-cerca-atleta"
        >
          <CercaAtletaTab
            onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
            autoFocus={activeTab === 'cercaAtleta'}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="portal-footer mt-5 text-center">
        <div>
          <strong>Federazione Italiana Tennistavolo (FITeT)</strong>
          {data?.championship?.nome && ` • ${data.championship.nome}`}
          {data?.championship?.regione && ` (${data.championship.regione})`}
          <div>Progetto autonomo della community, dati sincronizzati da portale.fitet.org</div>
        </div>
      </footer>

      {/* Championship Picker Modal */}
      <ChampionshipModal
        isOpen={isChampionshipModalOpen}
        currentCamId={camId || 0}
        campionati={campionati}
        isLoadingCampionati={loadingCampionati}
        onClose={() => setIsChampionshipModalOpen(false)}
        onSelectChampionship={handleSelectChampionship}
      />

      {/* Favorite Athletes Modal */}
      <FavoritesModal
        isOpen={isFavoritesModalOpen}
        onClose={() => setIsFavoritesModalOpen(false)}
        onSelectAthlete={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
        onGoToSearch={() => handleTabChange('cercaAtleta')}
      />

      {/* Athlete Detail Profile Modal */}
      {athleteStack.map((a, index) => (
        <AtletaModal
          key={a.key}
          atletaId={a.id}
          athleteName={a.name}
          camId={camId !== null ? String(camId) : undefined}
          campionatoNome={data?.championship?.nome}
          returnLabel={a.fromReferto ? 'Torna al referto' : 'Indietro'}
          isTopModal={index === athleteStack.length - 1}
          onClose={closeTopAthlete}
          onSelectAthlete={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
        />
      ))}

      {/* Team Details & Athletes Modal */}
      {selectedSquadra && (
        <SquadraModal
          squadraId={selectedSquadra.id}
          squadraNome={selectedSquadra.name}
          camId={camId ?? 0}
          annoId={annoId}
          onClose={() => setSelectedSquadra(null)}
          onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
          onFilterCalendario={(teamName) => {
            setSelectedTeamFilter(teamName);
            handleTabChange('calendario');
          }}
        />
      )}
    </div>
  );
};
