import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  TorneiResponse,
  TorneoItem,
  TorneoDettaglioResponse,
  TorneoGaraLink,
  TorneoGaraDettaglioResponse,
} from '../types/fitet';
import {
  getTorneoCategoryByKey,
  getTorneiCategoriesByGroup,
} from '../constants/torneiCategories';
import { REGIONS_COMIT } from '../constants/regions';
import {
  fetchTornei,
  fetchTorneoDettaglio,
  fetchTorneoGara,
  fetchIscrittiCurrentPoints,
} from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import { TorneoBracket, BracketRoundData } from './TorneoBracket';
import {
  EMPTY_MAP_SELECTION,
  TorneiItalyMap,
  TorneiMapSelection,
} from './TorneiItalyMap';
import {
  getMyPlayerId,
  getMyPlayerName,
  subscribeToMyProfile,
  setMyPlayer,
} from '../utils/myProfile';
import { fetchAtleta, searchAtleti } from '../services/api';
import {
  DettaglioAtleta,
  PartitaRankingTorneo,
  AthleteSearchResult,
} from '../types/fitet';
import {
  getCanonicalRegionName,
  getTorneoHostRegion,
  getTorneoPlace,
  regionMatches,
  parseLuogo,
  normalizeCityName,
  normalizeText,
} from '../utils/torneoMap';
import {
  ITALY_CITY_TO_REGION,
  ITALY_PROVINCE_TO_REGION,
} from '../data/italyGeo';
import './ClassificheRankingTab.css';
import './TorneiTab.css';
import { useSlideDirection } from '../utils/useSlideDirection';

type TorneiPortalView = 'mappa' | 'risultati' | 'programma' | 'miei';
type GaraPhase = 'tabellone' | 'gironi' | 'iscritti';

export interface MyTorneoGroupItem {
  key: string;
  torneoName: string;
  data: string;
  luogo: string;
  regione: string;
  status: 'disputato';
  partite: PartitaRankingTorneo[];
  vittorie: number;
  sconfitte: number;
  gare: string[];
  matchedTorneo?: TorneoItem;
}

interface TorneiListGroup {
  region: string;
  items: Array<{ torneo: TorneoItem; sectionTitle: string }>;
}

interface AvailablePhase {
  key: GaraPhase;
  title: string;
  description: string;
}

export interface TorneiTabProps {
  onOpenAtletaModal: (atletaId: string, nome: string) => void;
  portalView?: TorneiPortalView;
  onPortalViewChange?: (view: TorneiPortalView) => void;
  onUpdateCounts?: (counts: { miei: number; mappa: number; risultati: number; programma: number }) => void;
}

const isCloseTournamentDate = (d1?: string, d2?: string): boolean => {
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const p1 = d1.split('/');
  const p2 = d2.split('/');
  if (p1.length === 3 && p2.length === 3) {
    const dt1 = new Date(Number(p1[2]), Number(p1[1]) - 1, Number(p1[0])).getTime();
    const dt2 = new Date(Number(p2[2]), Number(p2[1]) - 1, Number(p2[0])).getTime();
    return Math.abs(dt1 - dt2) <= 2 * 24 * 60 * 60 * 1000;
  }
  return false;
};

export const TorneiTab: React.FC<TorneiTabProps> = ({
  onOpenAtletaModal,
  portalView: propsPortalView,
  onPortalViewChange,
  onUpdateCounts,
}) => {
  const [categoryKey, setCategoryKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const cat = new URLSearchParams(window.location.search).get('tcat');
      if (cat) return cat;
    }
    return 'all';
  });

  const [comitId, setComitId] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const c = new URLSearchParams(window.location.search).get('tcomit');
      if (c && /^\d+$/.test(c)) return parseInt(c, 10);
    }
    return 0;
  });

  const [regFilterId, setRegFilterId] = useState<number>(0);
  const [internalPortalView, setInternalPortalView] = useState<TorneiPortalView>(() => {
    const hasPlayer = Boolean(getMyPlayerId());
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get('tab') || p.get('ttab');
      if (tab === 'miei' && hasPlayer) return 'miei';
      if (tab === 'mappa' || tab === 'risultati' || tab === 'programma') {
        return tab;
      }
    }
    return hasPlayer ? 'miei' : 'mappa';
  });

  const portalView = propsPortalView !== undefined ? propsPortalView : internalPortalView;
  const torneiSlide = useSlideDirection<TorneiPortalView>(portalView, ['miei', 'mappa', 'risultati', 'programma']);
  const setPortalView = (view: TorneiPortalView | ((prev: TorneiPortalView) => TorneiPortalView)) => {
    const next = typeof view === 'function' ? view(portalView) : view;
    setInternalPortalView(next);
    onPortalViewChange?.(next);
  };
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapSelection, setMapSelection] = useState<TorneiMapSelection>(EMPTY_MAP_SELECTION);
  const torneiListRef = useRef<HTMLDivElement | null>(null);
  const torneiRootRef = useRef<HTMLDivElement | null>(null);

  const [data, setData] = useState<TorneiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Tournament Detail State
  const [selectedTorneo, setSelectedTorneo] = useState<TorneoItem | null>(null);
  const [torneoDettaglio, setTorneoDettaglio] = useState<TorneoDettaglioResponse | null>(null);
  const [loadingDettaglio, setLoadingDettaglio] = useState<boolean>(false);
  const [dettaglioError, setDettaglioError] = useState<string | null>(null);

  // Selected Gara inside Tournament
  const [selectedGara, setSelectedGara] = useState<TorneoGaraLink | null>(null);
  const [garaData, setGaraData] = useState<TorneoGaraDettaglioResponse | null>(null);
  const [loadingGara, setLoadingGara] = useState<boolean>(false);
  const [garaPhaseTab, setGaraPhaseTab] = useState<GaraPhase | null>(null);
  const [garaSearchQuery, setGaraSearchQuery] = useState<string>('');
  const [iscrittiSortField, setIscrittiSortField] = useState<'puntiIscrizione' | 'puntiClassificaAttuale' | 'posizione'>('puntiIscrizione');
  const [iscrittiSortDir, setIscrittiSortDir] = useState<'desc' | 'asc'>('desc');
  const [loadingCurrentPoints, setLoadingCurrentPoints] = useState<boolean>(false);
  const [bracketViewMode, setBracketViewMode] = useState<'bracket' | 'cards'>('bracket');
  const [bracketLoading, setBracketLoading] = useState<boolean>(false);
  const [fullBracketCache, setFullBracketCache] = useState<{ [garaKey: string]: BracketRoundData[] }>({});
  const [isModalFullscreen, setIsModalFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFullscreenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ isFullscreen?: boolean }>;
      if (typeof customEvent.detail?.isFullscreen === 'boolean') {
        setIsModalFullscreen(customEvent.detail.isFullscreen);
      }
    };
    window.addEventListener('tornei-modal-fullscreen', handleFullscreenEvent);
    return () => window.removeEventListener('tornei-modal-fullscreen', handleFullscreenEvent);
  }, []);

  // My Player Tornei State
  const [myPlayerId, setMyPlayerId] = useState<string | null>(() => getMyPlayerId());
  const [myPlayerName, setMyPlayerName] = useState<string>(() => getMyPlayerName() || '');
  const [myAthleteDetail, setMyAthleteDetail] = useState<DettaglioAtleta | null>(null);
  const [myTorneiLoading, setMyTorneiLoading] = useState<boolean>(false);
  const [myTorneiError, setMyTorneiError] = useState<string | null>(null);
  const [myMapSelection, setMyMapSelection] = useState<TorneiMapSelection>(EMPTY_MAP_SELECTION);
  const [expandedMyTorneoKeys, setExpandedMyTorneoKeys] = useState<Set<string>>(new Set());
  const [expandedGironeKeys, setExpandedGironeKeys] = useState<Set<number>>(new Set());

  const toggleGironeMatches = (girNumero: number) => {
    setExpandedGironeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(girNumero)) next.delete(girNumero);
      else next.add(girNumero);
      return next;
    });
  };

  const toggleAllGironiMatches = () => {
    if (!garaData?.gironi) return;
    if (expandedGironeKeys.size > 0) {
      setExpandedGironeKeys(new Set());
    } else {
      setExpandedGironeKeys(new Set(garaData.gironi.map((g) => g.numero)));
    }
  };
  const [isChangingAthlete, setIsChangingAthlete] = useState<boolean>(false);
  const [athleteSearchQuery, setAthleteSearchQuery] = useState<string>('');
  const [athleteSearchResults, setAthleteSearchResults] = useState<AthleteSearchResult[]>([]);
  const [athleteSearchLoading, setAthleteSearchLoading] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToMyProfile(() => {
      const pid = getMyPlayerId();
      setMyPlayerId(pid);
      setMyPlayerName(getMyPlayerName() || '');
      if (!pid) {
        setPortalView((prev) => (prev === 'miei' ? 'mappa' : prev));
      }
    });
    return unsub;
  }, []);

  const loadMyAthlete = useCallback(async (playerId: string) => {
    setMyTorneiLoading(true);
    setMyTorneiError(null);
    try {
      const detail = await fetchAtleta(playerId);
      setMyAthleteDetail(detail);
      if (detail.anagrafica?.nome) {
        setMyPlayerName(detail.anagrafica.nome);
      }
    } catch (err: any) {
      setMyTorneiError(err?.message || 'Impossibile caricare i tornei del giocatore');
    } finally {
      setMyTorneiLoading(false);
    }
  }, []);

  const allKnownTornei: TorneoItem[] = useMemo(() => {
    if (!data?.sections) return [];
    const list: TorneoItem[] = [];
    for (const sec of data.sections) {
      list.push(...sec.tornei);
    }
    return list;
  }, [data]);

  const [loadingTorneoKey, setLoadingTorneoKey] = useState<string | null>(null);

  /**
   * Apre la modale di dettaglio del torneo (modal-torneo-detail-card)
   * caricando il torneo e la relativa gara dal portale FITeT:
   * /api/tornei/gara?idt=...&com=...&gara=...&anno=...&isDoppio=false&mode=risultati
   */
  const goToTorneo = async (
    item?: MyTorneoGroupItem,
    specificGaraName?: string,
    preferredPhase?: GaraPhase
  ) => {
    const targetItem = item || visibleMyTornei[0];
    const key = targetItem ? targetItem.key : 'default';
    setLoadingTorneoKey(key);

    try {
      // 1. Risolvi il torneo da associare
      let torneo: TorneoItem | undefined = targetItem?.matchedTorneo;

      if (!torneo && targetItem) {
        // Cerca nei tornei noti con matching per data vicina / luogo / comitato
        const athleteDate = targetItem.data;
        const athleteName = targetItem.torneoName.toLowerCase();

        torneo = allKnownTornei.find((t) => {
          if (!isCloseTournamentDate(t.data, athleteDate)) return false;
          if (t.luogo && athleteName.includes(t.luogo.toLowerCase())) return true;
          if (t.regione && athleteName.includes(t.regione.toLowerCase())) return true;
          if (t.com > 0) {
            const regObj = REGIONS_COMIT.find((r) => r.id === t.com);
            if (regObj && athleteName.includes(regObj.name.toLowerCase())) return true;
          }
          return false;
        });

        if (!torneo) {
          // Identifica eventuale regione nel titolo del torneo (es. Calabria -> com 19)
          let detectedCom = 0;
          for (const reg of REGIONS_COMIT) {
            if (reg.id > 0 && athleteName.includes(reg.name.toLowerCase())) {
              detectedCom = reg.id;
              break;
            }
          }
          if (detectedCom === 19 || athleteName.includes('calabria')) {
            detectedCom = 19;
          }

          torneo = {
            idt: detectedCom === 19 ? 2 : 1,
            com: detectedCom || 19,
            anno: 41,
            tipo: 0,
            data: targetItem.data || '19/09/2026',
            luogo: targetItem.luogo || (detectedCom === 19 ? 'Spezzano Albanese (CS)' : 'Italia'),
            regione: targetItem.regione || (detectedCom === 19 ? 'Calabria' : 'Nazionale'),
            status: 'disputato',
            href: `https://portale.fitet.org/risultati/tornei/visualizza_risultati.php?IDT=${detectedCom === 19 ? 2 : 1}&ANNO=41&COM=${detectedCom || 19}`,
          };
        }
      }

      // Fallback se non è stato possibile identificare alcun torneo
      if (!torneo) {
        torneo = {
          idt: 2,
          com: 19,
          anno: 41,
          tipo: 0,
          data: '19/09/2026',
          luogo: 'Spezzano Albanese (CS)',
          regione: 'Calabria',
          status: 'disputato',
          href: 'https://portale.fitet.org/risultati/tornei/visualizza_risultati.php?IDT=2&ANNO=41&COM=19',
        };
      }

      // 2. Prepara lo stato della modale (apre la modal-torneo-detail-card)
      setSelectedTorneo(torneo);
      setTorneoDettaglio(null);
      setDettaglioError(null);
      setSelectedGara(null);
      setGaraData(null);
      setGaraPhaseTab(null);
      setLoadingDettaglio(true);
      setGaraSearchQuery('');
      setBracketViewMode('bracket');
      scrollToRoot();

      // 3. Carica il dettaglio del torneo (elenco gare)
      const det = await fetchTorneoDettaglio(torneo.idt, torneo.com, torneo.anno);
      setTorneoDettaglio(det);

      // 4. Cerca la gara disputata (es. 'Singolo M/F Open7 5001 seg. M | 351 seg. F' -> garaId '1025')
      const targetGaraName = (
        specificGaraName ||
        targetItem?.gare[0] ||
        targetItem?.partite[0]?.gara ||
        ''
      ).toLowerCase().trim();

      let matchedGara: TorneoGaraLink | undefined;

      if (det.gare && det.gare.length > 0) {
        if (targetGaraName) {
          matchedGara = det.gare.find((g) => {
            const gName = g.nome.toLowerCase().trim();
            if (gName === targetGaraName || gName.includes(targetGaraName) || targetGaraName.includes(gName)) {
              return true;
            }
            if (targetGaraName.includes('open7') && gName.includes('open7')) return true;
            if (targetGaraName.includes('5001') && gName.includes('5001')) return true;
            return false;
          });
        }

        // Se non troviamo match per nome, ma è disponibile la gara 1025 indicata
        if (!matchedGara && det.gare.some((g) => g.garaId === '1025')) {
          matchedGara = det.gare.find((g) => g.garaId === '1025');
        }

        // Fallback sulla prima gara del torneo se nessun match specifico
        if (!matchedGara) {
          matchedGara = det.gare[0];
        }
      }

      // 5. Se trovata la gara, chiama l'API /api/tornei/gara e apre la schermata della gara
      if (matchedGara) {
        setSelectedGara(matchedGara);
        setLoadingGara(true);
        try {
          const resGara = await fetchTorneoGara({
            idt: matchedGara.idt,
            com: matchedGara.com,
            gara: matchedGara.garaId,
            anno: matchedGara.anno,
            isDoppio: matchedGara.isDoppio,
            mode: matchedGara.mode || 'risultati',
          });
          setGaraData(resGara);

          // Se specificata una fase preferita o se l'atleta ha giocato una fase rilevabile
          // const targetPhase = preferredPhase || (
          //   targetItem?.partite.some((p) => p.fase === 'TAB') ? 'tabellone' :
          //   targetItem?.partite.some((p) => p.fase === 'GIR') ? 'gironi' : undefined
          // );

          // if (targetPhase === 'tabellone' && resGara.turniTabellone && resGara.turniTabellone.length > 0) {
          //   setGaraPhaseTab('tabellone');
          // } else if (targetPhase === 'gironi' && resGara.gironiRanges && resGara.gironiRanges.length > 0) {
          //   setGaraPhaseTab('gironi');
          // }
        } catch (errGara: any) {
          console.error('Errore durante il caricamento della gara:', errGara);
        } finally {
          setLoadingGara(false);
        }
      }
    } catch (err: any) {
      setDettaglioError(err?.message || 'Impossibile aprire il torneo in questo momento.');
    } finally {
      setLoadingDettaglio(false);
      setLoadingTorneoKey(null);
    }
  };

  useEffect(() => {
    if (!myPlayerId) {
      setMyAthleteDetail(null);
      setMyTorneiLoading(false);
      return;
    }
    loadMyAthlete(myPlayerId);
  }, [myPlayerId, loadMyAthlete]);

  useEffect(() => {
    const q = athleteSearchQuery.trim();
    if (q.length < 2) {
      setAthleteSearchResults([]);
      setAthleteSearchLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setAthleteSearchLoading(true);
      try {
        const res = await searchAtleti(q);
        if (active) setAthleteSearchResults(res.slice(0, 15));
      } catch {
        if (active) setAthleteSearchResults([]);
      } finally {
        if (active) setAthleteSearchLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [athleteSearchQuery]);

  const handleSelectAthlete = (item: AthleteSearchResult) => {
    const name = item.value || item.label || '';
    setMyPlayer(item.id, name);
    setMyPlayerId(item.id);
    setMyPlayerName(name);
    setIsChangingAthlete(false);
    setAthleteSearchQuery('');
    setAthleteSearchResults([]);
  };

  const toggleTorneoExpanded = (key: string) => {
    setExpandedMyTorneoKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeCategoryDef = getTorneoCategoryByKey(categoryKey);

  const statusFilter: 'all' | 'disputato' | 'in_programma' =
    portalView === 'mappa' ? 'all' : portalView === 'risultati' ? 'disputato' : 'in_programma';

  const scrollToRoot = () => {
    window.scrollTo(0, 0);
  };

  const loadTornei = async (
    targetCat = categoryKey,
    targetComit = comitId,
    targetReg = regFilterId,
    force = false
  ) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchTornei(targetCat, targetComit, targetReg, force);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento dei tornei FITeT.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTornei(categoryKey, comitId, regFilterId);
  }, [categoryKey, comitId, regFilterId]);

  const handleCategoryChange = (newKey: string) => {
    setSelectedTorneo(null);
    setMapSelection(EMPTY_MAP_SELECTION);
    const cat = getTorneoCategoryByKey(newKey);
    if ((newKey === 'reg_all' || cat?.group === 'regionali') && comitId === 0) {
      setComitId(4);
    }
    if (cat && cat.group !== 'regionali' && cat.group !== 'open') {
      setComitId(0);
      setRegFilterId(0);
    }
    setCategoryKey(newKey);
  };

  const handleRegionChange = (newComit: number) => {
    setSelectedTorneo(null);
    setComitId(newComit);
    setRegFilterId(newComit);

    if (newComit > 0) {
      const regName = REGIONS_COMIT.find((r) => r.id === newComit)?.name;
      if (regName) {
        setMapSelection({ region: regName, placeKey: null, label: regName });
      } else {
        setMapSelection(EMPTY_MAP_SELECTION);
      }
    } else {
      setMapSelection(EMPTY_MAP_SELECTION);
    }

    if (newComit > 0 && categoryKey !== 'open' && !categoryKey.startsWith('reg_') && categoryKey !== 'all') {
      setCategoryKey('reg_all');
    } else if (newComit === 0 && categoryKey.startsWith('reg_')) {
      setCategoryKey('all');
    }
  };

  const handleMapSelectionChange = (newSelection: TorneiMapSelection) => {
    setMapSelection(newSelection);

    if (newSelection.region) {
      const matchedComit = REGIONS_COMIT.find((r) =>
        regionMatches(r.name, newSelection.region)
      );
      if (matchedComit && matchedComit.id > 0 && matchedComit.id !== comitId) {
        setSelectedTorneo(null);
        setComitId(matchedComit.id);
        setRegFilterId(matchedComit.id);
      }
    } else {
      if (comitId !== 0) {
        setSelectedTorneo(null);
        setComitId(0);
        setRegFilterId(0);
      }
    }
  };

  const centerTab = (_tab: TorneiPortalView, _targetBtn?: HTMLElement | null) => { };

  const handlePortalViewChange = (view: TorneiPortalView, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (view === portalView) return;
    setPortalView(view);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'tornei');
      url.searchParams.set('tab', view);
      window.history.pushState({ ...(window.history.state || {}), view: 'tornei', tab: view }, '', url.toString());
    }

    centerTab(view, e?.currentTarget);
    scrollToRoot();
  };

  useEffect(() => {
    centerTab(portalView);
  }, [portalView]);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const p = new URLSearchParams(window.location.search);
      const v = p.get('view');
      if (v === 'tornei' || !v) {
        const tab = p.get('tab') || p.get('ttab');
        if (tab === 'miei' && getMyPlayerId()) {
          setPortalView('miei');
          centerTab('miei');
        } else if (tab === 'mappa' || tab === 'risultati' || tab === 'programma') {
          setPortalView(tab);
          centerTab(tab);
        } else if (tab === 'miei' && !getMyPlayerId()) {
          setPortalView('mappa');
          centerTab('mappa');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('view') === 'tornei') {
        if (categoryKey && categoryKey !== 'all') {
          url.searchParams.set('tcat', categoryKey);
        } else {
          url.searchParams.delete('tcat');
        }
        if (comitId > 0) {
          url.searchParams.set('tcomit', String(comitId));
        } else {
          url.searchParams.delete('tcomit');
        }
        window.history.replaceState({ ...(window.history.state || {}) }, '', url.toString());
      }
    }
  }, [categoryKey, comitId]);

  const handleShowList = () => {
    torneiListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetAllFilters = () => {
    setCategoryKey('all');
    setComitId(0);
    setRegFilterId(0);
    setSearchQuery('');
    setMapSelection(EMPTY_MAP_SELECTION);
  };

  // Sections filtered only by the text search (used for portal counters)
  const searchFilteredSections = useMemo(() => {
    if (!data?.sections) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data.sections;

    return data.sections
      .map((sec) => {
        const filtered = sec.tornei.filter(
          (t) =>
            t.luogo.toLowerCase().includes(q) ||
            t.data.toLowerCase().includes(q) ||
            (t.regione && t.regione.toLowerCase().includes(q)) ||
            sec.title.toLowerCase().includes(q)
        );
        return { ...sec, tornei: filtered };
      })
      .filter((sec) => sec.tornei.length > 0);
  }, [data, searchQuery]);

  // Sections filtered by the active portal view (status) and text search
  const filteredSections = useMemo(() => {
    if (statusFilter === 'all') return searchFilteredSections;

    return searchFilteredSections
      .map((sec) => ({
        ...sec,
        tornei: sec.tornei.filter((t) => t.status === statusFilter),
      }))
      .filter((sec) => sec.tornei.length > 0);
  }, [searchFilteredSections, statusFilter]);

  const myTornei: MyTorneoGroupItem[] = useMemo(() => {
    const torneiList = myAthleteDetail?.partiteRanking?.tornei;
    if (!torneiList || torneiList.length === 0) return [];

    // allKnownTornei is available from component scope

    const groups = new Map<
      string,
      {
        torneoName: string;
        data: string;
        partite: PartitaRankingTorneo[];
      }
    >();

    for (const m of torneiList) {
      const groupKey = `${(m.data || '').trim()}___${(m.torneo || '').trim().toLowerCase()}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          torneoName: m.torneo || 'Torneo',
          data: m.data || '',
          partite: [],
        };
        groups.set(groupKey, group);
      }
      group.partite.push(m);
    }

    const result: MyTorneoGroupItem[] = [];

    groups.forEach((group, groupKey) => {
      const partite = group.partite;
      let vittorie = 0;
      let sconfitte = 0;
      const gareSet = new Set<string>();

      for (const p of partite) {
        if (p.isVittoria) vittorie += 1;
        else sconfitte += 1;
        if (p.gara) gareSet.add(p.gara);
      }

      const normTorneoName = group.torneoName.toLowerCase();
      let matchedTorneo = allKnownTornei.find((t) => {
        if (t.data && group.data && t.data === group.data) {
          const l = t.luogo.toLowerCase();
          if (l && normTorneoName.includes(l)) return true;
          if (t.categoriaLabel && normTorneoName.includes(t.categoriaLabel.toLowerCase())) return true;
        }
        return false;
      });

      if (!matchedTorneo) {
        matchedTorneo = allKnownTornei.find((t) => {
          const l = t.luogo.toLowerCase();
          return l && l.length > 3 && normTorneoName.includes(l);
        });
      }

      let luogo = '';
      let regione = '';

      if (matchedTorneo) {
        luogo = matchedTorneo.luogo;
        const host = getTorneoHostRegion(matchedTorneo);
        regione = host !== 'Nazionale' ? host : (matchedTorneo.regione || 'Nazionale');
      } else {
        const parts = group.torneoName.split(/[-–—]/);
        const lastPart = (parts.length > 1 ? parts[parts.length - 1] : group.torneoName).trim();
        const parsed = parseLuogo(lastPart);
        luogo = parsed.city || lastPart;

        if (parsed.provinceCode && ITALY_PROVINCE_TO_REGION[parsed.provinceCode]) {
          regione = ITALY_PROVINCE_TO_REGION[parsed.provinceCode];
        } else {
          const cityKey = normalizeCityName(parsed.city);
          if (cityKey && ITALY_CITY_TO_REGION[cityKey]) {
            regione = ITALY_CITY_TO_REGION[cityKey];
          } else {
            const normFull = normalizeText(group.torneoName);
            for (const [cName, regName] of Object.entries(ITALY_CITY_TO_REGION)) {
              if (cName.length >= 4 && normFull.includes(cName)) {
                regione = regName;
                if (!luogo || luogo === group.torneoName) {
                  luogo = cName.charAt(0).toUpperCase() + cName.slice(1);
                }
                break;
              }
            }
          }
        }

        if (!regione) {
          for (const reg of REGIONS_COMIT) {
            if (reg.id > 0 && normalizeText(group.torneoName).includes(normalizeText(reg.name))) {
              regione = reg.name;
              break;
            }
          }
        }

        if (!regione) {
          regione = 'Nazionale';
        }
      }

      result.push({
        key: groupKey,
        torneoName: group.torneoName,
        data: group.data,
        luogo: luogo || 'Italia',
        regione: getCanonicalRegionName(regione),
        status: 'disputato',
        partite,
        vittorie,
        sconfitte,
        gare: Array.from(gareSet),
        matchedTorneo,
      });
    });

    return result.sort((a, b) => {
      const parseDate = (d: string) => {
        const parts = d.split('/');
        if (parts.length === 3) {
          return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
        }
        return 0;
      };
      return parseDate(b.data) - parseDate(a.data);
    });
  }, [myAthleteDetail, data]);

  const myDistinctRegions = useMemo(() => {
    const set = new Set<string>();
    for (const t of myTornei) {
      if (t.regione && t.regione !== 'Nazionale') {
        set.add(t.regione);
      }
    }
    return Array.from(set);
  }, [myTornei]);

  const myFocusRegion = useMemo(() => {
    if (myDistinctRegions.length === 1) {
      return myDistinctRegions[0];
    }
    return null;
  }, [myDistinctRegions]);

  const myMapGroups = useMemo(() => {
    if (myTornei.length === 0) return [];

    const map = new Map<string, Array<{ torneo: TorneoItem; sectionTitle: string }>>();

    myTornei.forEach((item, index) => {
      const reg = item.regione || 'Nazionale';
      if (!map.has(reg)) {
        map.set(reg, []);
      }

      const syntheticTorneo: TorneoItem = item.matchedTorneo || {
        idt: index + 10000,
        anno: 41,
        com: 0,
        tipo: 0,
        data: item.data,
        luogo: item.luogo,
        regione: item.regione,
        status: 'disputato',
        href: '',
        categoriaKey: 'miei',
        categoriaLabel: item.torneoName,
      };

      map.get(reg)!.push({
        torneo: syntheticTorneo,
        sectionTitle: `${item.vittorie}V - ${item.sconfitte}S`,
      });
    });

    return Array.from(map.entries()).map(([region, items]) => ({
      region,
      items,
    }));
  }, [myTornei]);

  const visibleMyTornei = useMemo(() => {
    if (!myMapSelection.region && !myMapSelection.placeKey) return myTornei;

    return myTornei.filter((item) => {
      if (myMapSelection.region && !regionMatches(item.regione, myMapSelection.region)) {
        return false;
      }
      if (myMapSelection.placeKey) {
        const place = getTorneoPlace(
          item.matchedTorneo || {
            idt: 0,
            anno: 41,
            com: 0,
            tipo: 0,
            data: item.data,
            luogo: item.luogo,
            regione: item.regione,
            status: 'disputato',
            href: '',
          },
          item.regione
        );
        if (place.key !== myMapSelection.placeKey) return false;
      }
      return true;
    });
  }, [myTornei, myMapSelection]);

  const { totalPartite, totalVittorie, totalSconfitte } = useMemo(() => {
    let part = 0;
    let vit = 0;
    let sco = 0;
    for (const t of myTornei) {
      part += t.partite.length;
      vit += t.vittorie;
      sco += t.sconfitte;
    }
    return { totalPartite: part, totalVittorie: vit, totalSconfitte: sco };
  }, [myTornei]);

  const portalCounts = useMemo(() => {
    const seen = new Set<string>();
    let mappa = 0;
    let risultati = 0;
    let programma = 0;

    for (const sec of searchFilteredSections) {
      for (const t of sec.tornei) {
        const key = `${t.com}-${t.idt}-${t.tipo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mappa += 1;
        if (t.status === 'disputato') risultati += 1;
        else programma += 1;
      }
    }

    return { mappa, risultati, programma, miei: myTornei.length };
  }, [searchFilteredSections, myTornei.length]);

  useEffect(() => {
    onUpdateCounts?.(portalCounts);
  }, [portalCounts, onUpdateCounts]);

  const torneiByRegion = useMemo(() => {
    if (!filteredSections || filteredSections.length === 0) return [];

    const seen = new Set<string>();
    const list: Array<{ torneo: TorneoItem; sectionTitle: string; region: string }> = [];

    for (const sec of filteredSections) {
      for (const t of sec.tornei) {
        const uniqueKey = `${t.com}-${t.idt}-${t.tipo}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);

          let reg = t.regione?.trim();
          if (!reg && t.com > 0 && t.com !== 30) {
            reg = REGIONS_COMIT.find((r) => r.id === t.com)?.name;
          }
          if (!reg) {
            reg = sec.regioneNome;
          }
          // Se la regione è nazionale o non definita, verifichiamo la regione geografica della città di svolgimento
          const host = getTorneoHostRegion(t);
          if (host && host !== 'Nazionale') {
            reg = host;
          } else if (!reg || reg.toLowerCase().includes('nazionale') || t.com === 0 || t.com === 30) {
            reg = 'Nazionale';
          }

          list.push({ torneo: t, sectionTitle: sec.title, region: reg });
        }
      }
    }

    const groupMap = new Map<string, Array<{ torneo: TorneoItem; sectionTitle: string }>>();
    for (const item of list) {
      if (!groupMap.has(item.region)) {
        groupMap.set(item.region, []);
      }
      groupMap.get(item.region)!.push({ torneo: item.torneo, sectionTitle: item.sectionTitle });
    }

    const sortedRegions = Array.from(groupMap.keys()).sort((a, b) => {
      if (a === 'Nazionale') return -1;
      if (b === 'Nazionale') return 1;
      return a.localeCompare(b, 'it');
    });

    return sortedRegions.map((region) => ({
      region,
      items: groupMap.get(region)!,
    }));
  }, [filteredSections]);

  const visibleTorneiByRegion = useMemo(() => {
    if (!mapSelection.region && !mapSelection.placeKey) return torneiByRegion;

    return torneiByRegion
      .filter(
        (group) => !mapSelection.region || regionMatches(group.region, mapSelection.region)
      )
      .map((group) => ({
        ...group,
        items: mapSelection.placeKey
          ? group.items.filter(
            (item) =>
              getTorneoPlace(item.torneo, group.region).key === mapSelection.placeKey
          )
          : group.items,
      }))
      .filter((group) => group.items.length > 0);
  }, [torneiByRegion, mapSelection.region, mapSelection.placeKey]);

  const visibleTorneiCount = useMemo(
    () => visibleTorneiByRegion.reduce((total, group) => total + group.items.length, 0),
    [visibleTorneiByRegion]
  );

  // Load a single tournament's detail (gare list)
  const handleSelectTorneo = async (torneo: TorneoItem) => {
    setSelectedTorneo(torneo);
    setTorneoDettaglio(null);
    setDettaglioError(null);
    setSelectedGara(null);
    setGaraData(null);
    setGaraPhaseTab(null);
    setLoadingDettaglio(true);
    setGaraSearchQuery('');
    setBracketViewMode('bracket');
    scrollToRoot();

    try {
      const det = await fetchTorneoDettaglio(torneo.idt, torneo.com, torneo.anno);
      setTorneoDettaglio(det);
    } catch (err: any) {
      setDettaglioError(err?.message || 'Impossibile caricare le gare del torneo.');
    } finally {
      setLoadingDettaglio(false);
    }
  };

  // Open a gara: load its data and stop on the phase-choice screen
  const handleOpenGara = async (gara: TorneoGaraLink) => {
    setSelectedGara(gara);
    setGaraData(null);
    setGaraPhaseTab(null);
    setGaraSearchQuery('');
    setBracketViewMode('bracket');
    scrollToRoot();
    setLoadingGara(true);

    try {
      const res = await fetchTorneoGara({
        idt: gara.idt,
        com: gara.com,
        gara: gara.garaId,
        anno: gara.anno,
        isDoppio: gara.isDoppio,
        mode: gara.mode,
      });
      setGaraData(res);
    } catch {
      setGaraData(null);
    } finally {
      setLoadingGara(false);
    }
  };

  const reloadGara = async (
    gara: TorneoGaraLink,
    params: { cod1?: number; cod2?: number; tab?: number; turno?: number }
  ) => {
    setLoadingGara(true);
    try {
      const res = await fetchTorneoGara({
        idt: gara.idt,
        com: gara.com,
        gara: gara.garaId,
        anno: gara.anno,
        isDoppio: gara.isDoppio,
        mode: gara.mode,
        ...params,
      });
      setGaraData(res);
    } catch {
      // Keep the current data visible if a single turno/girone fails
    } finally {
      setLoadingGara(false);
    }
  };

  const handleSelectTurno = (tab: number, turno: number) => {
    if (!selectedGara) return;
    void reloadGara(selectedGara, { tab, turno });
  };

  const handleSelectGirone = (cod1: number, cod2: number) => {
    if (!selectedGara) return;
    void reloadGara(selectedGara, { cod1, cod2 });
  };

  const handleOpenPhase = (phase: GaraPhase) => {
    setGaraPhaseTab(phase);
    if (phase === 'iscritti') {
      setGaraSearchQuery('');
      setIscrittiSortField('puntiIscrizione');
      setIscrittiSortDir('desc');
    }
    scrollToRoot();
  };

  const handleToggleIscrittiSort = (field: 'puntiIscrizione' | 'puntiClassificaAttuale' | 'posizione') => {
    if (iscrittiSortField === field) {
      setIscrittiSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setIscrittiSortField(field);
      setIscrittiSortDir(field === 'posizione' ? 'asc' : 'desc');
    }
  };

  // Arricchimento progressivo dei punti dell'ultima classifica in vigore per gli iscritti non ancora risolti
  useEffect(() => {
    if (!garaData?.iscritti || garaData.iscritti.length === 0) {
      setLoadingCurrentPoints(false);
      return;
    }

    const missing = garaData.iscritti.filter(
      (i) => i.puntiClassificaAttuale === null || i.puntiClassificaAttuale === undefined
    );
    if (missing.length === 0) {
      setLoadingCurrentPoints(false);
      return;
    }

    let cancelled = false;
    setLoadingCurrentPoints(true);

    (async () => {
      const batchSize = 30;
      for (let idx = 0; idx < missing.length; idx += batchSize) {
        if (cancelled) break;
        const batch = missing.slice(idx, idx + batchSize).map((m) => ({
          nome: m.nome,
          atletaId: m.atletaId,
        }));
        try {
          const resolvedMap = await fetchIscrittiCurrentPoints(batch);
          if (cancelled) break;
          setGaraData((prev) => {
            if (!prev) return prev;
            const nextIscritti = prev.iscritti.map((item) => {
              const found = resolvedMap[item.nome];
              if (!found) return item;
              return {
                ...item,
                atletaId: found.atletaId || item.atletaId,
                puntiClassificaAttuale:
                  found.puntiClassificaAttuale !== null
                    ? found.puntiClassificaAttuale
                    : item.puntiClassificaAttuale ?? 0,
              };
            });
            return { ...prev, iscritti: nextIscritti };
          });
        } catch {
          // Ignora errore singolo batch
        }
      }
      if (!cancelled) {
        setLoadingCurrentPoints(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [garaData?.idt, garaData?.garaId, garaData?.iscritti?.length]);

  const backToTornei = () => {
    setIsModalFullscreen(false);
    setSelectedTorneo(null);
    setTorneoDettaglio(null);
    setDettaglioError(null);
    setSelectedGara(null);
    setGaraData(null);
    setGaraPhaseTab(null);
    scrollToRoot();
  };

  const backToTorneo = () => {
    setIsModalFullscreen(false);
    setSelectedGara(null);
    setGaraData(null);
    setGaraPhaseTab(null);
    setGaraSearchQuery('');
    scrollToRoot();
  };

  const backToGara = () => {
    setIsModalFullscreen(false);
    setGaraPhaseTab(null);
    scrollToRoot();
  };

  const handleAthleteClick = (atletaId: string | null | undefined, nome: string) => {
    const clean = (nome || '').trim();
    if (!clean) return;
    // Se è un doppio (es. "ROSSI MARIO / BIANCHI LUCA"), apri il primo atleta
    const primaryName = clean.includes('/') ? clean.split('/')[0].trim() : clean;
    onOpenAtletaModal(atletaId || primaryName, primaryName);
  };

  const selectedRegionName =
    comitId === 0
      ? 'Tutte le regioni'
      : REGIONS_COMIT.find((r) => r.id === comitId)?.name || 'Nazionale';

  const headerTitle = activeCategoryDef
    ? activeCategoryDef.label
    : categoryKey === 'reg_all'
      ? `Tornei Regionali (${selectedRegionName})`
      : 'Tornei e Manifestazioni FITeT';

  const headerSubtitle = activeCategoryDef
    ? `${activeCategoryDef.description} • ${selectedRegionName}`
    : `Calendario risultati, tabelloni e iscritti • ${selectedRegionName}`;

  const listTitle =
    portalView === 'mappa'
      ? headerTitle
      : portalView === 'risultati'
        ? 'Risultati dei tornei'
        : 'Tornei in programma';

  const listSubtitle =
    portalView === 'mappa'
      ? headerSubtitle
      : `${activeCategoryDef ? `${activeCategoryDef.label} • ` : ''}${selectedRegionName}`;

  const getPointsIscrizioneNum = (item: { puntiIscrizione?: number; punti?: string }): number => {
    if (typeof item.puntiIscrizione === 'number' && item.puntiIscrizione > 0) {
      return item.puntiIscrizione;
    }
    return parseInt((item.punti || '').replace(/\./g, '').replace(/[^\d-]/g, ''), 10) || 0;
  };

  const filteredIscritti = useMemo(() => {
    if (!garaData?.iscritti) return [];
    const q = garaSearchQuery.toLowerCase().trim();
    const filtered = !q
      ? [...garaData.iscritti]
      : garaData.iscritti.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          i.societa.toLowerCase().includes(q) ||
          i.statusLabel.toLowerCase().includes(q)
      );

    filtered.sort((a, b) => {
      const mul = iscrittiSortDir === 'desc' ? -1 : 1;
      if (iscrittiSortField === 'posizione') {
        return (a.posizione - b.posizione) * mul;
      }
      const ptsIscrA = getPointsIscrizioneNum(a);
      const ptsIscrB = getPointsIscrizioneNum(b);

      if (iscrittiSortField === 'puntiClassificaAttuale') {
        const curA = a.puntiClassificaAttuale && a.puntiClassificaAttuale > 0 ? a.puntiClassificaAttuale : ptsIscrA;
        const curB = b.puntiClassificaAttuale && b.puntiClassificaAttuale > 0 ? b.puntiClassificaAttuale : ptsIscrB;
        if (curA !== curB) return (curA - curB) * mul;
      }

      if (ptsIscrA !== ptsIscrB) return (ptsIscrA - ptsIscrB) * mul;
      return a.posizione - b.posizione;
    });

    return filtered;
  }, [garaData?.iscritti, garaSearchQuery, iscrittiSortField, iscrittiSortDir]);

  const currentGaraKey = selectedGara
    ? `${selectedGara.idt}_${selectedGara.com}_${selectedGara.garaId}`
    : '';

  const loadCompleteBracket = useCallback(
    async (
      gara: TorneoGaraLink,
      turni: Array<{ tab: number; turno: number; label: string }>
    ) => {
      const garaKey = `${gara.idt}_${gara.com}_${gara.garaId}`;
      if (fullBracketCache[garaKey] && fullBracketCache[garaKey].length > 0) {
        return;
      }

      setBracketLoading(true);
      try {
        const roundPromises = turni.map(async (t) => {
          try {
            const res = await fetchTorneoGara({
              idt: gara.idt,
              com: gara.com,
              gara: gara.garaId,
              anno: gara.anno,
              isDoppio: gara.isDoppio,
              mode: 'risultati',
              tab: t.tab,
              turno: t.turno,
            });
            return {
              tab: t.tab,
              turno: t.turno,
              roundLabel: t.label,
              matches: res.partiteTabellone || [],
            };
          } catch {
            return {
              tab: t.tab,
              turno: t.turno,
              roundLabel: t.label,
              matches: [],
            };
          }
        });

        const allRounds = await Promise.all(roundPromises);
        const populatedRounds = allRounds.filter((r) => r.matches && r.matches.length > 0);

        // Ordina i round dal primo turno (più partite, es. 32esimi o 16esimi) alla finale (1 partita)
        populatedRounds.sort((a, b) => b.matches.length - a.matches.length);

        setFullBracketCache((prev) => ({
          ...prev,
          [garaKey]: populatedRounds,
        }));
      } catch (err) {
        console.error('Errore nel caricamento del tabellone completo:', err);
      } finally {
        setBracketLoading(false);
      }
    },
    [fullBracketCache]
  );

  useEffect(() => {
    if (
      garaPhaseTab !== 'tabellone' ||
      bracketViewMode !== 'bracket' ||
      !selectedGara ||
      !garaData?.turniTabellone ||
      garaData.turniTabellone.length === 0
    ) {
      return;
    }

    // The API already returns every round: only use the per-round fallback
    // for older cached payloads that do not include allTurniTabellone.
    if (garaData.allTurniTabellone && garaData.allTurniTabellone.length > 0) {
      return;
    }

    const garaKey = `${selectedGara.idt}_${selectedGara.com}_${selectedGara.garaId}`;
    if (!fullBracketCache[garaKey]) {
      loadCompleteBracket(selectedGara, garaData.turniTabellone);
    }
  }, [
    garaPhaseTab,
    bracketViewMode,
    selectedGara,
    garaData?.turniTabellone,
    garaData?.allTurniTabellone,
    fullBracketCache,
    loadCompleteBracket,
  ]);

  const currentFullBracketRounds: BracketRoundData[] = useMemo(() => {
    if (currentGaraKey && fullBracketCache[currentGaraKey]) {
      return fullBracketCache[currentGaraKey];
    }
    if (garaData?.allTurniTabellone && garaData.allTurniTabellone.length > 0) {
      return garaData.allTurniTabellone.map((t) => ({
        tab: t.tab,
        turno: t.turno,
        roundLabel: t.label,
        matches: t.matches,
      }));
    }
    return [];
  }, [currentGaraKey, fullBracketCache, garaData?.allTurniTabellone]);

  const availablePhases = useMemo<AvailablePhase[]>(() => {
    if (!garaData) return [];

    if (garaData.mode === 'iscrizioni') {
      return [
        {
          key: 'iscritti',
          title: 'Iscritti',
          description: `${garaData.iscritti.length} ${garaData.iscritti.length === 1 ? 'iscritto' : 'iscritti'} • Elenco partecipanti`,
        },
      ];
    }

    const bracketMatches =
      (garaData.partiteTabellone?.length || 0) +
      (garaData.allTurniTabellone?.reduce((total, t) => total + t.matches.length, 0) || 0);

    const phases: AvailablePhase[] = [];
    if (bracketMatches > 0) {
      phases.push({
        key: 'tabellone',
        title: 'Eliminazione diretta',
        description: `${garaData.turniTabellone.length} ${garaData.turniTabellone.length === 1 ? 'turno' : 'turni'} • Tabellone e incontri`,
      });
    }
    if (garaData.gironiRanges.length > 0) {
      phases.push({
        key: 'gironi',
        title: 'Gironi di qualificazione',
        description:
          garaData.gironiRanges.length > 1
            ? `${garaData.gironiRanges.length} gruppi di gironi • Classifiche e incontri`
            : 'Classifiche e incontri dei gironi',
      });
    }
    return phases;
  }, [garaData]);

  const phaseTitle =
    garaPhaseTab === 'tabellone'
      ? 'Eliminazione diretta'
      : garaPhaseTab === 'gironi'
        ? 'Gironi di qualificazione'
        : 'Iscritti';

  const activeTurnoValue =
    garaData?.activeTurno
      ? `${garaData.activeTurno.tab}-${garaData.activeTurno.turno}`
      : garaData?.turniTabellone && garaData.turniTabellone.length > 0
        ? `${garaData.turniTabellone[0].tab}-${garaData.turniTabellone[0].turno}`
        : '';

  const activeGironiRangeValue =
    garaData?.activeGironiRange
      ? `${garaData.activeGironiRange.cod1}-${garaData.activeGironiRange.cod2}`
      : garaData?.gironiRanges && garaData.gironiRanges.length > 0
        ? `${garaData.gironiRanges[0].cod1}-${garaData.gironiRanges[0].cod2}`
        : '';

  // Il portale FITeT a volte restituisce un titolo generico ("Gara 1001"):
  // in quel caso è più utile il nome della gara ricavato dall'elenco del torneo.
  const garaDisplayTitle = selectedGara
    ? garaData?.titoloGara && !/^Gara\s+\d+$/i.test(garaData.titoloGara.trim())
      ? garaData.titoloGara
      : selectedGara.nome
    : '';


  const shell = (content: React.ReactNode) => (
    <div className="tornei-tab-container" ref={torneiRootRef}>
      {content}
    </div>
  );

  const renderStepBar = (backLabel: string, step: number, onBack: () => void) => (
    <div className="tornei-stepbar">
      <button type="button" className="tornei-back-btn" onClick={onBack}>
        <i className="bi bi-arrow-left" aria-hidden="true"></i>
        <span>{backLabel}</span>
      </button>
      <div className="tornei-stepbar-right">
        <span className="tornei-step-indicator"></span>
        <button
          type="button"
          className="tornei-modal-close"
          onClick={backToTornei}
          aria-label="Chiudi dettaglio torneo"
          title="Chiudi (Esc)"
        >
          <i className="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );

  // Body scroll lock and Escape key listener when tournament detail modal is open
  useEffect(() => {
    if (!selectedTorneo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (garaPhaseTab) {
          backToGara();
        } else if (selectedGara) {
          backToTorneo();
        } else {
          backToTornei();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [selectedTorneo, selectedGara, garaPhaseTab]);

  const renderTorneiList = (
    groups: TorneiListGroup[],
    options: { withMapBanner: boolean; title: string; subtitle: string }
  ) => {
    const count = groups.reduce((total, group) => total + group.items.length, 0);

    return (
      <section className="tornei-list-column" ref={torneiListRef}>
        {options.withMapBanner && mapSelection.region && (
          <div className="tornei-map-filter-banner">
            <div className="tornei-map-filter-text">
              <i className="bi bi-funnel-fill" aria-hidden="true"></i>
              <span>
                Filtro mappa: <strong>{mapSelection.label || mapSelection.region}</strong>
                <span className="tornei-map-filter-count">
                  {count} {count === 1 ? 'torneo' : 'tornei'}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="tornei-map-filter-clear"
              onClick={() => handleMapSelectionChange(EMPTY_MAP_SELECTION)}
            >
              <i className="bi bi-x-lg" aria-hidden="true"></i>
              <span>Mostra tutti</span>
            </button>
          </div>
        )}

        <div className="tornei-list-heading">
          <div>
            <h3>{options.title}</h3>
            <p>{options.subtitle}</p>
          </div>
          <span className="tornei-list-count">
            {count} {count === 1 ? 'torneo' : 'tornei'}
          </span>
        </div>

        {groups.length > 0 && (
          <div className="tornei-region-list">
            {groups.map((group) => (
              <div key={group.region} className="tornei-region-group">
                <div className="tornei-region-heading">
                  <span className="tornei-region-name">{group.region}</span>
                  <span className="tornei-region-count">{group.items.length}</span>
                </div>

                <div className="tornei-rows">
                  {group.items.map(({ torneo, sectionTitle }) => (
                    <button
                      key={`${torneo.com}-${torneo.idt}-${torneo.tipo}`}
                      type="button"
                      className="torneo-row"
                      onClick={() => handleSelectTorneo(torneo)}
                    >
                      <span className="torneo-row-date">
                        <i className="bi bi-calendar3" aria-hidden="true"></i>
                        <span>{torneo.data}</span>
                      </span>

                      <span className="torneo-row-info">
                        <span className="torneo-row-title">{torneo.luogo}</span>
                        {sectionTitle && (
                          <span className="torneo-row-meta">{sectionTitle}</span>
                        )}
                      </span>

                      <span
                        className={`tornei-row-status ${torneo.status === 'disputato'
                          ? 'is-disputato'
                          : 'is-programma'
                          }`}
                      >
                        <i className="tornei-status-dot" aria-hidden="true"></i>
                        {torneo.status === 'disputato' ? 'Risultati' : 'Programma'}
                      </span>

                      <i className="bi bi-chevron-right torneo-row-chevron" aria-hidden="true"></i>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const loadingState = (
    <div className="tornei-loading-state">
      <div className="spinner-border text-primary" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
        <span className="visually-hidden">Caricamento...</span>
      </div>
      <p className="tornei-loading-text">Caricamento calendario e risultati tornei FITeT...</p>
    </div>
  );

  const errorState = (
    <div className="tornei-error-card">
      <div className="tornei-error-icon">
        <i className="bi bi-exclamation-triangle-fill"></i>
      </div>
      <h3>Impossibile caricare i tornei</h3>
      <p>{error}</p>
      <button
        type="button"
        className="btn-action"
        onClick={() => loadTornei(categoryKey, comitId, regFilterId, true)}
      >
        <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
        Riprova
      </button>
    </div>
  );

  const emptyAll = (
    <div className="tornei-empty-card">
      <i className="bi bi-trophy tornei-empty-icon"></i>
      <h3>Nessun torneo trovato</h3>
      <p>
        Non ci sono tornei pubblicati per i filtri selezionati ({headerTitle} • {selectedRegionName}).
      </p>
      <button type="button" className="btn-action" onClick={resetAllFilters}>
        <i className="bi bi-arrow-left" aria-hidden="true"></i>
        Azzera i filtri
      </button>
    </div>
  );

  const emptyStatus = (
    <div className="tornei-empty-card">
      <i
        className={`bi ${portalView === 'risultati' ? 'bi-check2-circle' : 'bi-calendar-event'
          } tornei-empty-icon`}
      ></i>
      <h3>
        {portalView === 'risultati' ? 'Nessun risultato disponibile' : 'Nessun torneo in programma'}
      </h3>
      <p>
        {portalView === 'risultati'
          ? 'Non ci sono tornei disputati'
          : 'Non ci sono tornei in programma'}{' '}
        per i filtri selezionati ({selectedRegionName}).
      </p>
      <button type="button" className="btn-action" onClick={resetAllFilters}>
        <i className="bi bi-arrow-left" aria-hidden="true"></i>
        Azzera i filtri
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------

  const renderDetailModal = () => {
    if (!selectedTorneo) return null;

    let modalContent: React.ReactNode = null;

    if (selectedGara && garaPhaseTab) {
      modalContent = (
        <div className="tornei-detail">
          {renderStepBar('Torna alle fasi', 3, backToGara)}

          <header className="tornei-detail-head">
            <div className="tornei-detail-head-main">
              <span className="tornei-detail-kicker">
                {garaDisplayTitle}
              </span>
              <h2 className="tornei-detail-title">{phaseTitle}</h2>
              <p className="tornei-detail-subtitle">
                {selectedTorneo.luogo} • {selectedTorneo.data}
              </p>
            </div>
          </header>

          {garaPhaseTab === 'tabellone' && garaData && (
            <>
              <div className="tornei-phase-toolbar">
                <div className="tornei-segmented" role="group" aria-label="Vista del tabellone">
                  <button
                    type="button"
                    className={`tornei-segmented-btn ${bracketViewMode === 'bracket' ? 'is-active' : ''}`}
                    onClick={() => setBracketViewMode('bracket')}
                  >
                    Tabellone
                  </button>
                  <button
                    type="button"
                    className={`tornei-segmented-btn ${bracketViewMode === 'cards' ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsModalFullscreen(false);
                      setBracketViewMode('cards');
                    }}
                  >
                    Elenco
                  </button>
                </div>

                {bracketViewMode === 'cards' && garaData.turniTabellone.length > 0 && (
                  <label className="tornei-select-wrap">
                    <span>Turno</span>
                    <select
                      className="tornei-select"
                      value={activeTurnoValue}
                      onChange={(e) => {
                        const [tab, turno] = e.target.value.split('-').map(Number);
                        handleSelectTurno(tab, turno);
                      }}
                    >
                      {garaData.turniTabellone.map((t) => (
                        <option key={`${t.tab}-${t.turno}`} value={`${t.tab}-${t.turno}`}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="tornei-phase-body">
                {loadingGara ? (
                  <div className="tornei-loading-state tornei-loading-compact">
                    <div className="spinner-border text-primary" role="status" style={{ width: '2rem', height: '2rem' }}>
                      <span className="visually-hidden">Caricamento...</span>
                    </div>
                    <p className="tornei-loading-text">Caricamento turno...</p>
                  </div>
                ) : bracketViewMode === 'bracket' ? (
                  bracketLoading ? (
                    <div className="tornei-loading-state tornei-loading-compact">
                      <div className="spinner-border text-primary" role="status" style={{ width: '2rem', height: '2rem' }}>
                        <span className="visually-hidden">Caricamento tabellone...</span>
                      </div>
                      <p className="tornei-loading-text">Generazione del tabellone completo...</p>
                    </div>
                  ) : (
                    <TorneoBracket
                      rounds={currentFullBracketRounds}
                      competitionName={garaDisplayTitle || 'Tabellone Eliminazione Diretta'}
                      onOpenAtletaModal={handleAthleteClick}
                      isModal={isModalFullscreen}
                      onToggleFullscreen={setIsModalFullscreen}
                      onCloseFullscreen={() => setIsModalFullscreen(false)}
                    />
                  )
                ) : garaData.partiteTabellone.length > 0 ? (
                  <div className="match-cards-grid">
                    {garaData.partiteTabellone.map((m, idx) => (
                      <div key={idx} className="match-card">
                        <div className="torneo-card-top">
                          <span className="giornata-badge-pill">
                            {garaData.activeTurno?.label || 'Tabellone'}
                          </span>
                          {m.sets.length > 0 && (
                            <div className="torneo-match-sets">
                              {m.sets.map((s, si) => (
                                <span key={si} className="torneo-set-chip">
                                  {s.p1}-{s.p2}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className={`torneo-match-row ${m.vincitore === 1 ? 'is-winner' : ''}`}>
                          <div className="athlete-name-cell">
                            <button
                              type="button"
                              className="athlete-link-btn"
                              onClick={() => handleAthleteClick(m.atleta1Id, m.atleta1)}
                            >
                              <span>{m.atleta1 || 'Bye / —'}</span>
                            </button>
                            {m.societa1 && <span className="athlete-mobile-meta">{m.societa1}</span>}
                          </div>
                          <span className="badge-points-official">{m.set1}</span>
                        </div>

                        <div className={`torneo-match-row ${m.vincitore === 2 ? 'is-winner' : ''}`}>
                          <div className="athlete-name-cell">
                            <button
                              type="button"
                              className="athlete-link-btn"
                              onClick={() => handleAthleteClick(m.atleta2Id, m.atleta2)}
                            >
                              <span>{m.atleta2 || 'Bye / —'}</span>
                            </button>
                            {m.societa2 && <span className="athlete-mobile-meta">{m.societa2}</span>}
                          </div>
                          <span className="badge-points-official">{m.set2}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tornei-empty-box">
                    Nessun incontro registrato per questo turno. Seleziona un altro turno dall'elenco.
                  </div>
                )}
              </div>
            </>
          )}

          {garaPhaseTab === 'gironi' && garaData && (
            <>
              {garaData.gironiRanges.length > 1 && (
                <div className="tornei-phase-toolbar">
                  <label className="tornei-select-wrap">
                    <span>Gruppo gironi</span>
                    <select
                      className="tornei-select"
                      value={activeGironiRangeValue}
                      onChange={(e) => {
                        const [cod1, cod2] = e.target.value.split('-').map(Number);
                        handleSelectGirone(cod1, cod2);
                      }}
                    >
                      {garaData.gironiRanges.map((gr) => (
                        <option key={`${gr.cod1}-${gr.cod2}`} value={`${gr.cod1}-${gr.cod2}`}>
                          {gr.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="tornei-phase-body">
                {loadingGara ? (
                  <div className="tornei-loading-state tornei-loading-compact">
                    <div className="spinner-border text-primary" role="status" style={{ width: '2rem', height: '2rem' }}>
                      <span className="visually-hidden">Caricamento...</span>
                    </div>
                    <p className="tornei-loading-text">Caricamento gironi...</p>
                  </div>
                ) : garaData.gironi.length > 0 ? (
                  <div className="tornei-gironi-list">
                    {garaData.gironi.map((gir) => {
                      const isGironeExpanded = expandedGironeKeys.has(gir.numero);
                      return (
                        <section key={gir.numero} className="tornei-girone">
                          <div
                            className="tornei-girone-head"
                            onClick={() => toggleGironeMatches(gir.numero)}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isGironeExpanded}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleGironeMatches(gir.numero);
                              }
                            }}
                          >
                            <div>
                              <span className="tornei-girone-title">Girone {gir.numero}</span>
                              <span className="tornei-girone-sub">Classifica e incontri</span>
                            </div>
                          </div>

                          {gir.classifica.length > 0 && (
                            <div className="table-responsive tornei-table-wrap">
                              <table className="tornei-table">
                                <thead>
                                  <tr>
                                    <th className="th-rank">#</th>
                                    <th className="th-athlete">Atleta</th>
                                    <th className="th-provincia hide-xs">Società</th>
                                    <th className="text-center">Pt</th>
                                    <th className="text-center">V-P</th>
                                    <th className="text-center">Set</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {gir.classifica.map((row) => (
                                    <tr
                                      key={row.nome}
                                      className={`tornei-table-row ${row.atletaId == myPlayerId ? 'its-me' : ''}`}
                                      onClick={() => handleAthleteClick(row.atletaId, row.nome)}
                                    >
                                      <td className="td-rank">
                                        <span className={`rank-badge rank-badge-${row.posizione <= 2 ? row.posizione : 'default'}`}>
                                          {row.posizione}
                                        </span>
                                      </td>
                                      <td className="td-athlete">
                                        <div className="athlete-row-cell">
                                          <AthleteAvatar
                                            atletaId={row.atletaId || undefined}
                                            nome={row.nome}
                                            size={26}
                                            className="tornei-avatar"
                                          />
                                          <div className="athlete-name-cell">
                                            <span className="athlete-link-btn">{row.nome}</span>
                                            <span className="athlete-mobile-meta show-xs">{row.societa}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="hide-xs">
                                        <span className="provincia-text">{row.societa}</span>
                                      </td>
                                      <td className="text-center">
                                        <span className="badge-points-official">{row.punti}</span>
                                      </td>
                                      <td className="text-center">
                                        <span className="settore-badge">{row.vinte}-{row.perse}</span>
                                      </td>
                                      <td className="text-center">
                                        <span className="date-text">{row.setVinti}-{row.setPersi}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {gir.partite.length > 0 && (
                            <div className="tornei-girone-expand-section">
                              <div
                                className="tornei-girone-expand-bar"
                                onClick={() => toggleGironeMatches(gir.numero)}
                              >
                                <button
                                  type="button"
                                  className="miei-torneo-expand-hint"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGironeMatches(gir.numero);
                                  }}
                                >
                                  <span>
                                    {isGironeExpanded
                                      ? 'Nascondi incontri'
                                      : `Mostra ${gir.partite.length} incontri`}
                                  </span>
                                  <i className={`bi bi-chevron-${isGironeExpanded ? 'up' : 'down'}`}></i>
                                </button>
                              </div>

                              {isGironeExpanded && (
                                <div className="match-cards-grid match-cards-grid--animated">
                                  {gir.partite.map((m, mi) => (
                                    <div key={mi} className="match-card">
                                      {m.sets.length > 0 && (
                                        <div className="torneo-card-top">
                                          <span className="athlete-mobile-meta">Incontro #{mi + 1}</span>
                                          <div className="torneo-match-sets">
                                            {m.sets.map((s, si) => (
                                              <span key={si} className="torneo-set-chip">
                                                {s.p1}-{s.p2}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      <div className={`torneo-match-row ${m.vincitore === 1 ? 'is-winner' : ''}`}>
                                        <button
                                          type="button"
                                          className="athlete-link-btn"
                                          onClick={() => handleAthleteClick(m.atleta1Id, m.atleta1)}
                                        >
                                          <span>{m.atleta1}</span>
                                        </button>
                                        <strong>{m.set1}</strong>
                                      </div>
                                      <div className={`torneo-match-row ${m.vincitore === 2 ? 'is-winner' : ''}`}>
                                        <button
                                          type="button"
                                          className="athlete-link-btn"
                                          onClick={() => handleAthleteClick(m.atleta2Id, m.atleta2)}
                                        >
                                          <span>{m.atleta2}</span>
                                        </button>
                                        <strong>{m.set2}</strong>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tornei-empty-box">Nessun girone trovato per questo intervallo.</div>
                )}
              </div>
            </>
          )}

          {garaPhaseTab === 'iscritti' && garaData && (
            <>
              <div className="tornei-phase-toolbar tornei-iscritti-toolbar">
                <div className="tornei-search">
                  <i className="bi bi-search tornei-search-icon" aria-hidden="true"></i>
                  <input
                    type="search"
                    className="tornei-search-input"
                    placeholder="Cerca atleta o società..."
                    value={garaSearchQuery}
                    onChange={(e) => setGaraSearchQuery(e.target.value)}
                    aria-label="Cerca atleta o società"
                  />
                </div>

                <div className="tornei-iscritti-sort-group" role="group" aria-label="Ordina iscritti per">
                  <button
                    type="button"
                    className={`tornei-sort-pill ${iscrittiSortField === 'puntiIscrizione' ? 'is-active' : ''}`}
                    onClick={() => handleToggleIscrittiSort('puntiIscrizione')}
                    title="Ordina per punteggio al momento dell'iscrizione"
                  >
                    <span>Punti Iscr.</span>
                    <i
                      className={`bi ${iscrittiSortField === 'puntiIscrizione'
                        ? iscrittiSortDir === 'desc'
                          ? 'bi-arrow-down'
                          : 'bi-arrow-up'
                        : 'bi-arrow-down-up'
                        }`}
                    ></i>
                  </button>
                  <button
                    type="button"
                    className={`tornei-sort-pill ${iscrittiSortField === 'puntiClassificaAttuale' ? 'is-active' : ''}`}
                    onClick={() => handleToggleIscrittiSort('puntiClassificaAttuale')}
                    title="Ordina per punti dell'ultima classifica in vigore (Teste di Serie)"
                  >
                    <span>Punti Attuali</span>
                    <i
                      className={`bi ${iscrittiSortField === 'puntiClassificaAttuale'
                        ? iscrittiSortDir === 'desc'
                          ? 'bi-arrow-down'
                          : 'bi-arrow-up'
                        : 'bi-arrow-down-up'
                        }`}
                    ></i>
                  </button>
                </div>

                <span className="tornei-section-count">
                  {filteredIscritti.length} / {garaData.iscritti.length}
                </span>
              </div>

              <div className="tornei-phase-body">
                {filteredIscritti.length > 0 ? (
                  <div className="table-responsive tornei-table-wrap">
                    <table className="tornei-table">
                      <thead>
                        <tr>
                          <th
                            className={`th-rank th-sortable ${iscrittiSortField === 'posizione' ? 'is-sorted' : ''}`}
                            onClick={() => handleToggleIscrittiSort('posizione')}
                            title="Clicca per ordinare per numero d'iscrizione originale"
                          >
                            <span>#</span>
                          </th>
                          <th className="th-athlete">Atleta</th>
                          <th className="th-provincia hide-xs">Società</th>
                          <th
                            className={`th-points text-end th-sortable ${iscrittiSortField === 'puntiIscrizione' ? 'is-sorted' : ''}`}
                            onClick={() => handleToggleIscrittiSort('puntiIscrizione')}
                            title="Clicca per ordinare per Punti Iscrizione"
                          >
                            <span className="th-sortable-inner">
                              <span>Punti Iscr.</span>
                              <i
                                className={`bi ${iscrittiSortField === 'puntiIscrizione'
                                  ? iscrittiSortDir === 'desc'
                                    ? 'bi-arrow-down'
                                    : 'bi-arrow-up'
                                  : 'bi-arrow-down-up th-sort-idle'
                                  }`}
                              ></i>
                            </span>
                          </th>
                          <th
                            className={`th-points text-end th-sortable ${iscrittiSortField === 'puntiClassificaAttuale' ? 'is-sorted' : ''}`}
                            onClick={() => handleToggleIscrittiSort('puntiClassificaAttuale')}
                            title="Clicca per ordinare per Punti Ultima Classifica (Teste di Serie)"
                          >
                            <span className="th-sortable-inner">
                              <span>Punti attuali </span>
                              {loadingCurrentPoints ? (
                                <span
                                  className="spinner-border spinner-border-sm ms-1"
                                  role="status"
                                  style={{ width: '0.7rem', height: '0.7rem', borderWidth: '0.12em' }}
                                ></span>
                              ) : (
                                <i
                                  className={`bi ${iscrittiSortField === 'puntiClassificaAttuale'
                                    ? iscrittiSortDir === 'desc'
                                      ? 'bi-arrow-down'
                                      : 'bi-arrow-up'
                                    : 'bi-arrow-down-up th-sort-idle'
                                    }`}
                                ></i>
                              )}
                            </span>
                          </th>
                          <th className="th-cat text-center">Stato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIscritti.map((iscr, rowIdx) => {
                          const statusCls = iscr.statusClass.includes('diritto')
                            ? 'is-diritto'
                            : iscr.statusClass.includes('no_ammessi')
                              ? 'is-no-ammesso'
                              : iscr.statusClass.includes('wd')
                                ? 'is-wd'
                                : '';

                          const ptsIscrNum = getPointsIscrizioneNum(iscr);
                          const ptsAttuali =
                            typeof iscr.puntiClassificaAttuale === 'number' && iscr.puntiClassificaAttuale > 0
                              ? iscr.puntiClassificaAttuale
                              : null;
                          const delta =
                            ptsAttuali !== null && ptsIscrNum > 0 ? ptsAttuali - ptsIscrNum : null;

                          const displayRank =
                            iscrittiSortField === 'posizione' ? iscr.posizione : rowIdx + 1;

                          return (
                            <tr
                              key={`${iscr.posizione}-${iscr.nome}`}
                              className="tornei-table-row"
                              onClick={() => handleAthleteClick(iscr.atletaId, iscr.nome)}
                            >
                              <td className="td-rank">
                                <span className={`rank-badge rank-badge-${displayRank <= 3 ? displayRank : 'default'}`}>
                                  {displayRank}
                                </span>
                              </td>
                              <td className="td-athlete">
                                <div className="athlete-row-cell">
                                  <AthleteAvatar
                                    atletaId={iscr.atletaId || undefined}
                                    nome={iscr.nome}
                                    size={28}
                                    className="tornei-avatar"
                                  />
                                  <div className="athlete-name-cell">
                                    <button
                                      type="button"
                                      className="athlete-link-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAthleteClick(iscr.atletaId, iscr.nome);
                                      }}
                                    >
                                      <MarqueeText text={iscr.nome} className="athlete-link-text" />
                                      <i className="bi bi-arrow-up-right athlete-link-arrow"></i>
                                    </button>
                                    <div className="athlete-mobile-meta show-xs">{iscr.societa}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="td-provincia hide-xs">
                                <span className="provincia-text">{iscr.societa}</span>
                              </td>
                              <td className="td-points text-end">
                                <span className="badge-points-official">
                                  {ptsIscrNum > 0 ? ptsIscrNum.toLocaleString('it-IT') : iscr.punti || '-'}
                                </span>
                              </td>
                              <td className="td-points text-center">
                                {ptsAttuali !== null ? (
                                  <div className="iscritto-current-pts-wrap">
                                    <span className="badge-points-official is-current-rank">
                                      {(ptsAttuali).toLocaleString('it-IT')}
                                    </span>
                                    {delta !== null && (
                                      <span
                                        className={`iscritto-delta-badge ${delta > 0
                                          ? 'is-positive'
                                          : delta < 0
                                            ? 'is-negative'
                                            : 'is-neutral'
                                          }`}
                                        title={
                                          delta > 0
                                            ? `Guadagnati +${delta} pt rispetto all'iscrizione`
                                            : delta < 0
                                              ? `Persi ${delta} pt rispetto all'iscrizione`
                                              : 'Punteggio invariato rispetto all\'iscrizione'
                                        }
                                      >
                                        {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '='}
                                      </span>
                                    )}
                                  </div>
                                ) : loadingCurrentPoints ? (
                                  <span className="iscritto-pts-loading" title="Caricamento classifica attuale...">
                                    ···
                                  </span>
                                ) : (
                                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                    {ptsIscrNum > 0 ? ptsIscrNum.toLocaleString('it-IT') : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="td-cat text-center">
                                <span className={`torneo-iscritto-status ${statusCls}`}>
                                  {iscr.statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="tornei-empty-box">
                    Nessun iscritto pubblicato al momento per questa gara.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    } else if (selectedGara) {
      const torneoName =
        torneoDettaglio?.titolo || `${selectedTorneo.luogo} (${selectedTorneo.data})`;

      modalContent = (
        <div className="tornei-detail">
          {renderStepBar('Torna al torneo', 2, backToTorneo)}

          <header className="tornei-detail-head">
            <div className="tornei-detail-head-main">
              <span className="tornei-detail-kicker">{torneoName}</span>
              <h2 className="tornei-detail-title">{garaDisplayTitle}</h2>
              <p className="tornei-detail-subtitle">
                {selectedGara.isDoppio ? 'Doppio' : 'Singolo'} • {selectedTorneo.data} •{' '}
                {selectedTorneo.luogo}
              </p>
            </div>
          </header>

          {loadingGara ? (
            <div className="tornei-loading-state">
              <div className="spinner-border text-primary" role="status" style={{ width: '2.2rem', height: '2.2rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <p className="tornei-loading-text">Caricamento dati gara dal portale FITeT...</p>
            </div>
          ) : !garaData ? (
            <div className="tornei-empty-box">
              <span>Impossibile caricare i dati di questa gara.</span>
              <button type="button" className="btn-action" onClick={() => handleOpenGara(selectedGara)}>
                <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                Riprova
              </button>
            </div>
          ) : (
            <>
              {garaData.vincitore && (
                <div className="tornei-winner">
                  <AthleteAvatar
                    atletaId={garaData.vincitoreId || undefined}
                    nome={garaData.vincitore}
                    size={36}
                    className="tornei-avatar"
                  />
                  <div className="tornei-winner-info">
                    <span className="tornei-winner-label">1° classificato</span>
                    <button
                      type="button"
                      className="athlete-link-btn"
                      onClick={() => handleAthleteClick(garaData.vincitoreId, garaData.vincitore!)}
                    >
                      <span>{garaData.vincitore}</span>
                      <i className="bi bi-arrow-up-right athlete-link-arrow"></i>
                    </button>
                  </div>
                  {garaData.valoreRanking && (
                    <span className="tornei-winner-points">Ranking {garaData.valoreRanking}</span>
                  )}
                </div>
              )}

              <section className="tornei-detail-section">
                <div className="tornei-section-head">
                  <h3>Scegli la fase</h3>
                  <span className="tornei-section-count">{availablePhases.length}</span>
                </div>

                {availablePhases.length > 0 ? (
                  <div className="tornei-phase-list">
                    {availablePhases.map((phase, index) => (
                      <button
                        key={phase.key}
                        type="button"
                        className="tornei-phase-row"
                        onClick={() => handleOpenPhase(phase.key)}
                      >
                        <span className="tornei-phase-index">{index + 1}</span>
                        <span className="tornei-phase-info">
                          <span className="tornei-phase-name">{phase.title}</span>
                          <span className="tornei-phase-desc">{phase.description}</span>
                        </span>
                        <i className="bi bi-chevron-right tornei-phase-chevron" aria-hidden="true"></i>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="tornei-empty-box">
                    <span>
                      Nessun tabellone, girone o elenco iscritti disponibile per questa gara. I
                      risultati potrebbero non essere ancora pubblicati.
                    </span>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      );
    } else {
      const torneoTitle =
        torneoDettaglio?.titolo || `${selectedTorneo.luogo} (${selectedTorneo.data})`;
      const torneoSubtitle =
        torneoDettaglio?.sottotitolo || `${selectedTorneo.data} • ${selectedTorneo.luogo}`;

      modalContent = (
        <div className="tornei-detail">
          {renderStepBar('Torna ai tornei', 1, backToTornei)}

          <header className="tornei-detail-head">
            <div className="tornei-detail-head-main">
              <span className="tornei-detail-kicker">Torneo</span>
              <h2 className="tornei-detail-title">{torneoTitle}</h2>
              <p className="tornei-detail-subtitle">
                {torneoSubtitle}
                {selectedTorneo.regione ? ` • ${selectedTorneo.regione}` : ''}
              </p>
            </div>
            <span
              className={`tornei-status-text ${selectedTorneo.status === 'disputato' ? 'is-disputato' : 'is-programma'
                }`}
            >
              <i className="tornei-status-dot" aria-hidden="true"></i>
              {selectedTorneo.status === 'disputato' ? 'Risultati disponibili' : 'In programma'}
            </span>
          </header>

          <div className="tornei-doc-links">
            {torneoDettaglio?.pdfSinteticoUrl && (
              <a
                href={torneoDettaglio.pdfSinteticoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="torneo-doc-link"
              >
                <i className="bi bi-file-earmark-pdf" aria-hidden="true" style={{ color: 'red' }}></i>
                <span>PDF sintetico</span>
              </a>
            )}
            {torneoDettaglio?.tabelloniHomeUrl && (
              <a
                href={torneoDettaglio.tabelloniHomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="torneo-doc-link"
              >
                <i className="bi bi-diagram-3" aria-hidden="true"></i>
                <span>Tabelloni ufficiali</span>
              </a>
            )}
            <a
              href={selectedTorneo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="torneo-doc-link"
            >
              <i className="bi bi-box-arrow-up-right" aria-hidden="true"></i>
              <span>Pagina FITeT</span>
            </a>
          </div>

          <section className="tornei-detail-section">
            <div className="tornei-section-head">
              <h3>Gare del torneo</h3>
              {torneoDettaglio && (
                <span className="tornei-section-count">{torneoDettaglio.gare.length}</span>
              )}
            </div>

            {loadingDettaglio ? (
              <div className="tornei-inline-loading">
                <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                <span>Caricamento gare...</span>
              </div>
            ) : dettaglioError ? (
              <div className="tornei-empty-box">
                <span>{dettaglioError}</span>
                <button type="button" className="btn-action" onClick={() => handleSelectTorneo(selectedTorneo)}>
                  <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                  Riprova
                </button>
              </div>
            ) : torneoDettaglio && torneoDettaglio.gare.length > 0 ? (
              <div className="tornei-gare-list">
                {torneoDettaglio.gare.map((gara, index) => (
                  <button
                    key={`${gara.garaId}-${gara.mode}-${index}`}
                    type="button"
                    className="tornei-gara-row"
                    onClick={() => handleOpenGara(gara)}
                  >
                    <span className="tornei-gara-index">{index + 1}</span>
                    <span className="tornei-gara-info">
                      <span className="tornei-gara-name">{gara.nome}</span>
                      <span className="tornei-gara-meta">
                        {gara.isDoppio ? 'Doppio' : 'Singolo'}
                        {' • '}
                        {gara.mode === 'risultati' ? 'Risultati e iscritti' : 'Iscrizioni'}
                      </span>
                    </span>
                    <i className="bi bi-chevron-right tornei-gara-chevron" aria-hidden="true"></i>
                  </button>
                ))}
              </div>
            ) : (
              <div className="tornei-empty-box">Nessuna gara pubblicata per questo torneo.</div>
            )}
          </section>
        </div>
      );
    }

    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        className={`modal-backdrop-simple modal-torneo-detail-backdrop ${isModalFullscreen ? 'is-fullscreen' : ''}`}
        onClick={backToTornei}
      >
        <div
          className={`modal-card-simple modal-torneo-detail-card ${isModalFullscreen ? 'is-fullscreen' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {modalContent}
        </div>
      </div>,
      document.body
    );
  };

  // PORTAL - Mappa / Risultati / Programma / I Miei Tornei
  // ---------------------------------------------------------------------------
  const renderMyTorneiView = () => {
    if (myTorneiLoading) {
      return (
        <div className="tornei-loading-state">
          <div className="spinner-border text-primary" role="status"></div>
          <p>Caricamento dei tuoi tornei FITeT...</p>
        </div>
      );
    }

    if (myTorneiError) {
      return (
        <div className="tornei-empty-card">
          <i className="bi bi-exclamation-triangle tornei-empty-icon"></i>
          <h3>Errore nel caricamento</h3>
          <p>{myTorneiError}</p>
          {myPlayerId && (
            <button type="button" className="btn-action" onClick={() => loadMyAthlete(myPlayerId)}>
              <i className="bi bi-arrow-clockwise"></i>
              <span>Riprova</span>
            </button>
          )}
        </div>
      );
    }

    if (!myPlayerId) {
      return (
        <div className="miei-picker-card">
          <div className="miei-picker-icon">
            <i className="bi bi-person-badge"></i>
          </div>
          <h3 className="miei-picker-title">Nessun giocatore associato</h3>
          <p className="miei-picker-desc">
            Cerca il tuo profilo atleta per sincronizzare i tornei, le vittorie e visualizzare la mappa dei tornei disputati.
          </p>
          <div className="miei-search-box">
            <input
              type="search"
              className="tornei-controls-search"
              placeholder="Cerca per cognome o nome..."
              value={athleteSearchQuery}
              onChange={(e) => setAthleteSearchQuery(e.target.value)}
              autoFocus
            />
            {athleteSearchLoading && (
              <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span className="spinner-border spinner-border-sm me-2"></span>Ricerca in corso...
              </div>
            )}
            {athleteSearchResults.length > 0 && (
              <div className="miei-search-results">
                {athleteSearchResults.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="miei-search-item"
                    onClick={() => handleSelectAthlete(a)}
                  >
                    <span>
                      <strong>{a.value || a.label}</strong>
                      {a.tessera ? ` (#${a.tessera})` : ''}
                    </span>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tornei-explorer miei-tornei-explorer">
        <aside className="tornei-map-column">
          <TorneiItalyMap
            groups={myMapGroups}
            selection={myMapSelection}
            onSelectionChange={setMyMapSelection}
            onShowList={handleShowList}
            focusRegion={myFocusRegion}
            mapTitle={
              myFocusRegion
                ? `I tuoi tornei (${myFocusRegion})`
                : myDistinctRegions.length > 1
                  ? 'I tuoi tornei in Italia'
                  : 'Mappa dei tuoi tornei'
            }
          />
        </aside>

        <section className="tornei-list-column" ref={torneiListRef}>
          <div className="miei-profile-banner">
            <div className="miei-profile-left">
              <div className="miei-profile-avatar">
                <AthleteAvatar
                  atletaId={myPlayerId}
                  nome={myPlayerName || 'Giocatore'}
                  size={38}
                />
              </div>
              <div className="miei-profile-text">
                <div className="miei-profile-name">{myPlayerName || 'Il Tuo Profilo'}</div>
                <div className="miei-profile-sub">
                  {myAthleteDetail?.anagrafica?.societa || 'Atleta FITeT'}
                  {myAthleteDetail?.anagrafica?.categoria ? ` • ${myAthleteDetail.anagrafica.categoria}` : ''}
                </div>
              </div>
            </div>
            {/* TODO */}
            {/* <button
              type="button"
              className="miei-change-btn"
              onClick={() => setIsChangingAthlete((v) => !v)}
            >
              <i className="bi bi-person-gear"></i>
              <span>{isChangingAthlete ? 'Chiudi' : 'Cambia'}</span>
            </button> */}
          </div>

          {isChangingAthlete && (
            <div className="miei-picker-card" style={{ marginBottom: '12px' }}>
              <div className="miei-search-box">
                <input
                  type="search"
                  className="tornei-controls-search"
                  placeholder="Cerca un altro atleta..."
                  value={athleteSearchQuery}
                  onChange={(e) => setAthleteSearchQuery(e.target.value)}
                  autoFocus
                />
                {athleteSearchLoading && (
                  <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span className="spinner-border spinner-border-sm me-2"></span>Ricerca in corso...
                  </div>
                )}
                {athleteSearchResults.length > 0 && (
                  <div className="miei-search-results">
                    {athleteSearchResults.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="miei-search-item"
                        onClick={() => handleSelectAthlete(a)}
                      >
                        <span>
                          <strong>{a.value || a.label}</strong>
                          {a.tessera ? ` (#${a.tessera})` : ''}
                        </span>
                        <i className="bi bi-chevron-right text-muted"></i>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="miei-summary-strip">
            <span>
              {myTornei.length} {myTornei.length === 1 ? 'torneo' : 'tornei'} disputati
            </span>
            <div className="miei-summary-pills">
              <span className="miei-summary-pill">
                <i className="bi bi-geo-alt"></i>
                {myDistinctRegions.length} {myDistinctRegions.length === 1 ? 'regione' : 'regioni'}
              </span>
              <span className="miei-summary-pill">
                <i className="bi bi-check2-circle text-success"></i>
                {totalVittorie}V
              </span>
              <span className="miei-summary-pill">
                <i className="bi bi-x-circle text-danger"></i>
                {totalSconfitte}S
              </span>
            </div>
          </div>

          {myMapSelection.region && (
            <div className="tornei-active-filter-banner">
              <span>
                Filtrato per: <strong>{myMapSelection.label || myMapSelection.region}</strong> (
                {visibleMyTornei.length}{' '}
                {visibleMyTornei.length === 1 ? 'torneo' : 'tornei'})
              </span>
              <button
                type="button"
                className="btn-clear-filter"
                onClick={() => setMyMapSelection(EMPTY_MAP_SELECTION)}
              >
                <i className="bi bi-x-circle"></i>
              </button>
            </div>
          )}

          {visibleMyTornei.length === 0 ? (
            <div className="tornei-empty-card">
              <i className="bi bi-trophy tornei-empty-icon"></i>
              <h3>Nessun torneo trovato</h3>
              <p>
                {myTornei.length === 0
                  ? `Non risultano tornei con partite registrate nel ranking per ${myPlayerName} nella stagione corrente.`
                  : 'Nessun torneo corrisponde al filtro selezionato sulla mappa.'}
              </p>
              {myMapSelection.region && (
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setMyMapSelection(EMPTY_MAP_SELECTION)}
                >
                  Mostra tutti i tornei
                </button>
              )}
            </div>
          ) : (
            <div className="miei-tornei-list">
              {visibleMyTornei.map((item) => {
                const isExpanded = expandedMyTorneoKeys.has(item.key);
                return (
                  <article key={item.key} className="miei-torneo-card">
                    <div
                      className="miei-torneo-header"
                    >
                      <div className="miei-torneo-top">
                        <span className="miei-torneo-date">
                          <i className="bi bi-calendar3"></i> {item.data}
                        </span>
                        <div className="miei-torneo-badges">
                          <span className="miei-wl-badge is-win">
                            {item.vittorie}V
                          </span>
                          <span className="miei-wl-badge is-loss">
                            {item.sconfitte}S
                          </span>
                        </div>
                      </div>
                      <h4 className="miei-torneo-title">{item.torneoName}</h4>
                      <div className="miei-torneo-meta">
                        <span className="miei-torneo-place">
                          <i className="bi bi-geo-alt-fill text-primary"></i> {item.luogo}
                          {item.regione && item.regione !== 'Nazionale' ? ` (${item.regione})` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => goToTorneo(item)}
                        className="btn btn-primary mt-2 w-100 d-flex align-items-center justify-content-center gap-2"
                        disabled={loadingTorneoKey === item.key}
                        title="Apri il tabellone e le gare di questo torneo"
                      >
                        {loadingTorneoKey === item.key ? (
                          <>
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            <span>Caricamento torneo in corso...</span>
                          </>
                        ) : (
                          <>
                            <i className="bi bi-diagram-3-fill" aria-hidden="true"></i>
                            <span>Vai al torneo</span>
                          </>
                        )}
                      </button>
                      <div className='text-right' onClick={() => toggleTorneoExpanded(item.key)}
                      >
                        <span className="miei-torneo-expand-hint" >
                          <span>{isExpanded ? 'Nascondi partite' : `Anteprima ${item.partite.length} partite`}</span>
                          <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                        </span>
                      </div>
                    </div>
                    {item.matchedTorneo && (
                      <div className="miei-torneo-actions miei-torneo-actions--quick">
                        <button
                          type="button"
                          className="btn-action btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTorneo(item.matchedTorneo!);
                          }}
                        >
                          <i className="bi bi-diagram-3"></i>
                          <span>Apri torneo</span>
                        </button>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="miei-torneo-body">
                        <div className="miei-matches-table-wrap">
                          <table className="miei-matches-table">
                            <thead>
                              <tr>
                                <th>Ris</th>
                                <th>Avversario</th>
                                <th>Fase / Gara</th>
                                <th>Punti</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.partite.map((p, pIdx) => (
                                <tr key={pIdx}>
                                  <td>
                                    <span className={`miei-result-chip ${p.isVittoria ? 'is-v' : 'is-s'}`}>
                                      {p.risultato || (p.isVittoria ? 'V' : 'S')}
                                    </span>
                                  </td>
                                  <td>
                                    {p.avversarioId ? (
                                      <button
                                        type="button"
                                        className="miei-opponent-link"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenAtletaModal(p.avversarioId!, p.avversario);
                                        }}
                                      >
                                        {p.avversario}
                                      </button>
                                    ) : (
                                      <span>{p.avversario || '-'}</span>
                                    )}
                                  </td>
                                  <td>
                                    <div><strong>{p.fase || '-'}</strong></div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.gara || '-'}</div>
                                  </td>
                                  <td>
                                    <span style={{ fontWeight: 600, color: p.isVittoria ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                                      {p.risultatoSet || '-'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  };

  return shell(
    <>
      {portalView !== 'miei' && (
        <div className="controls tornei-controls">
          <div className="controls-left tornei">
            <select
              id="tornei-region-select"
              value={comitId}
              onChange={(e) => handleRegionChange(Number(e.target.value))}
              aria-label="Filtra per regione"
            >
              {REGIONS_COMIT.map((reg) => (
                <option key={reg.id} value={reg.id}>
                  {reg.name}
                </option>
              ))}
            </select>

            <select
              id="tornei-category-select"
              value={categoryKey}
              onChange={(e) => handleCategoryChange(e.target.value)}
              aria-label="Filtra per categoria"
            >
              <optgroup label="Panoramica">
                <option value="all">Tutti i Tornei Attivi</option>
              </optgroup>
              <optgroup label="Tornei Nazionali Top">
                {getTorneiCategoriesByGroup('top').map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Tornei Open Interregionali">
                {getTorneiCategoriesByGroup('open').map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Manifestazioni Nazionali">
                {getTorneiCategoriesByGroup('nazionali').map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Tornei Regionali">
                <option value="reg_all">Tutti i Tornei della Regione</option>
                {getTorneiCategoriesByGroup('regionali').map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            </select>

            <input
              type="search"
              className="tornei-controls-search"
              placeholder="Cerca località o data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cerca torneo per località o data"
            />
          </div>
        </div>
      )}

      <div className={`tornei-view-container ${torneiSlide}`}>
        {loading && !refreshing ? (
          loadingState
        ) : error ? (
          errorState
        ) : portalView === 'miei' && myPlayerId ? (
          renderMyTorneiView()
        ) : portalView === 'mappa' ? (
          torneiByRegion.length === 0 ? (
            emptyAll
          ) : (
            <div className="tornei-explorer">
              <aside className="tornei-map-column">
                <TorneiItalyMap
                  groups={torneiByRegion}
                  selection={mapSelection}
                  onSelectionChange={handleMapSelectionChange}
                  onShowList={handleShowList}
                />
              </aside>

              {visibleTorneiByRegion.length > 0 ? (
                renderTorneiList(visibleTorneiByRegion, {
                  withMapBanner: true,
                  title: listTitle,
                  subtitle: listSubtitle,
                })
              ) : (
                <section className="tornei-list-column" ref={torneiListRef}>
                  <div className="tornei-empty-card tornei-map-empty-list">
                    <i className="bi bi-geo-alt tornei-empty-icon"></i>
                    <h3>Nessun torneo per questo filtro</h3>
                    <p>
                      La mappa non ha tornei corrispondenti a{' '}
                      <strong>{mapSelection.label || mapSelection.region}</strong> con i filtri
                      attuali.
                    </p>
                    <button
                      type="button"
                      className="btn-action"
                      onClick={() => handleMapSelectionChange(EMPTY_MAP_SELECTION)}
                    >
                      <i className="bi bi-arrow-left" aria-hidden="true"></i>
                      Mostra tutti i tornei
                    </button>
                  </div>
                </section>
              )}
            </div>
          )
        ) : torneiByRegion.length === 0 ? (
          emptyStatus
        ) : (
          renderTorneiList(torneiByRegion, {
            withMapBanner: false,
            title: listTitle,
            subtitle: listSubtitle,
          })
        )}
      </div>
      {renderDetailModal()}
    </>
  );
};
