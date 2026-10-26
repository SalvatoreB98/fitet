import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { DashboardData, ChampionshipItem } from './types/fitet';
import { fetchDashboard, fetchCampionati } from './services/api';
import { Header, MainViewType, ChampionshipTabType } from './components/Header';
import { ClassificaTab } from './components/ClassificaTab';
import { CalendarioTab } from './components/CalendarioTab';
import { StatisticheTab } from './components/StatisticheTab';
import { AtletaModal } from './components/AtletaModal';
import { ChampionshipModal } from './components/ChampionshipModal';
import { SquadraModal } from './components/SquadraModal';
import { IntroMotionGraphic } from './components/IntroMotionGraphic';
import { HomeTab } from './components/HomeTab';
import { ClassificheRankingTab } from './components/ClassificheRankingTab';
import { BottomBar } from './components/BottomBar';
import { SearchAtletaModal } from './components/SearchAtletaModal';
import { FavoritesModal } from './components/FavoritesModal';
import { InstallAppModal } from './components/InstallAppModal';
import { PingPongLoader } from './components/PingPongLoader';
import { registerTeamLogos } from './utils/teamLogos';
import { addRecentAthlete, addRecentChampionship } from './utils/history';
import { VenueConnectionBanner } from './components/VenueConnectionBanner';
import { preCacheChampionshipForVenue } from './services/api';

const getAthleteFromUrl = (): { id: string; name: string } | null => {
  if (typeof window === 'undefined') return null;
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/(?:player|atleta)\/([^/?#]+)/i);
  if (match && match[1]) {
    const raw = decodeURIComponent(match[1]).trim();
    if (raw) return { id: raw, name: '' };
  }
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('player') || urlParams.get('atleta') || urlParams.get('atletaId');
  if (paramId && paramId.trim()) {
    return { id: paramId.trim(), name: '' };
  }
  return null;
};

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
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);

  // Motion Graphic Intro on first access only (bypassed if landing directly on athlete link)
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('intro') === '1') return true;
      const isPlayerPath = /^\/(?:player|atleta)\//i.test(window.location.pathname) || urlParams.has('player') || urlParams.has('atleta');
      if (isPlayerPath) return false;
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

  // Main 3-view navigation: 'home' | 'campionato' | 'classifiche'
  const [mainView, setMainView] = useState<MainViewType>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get('view');
      if (viewParam && ['home', 'campionato', 'classifiche'].includes(viewParam)) {
        return viewParam as MainViewType;
      }
      const tabParam = urlParams.get('tab');
      if (tabParam === 'classifiche') return 'classifiche';
      const camParam = urlParams.get('cam');
      if (camParam && ['classifica', 'calendario', 'statistiche'].includes(tabParam || '')) {
        return 'campionato';
      }
      const savedView = localStorage.getItem('fitet_main_view') as MainViewType | null;
      if (savedView && ['home', 'campionato', 'classifiche'].includes(savedView)) {
        return savedView;
      }
    }
    return 'home';
  });

  // Championship internal subtabs: 'classifica' | 'calendario' | 'statistiche'
  const [championshipTab, setChampionshipTab] = useState<ChampionshipTabType>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['classifica', 'calendario', 'statistiche'].includes(tabParam)) {
        return tabParam as ChampionshipTabType;
      }
    }
    return 'classifica';
  });

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null);

  // Athlete modal navigation stack synced with /player/:id URL
  const [athleteStack, setAthleteStack] = useState<Array<{ key: string; id: string; name: string; fromReferto?: boolean }>>(() => {
    const fromUrl = getAthleteFromUrl();
    if (fromUrl) {
      return [{ key: 'athlete-init', id: fromUrl.id, name: fromUrl.name }];
    }
    return [];
  });
  const athleteKeyCounter = useRef(0);

  const setSelectedAthlete = (a: { id: string; name: string; fromReferto?: boolean }) => {
    addRecentAthlete({ id: a.id, name: a.name });
    setAthleteStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.id === a.id && top.name === a.name) return prev;
      athleteKeyCounter.current += 1;
      return [...prev, { key: `athlete-${athleteKeyCounter.current}`, ...a }];
    });

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.pathname = `/player/${encodeURIComponent(a.id)}`;
      url.searchParams.delete('player');
      url.searchParams.delete('atleta');
      url.searchParams.delete('atletaId');
      window.history.pushState(
        { ...(window.history.state || {}), athleteId: a.id, athleteName: a.name },
        '',
        url.toString()
      );
    }
  };

  const closeTopAthlete = () => {
    if (typeof window !== 'undefined' && window.history.state?.athleteId) {
      window.history.back();
      return;
    }

    setAthleteStack((prev) => {
      const nextStack = prev.slice(0, -1);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const nextTop = nextStack[nextStack.length - 1];
        if (nextTop) {
          url.pathname = `/player/${encodeURIComponent(nextTop.id)}`;
          window.history.replaceState({ ...(window.history.state || {}), athleteId: nextTop.id }, '', url.toString());
        } else {
          url.pathname = '/';
          url.searchParams.delete('player');
          url.searchParams.delete('atleta');
          url.searchParams.delete('atletaId');
          window.history.replaceState({ ...(window.history.state || {}), athleteId: null }, '', url.toString());
        }
      }
      return nextStack;
    });
  };

  const handleResolveAthlete = (resolvedId: string, resolvedName: string) => {
    addRecentAthlete({ id: resolvedId, name: resolvedName });
    setAthleteStack((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const lastIdx = copy.length - 1;
      copy[lastIdx] = { ...copy[lastIdx], id: resolvedId, name: resolvedName };
      return copy;
    });

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.pathname = `/player/${encodeURIComponent(resolvedId)}`;
      url.searchParams.delete('player');
      url.searchParams.delete('atleta');
      url.searchParams.delete('atletaId');
      window.history.replaceState(
        { ...(window.history.state || {}), athleteId: resolvedId, athleteName: resolvedName },
        '',
        url.toString()
      );
    }
  };

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
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
      // Se stiamo caricando un campionato diverso da quello attualmente nei dati, azzera i dati vecchi per mostrare subito il loader
      if (data && data.championship?.id !== targetCam) {
        setData(null);
      }
    }
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

  // Weak Venue Connection: ascolta richieste di retry manuali o riconnessione
  useEffect(() => {
    const handleVenueRetry = () => {
      if (camId) {
        loadDashboard(camId, annoId, true);
      }
    };
    window.addEventListener('fitet-venue-retry', handleVenueRetry);
    window.addEventListener('fitet-connection-restored', handleVenueRetry);
    return () => {
      window.removeEventListener('fitet-venue-retry', handleVenueRetry);
      window.removeEventListener('fitet-connection-restored', handleVenueRetry);
    };
  }, [camId, annoId]);

  // Pre-caching del campionato per consultazione offline in palestra
  const [isPrecaching, setIsPrecaching] = useState<boolean>(false);
  const [precacheStatus, setPrecacheStatus] = useState<string | null>(null);

  const handlePrecache = async () => {
    if (!camId || isPrecaching) return;
    setIsPrecaching(true);
    try {
      await preCacheChampionshipForVenue(camId, annoId, (step) => {
        setPrecacheStatus(step);
      });
      setTimeout(() => {
        setIsPrecaching(false);
        setPrecacheStatus('Campionato salvato per la palestra! Pronto offline.');
        setTimeout(() => setPrecacheStatus(null), 3000);
      }, 600);
    } catch {
      setIsPrecaching(false);
      setPrecacheStatus('Errore durante il salvataggio');
      setTimeout(() => setPrecacheStatus(null), 3000);
    }
  };

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

  // Se viene impostato "Il mio profilo" senza un campionato attivo,
  // allinea la Home al campionato dell'atleta senza cambiare vista.
  const handleAutoSelectProfileChampionship = (newCam: number) => {
    if (camId !== null || !newCam) return;
    const match = campionati.find((c) => c.id === newCam);
    setCamId(newCam);
    if (match?.anno) setAnnoId(match.anno);
  };

  const handleSelectChampionship = (newCam: number, newAnno = 41) => {
    setSelectedTeamFilter(null);
    if (newCam !== camId || !data) {
      setData(null);
      setLoading(true);
    }
    setCamId(newCam);
    setAnnoId(newAnno);
    setMainView('campionato');
    localStorage.setItem('fitet_main_view', 'campionato');

    const match = campionati.find((c) => c.id === newCam);
    if (match) {
      addRecentChampionship({
        id: match.id,
        nome: match.nome,
        regione: match.regione,
        categoria: match.categoria,
        anno: match.anno || newAnno,
      });
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('cam', String(newCam));
      url.searchParams.set('view', 'campionato');
      url.searchParams.set('tab', championshipTab);
      window.history.pushState({ ...(window.history.state || {}), cam: newCam, view: 'campionato' }, '', url.toString());
    }
  };

  const scrollToNav = () => {
    const nav = document.querySelector('.portal-nav');
    if (nav) {
      const rect = nav.getBoundingClientRect();
      if (rect.top < 0) {
        window.scrollTo({ top: window.scrollY + rect.top, behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMainViewChange = (view: MainViewType) => {
    setMainView(view);
    localStorage.setItem('fitet_main_view', view);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (view === 'home') {
        url.searchParams.delete('view');
        url.searchParams.delete('tab');
      } else if (view === 'classifiche') {
        url.searchParams.set('view', 'classifiche');
        url.searchParams.delete('tab');
      } else if (view === 'campionato') {
        url.searchParams.set('view', 'campionato');
        url.searchParams.set('tab', championshipTab);
      }
      window.history.pushState({ ...(window.history.state || {}), view }, '', url.toString());
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChampionshipTabChange = (tab: ChampionshipTabType) => {
    setChampionshipTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'campionato');
      url.searchParams.set('tab', tab);
      window.history.pushState({ ...(window.history.state || {}), view: 'campionato', tab }, '', url.toString());
    }
    scrollToNav();
  };

  // Browser back / forward popstate handler
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get('view');
      const tabParam = urlParams.get('tab');

      if (viewParam === 'classifiche') {
        setMainView('classifiche');
      } else if (viewParam === 'campionato' || (urlParams.get('cam') && tabParam && ['classifica', 'calendario', 'statistiche'].includes(tabParam))) {
        setMainView('campionato');
        if (tabParam && ['classifica', 'calendario', 'statistiche'].includes(tabParam)) {
          setChampionshipTab(tabParam as ChampionshipTabType);
        }
      } else {
        setMainView('home');
      }

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

      // Sync athlete modal stack with URL
      const routePlayer = getAthleteFromUrl();
      if (routePlayer) {
        setAthleteStack((prev) => {
          const top = prev[prev.length - 1];
          if (top && top.id === routePlayer.id) return prev;
          const existingIdx = prev.findIndex((item) => item.id === routePlayer.id);
          if (existingIdx !== -1) {
            return prev.slice(0, existingIdx + 1);
          }
          athleteKeyCounter.current += 1;
          return [...prev, { key: `athlete-${athleteKeyCounter.current}`, id: routePlayer.id, name: '' }];
        });
      } else {
        setAthleteStack((prev) => (prev.length > 0 ? [] : prev));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const activeChampionshipInfo = campionati.find((c) => c.id === camId) || null;
  const headerChampionshipName =
    data && data.championship?.id === camId
      ? data.championship.nome
      : activeChampionshipInfo?.nome || (camId ? `Campionato #${camId}` : undefined);
  const headerChampionshipRegion =
    data && data.championship?.id === camId
      ? data.championship.regione
      : activeChampionshipInfo?.regione || undefined;

  return (
    <div className="portal-container">
      {/* Motion Graphic Intro (first access only) */}
      {showIntro && <IntroMotionGraphic onComplete={handleIntroComplete} />}

      {/* Top Header */}
      <Header
        mainView={mainView}
        onChangeMainView={handleMainViewChange}
        lastUpdated={data?.lastUpdated || null}
        isRefreshing={refreshing}
        onRefresh={() => camId && loadDashboard(camId, annoId, true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        activeTab={championshipTab}
        onChangeTab={handleChampionshipTabChange}
        counts={{
          classifica: (data && data.championship?.id === camId) ? data.classifica.length : 0,
          calendario: (data && data.championship?.id === camId) ? data.calendario.length : 0,
          statistiche: (data && data.championship?.id === camId) ? data.statisticheAtleti.length : 0,
        }}
        onSelectAthleteById={(id, name) => setSelectedAthlete({ id, name })}
        championshipName={headerChampionshipName}
        championshipRegion={headerChampionshipRegion}
        onOpenChampionshipModal={() => setIsChampionshipModalOpen(true)}
        onOpenFavoritesModal={() => setIsFavoritesModalOpen(true)}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        onOpenInstallAppModal={() => setIsInstallModalOpen(true)}
        onPrecacheChampionship={camId ? handlePrecache : undefined}
      />

      {/* Weak Venue Connection Banner (Indicatore e fallback automatico per palestre con segnale debole/assente) */}
      <VenueConnectionBanner
        onRefresh={() => camId && loadDashboard(camId, annoId, true)}
        currentChampionshipName={headerChampionshipName}
        onOpenPrecache={camId ? handlePrecache : undefined}
      />

      {/* Error Alert */}
      {error && mainView === 'campionato' && (
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
      <main className={`portal-main ${mainView !== 'campionato' ? 'without-portal-nav' : ''}`}>
        {/* VIEW 1: Home Dashboard */}
        <div
          className={`tab-pane ${mainView === 'home' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-home"
          style={{ display: mainView === 'home' ? 'block' : 'none' }}
        >
          <HomeTab
            currentCamId={camId}
            annoId={annoId}
            currentChampionship={data?.championship}
            campionati={campionati}
            isLoadingCampionati={loadingCampionati}
            onSelectChampionship={handleSelectChampionship}
            onAutoSelectProfileChampionship={handleAutoSelectProfileChampionship}
            onNavigateTab={(tab) => {
              if (tab === 'cercaAtleta') {
                setIsSearchModalOpen(true);
              } else if (['classifica', 'calendario', 'statistiche'].includes(tab)) {
                setMainView('campionato');
                setChampionshipTab(tab as ChampionshipTabType);
              }
            }}
            onOpenChampionshipModal={() => setIsChampionshipModalOpen(true)}
            onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
            dashboardData={data}
          />
        </div>

        {/* VIEW 2: Classifiche FITeT (Nazionali e Regionali) */}
        <div
          className={`tab-pane ${mainView === 'classifiche' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-classifiche"
          style={{ display: mainView === 'classifiche' ? 'block' : 'none' }}
        >
          <ClassificheRankingTab
            onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
            onOpenSearchModal={() => setIsSearchModalOpen(true)}
          />
        </div>

        {/* VIEW 3: Campionato (Classifica, Calendario, Statistiche) */}
        <div
          className={`tab-pane ${mainView === 'campionato' ? 'active' : ''}`}
          role="tabpanel"
          id="tabpanel-campionato"
          style={{ display: mainView === 'campionato' ? 'block' : 'none' }}
        >
          {/* Se un campionato è selezionato ma i dati stanno caricando o appartengono al vecchio campionato, mostra il PingPongLoader con le palline */}
          {camId && (loading || !data || (data.championship && data.championship.id !== camId)) ? (
            <PingPongLoader
              targetChampionship={activeChampionshipInfo}
              camId={camId}
            />
          ) : !camId ? (
            <div className="no-championship-screen">
              <div className="no-championship-icon-badge">
                <i className="bi bi-trophy-fill"></i>
              </div>
              <h2 className="no-championship-title">
                Nessun Campionato Selezionato
              </h2>
              <p className="no-championship-desc">
                Scegli il campionato FITeT da consultare per visualizzare la classifica squadre, calendario e statistiche.
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
          ) : data ? (
            <>
              {/* SubTab: Classifica */}
              <div
                className={`tab-pane ${championshipTab === 'classifica' ? 'active' : ''}`}
                role="tabpanel"
                id="tabpanel-classifica"
                style={{ display: championshipTab === 'classifica' ? 'block' : 'none' }}
              >
                <ClassificaTab
                  classifica={data.classifica}
                  onSelectTeam={handleOpenSquadra}
                />
              </div>

              {/* SubTab: Calendario */}
              <div
                className={`tab-pane ${championshipTab === 'calendario' ? 'active' : ''}`}
                role="tabpanel"
                id="tabpanel-calendario"
                style={{ display: championshipTab === 'calendario' ? 'block' : 'none' }}
              >
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
              </div>

              {/* SubTab: Statistiche */}
              <div
                className={`tab-pane ${championshipTab === 'statistiche' ? 'active' : ''}`}
                role="tabpanel"
                id="tabpanel-statistiche"
                style={{ display: championshipTab === 'statistiche' ? 'block' : 'none' }}
              >
                <StatisticheTab
                  statistiche={data.statisticheAtleti}
                  onOpenAtletaModal={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
                />
              </div>
            </>
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="portal-footer mt-5 text-center" style={{ paddingBottom: '90px' }}>
        <div>
          <strong>Federazione Italiana Tennistavolo (FITeT)</strong>
          {data?.championship?.nome && ` • ${data.championship.nome}`}
          {data?.championship?.regione && ` (${data.championship.regione})`}
          <div>Progetto non ufficiale della community, dati sincronizzati da portale.fitet.org</div>
        </div>
      </footer>

      {/* Fixed Rounded Bottom Bar */}
      <BottomBar
        activeView={mainView}
        onChangeView={handleMainViewChange}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
      />

      {/* Global Search Athlete Modal */}
      <SearchAtletaModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectAthlete={(id, name) => setSelectedAthlete({ id, name, fromReferto: false })}
      />

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
        onGoToSearch={() => setIsSearchModalOpen(true)}
      />

      {/* Install PWA Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Athlete Detail Profile Modal Stack */}
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
          onResolveAthlete={handleResolveAthlete}
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
            setMainView('campionato');
            setChampionshipTab('calendario');
          }}
        />
      )}
      {/* Toast progresso salvataggio per la palestra */}
      {precacheStatus && (
        <div className="atleta-share-toast" style={{ bottom: '85px', zIndex: 10050 }} role="status">
          <i className="bi bi-cloud-arrow-down-fill text-info me-2"></i>
          <span>{precacheStatus}</span>
        </div>
      )}
    </div>
  );
};
