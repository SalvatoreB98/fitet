import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { fetchTornei, fetchTorneoDettaglio, fetchTorneoGara } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import { TorneoBracket, BracketRoundData } from './TorneoBracket';
import {
  EMPTY_MAP_SELECTION,
  TorneiItalyMap,
  TorneiMapSelection,
} from './TorneiItalyMap';
import {
  getTorneoHostRegion,
  getTorneoPlace,
  regionMatches,
} from '../utils/torneoMap';
import './ClassificheRankingTab.css';
import './TorneiTab.css';

type TorneiPortalView = 'mappa' | 'risultati' | 'programma';
type GaraPhase = 'tabellone' | 'gironi' | 'iscritti';

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
}

export const TorneiTab: React.FC<TorneiTabProps> = ({ onOpenAtletaModal }) => {
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
  const [portalView, setPortalView] = useState<TorneiPortalView>('mappa');
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
  const [bracketViewMode, setBracketViewMode] = useState<'bracket' | 'cards'>('bracket');
  const [bracketLoading, setBracketLoading] = useState<boolean>(false);
  const [fullBracketCache, setFullBracketCache] = useState<{ [garaKey: string]: BracketRoundData[] }>({});

  const activeCategoryDef = getTorneoCategoryByKey(categoryKey);

  const statusFilter: 'all' | 'disputato' | 'in_programma' =
    portalView === 'mappa' ? 'all' : portalView === 'risultati' ? 'disputato' : 'in_programma';

  const scrollToRoot = () => {
    window.requestAnimationFrame(() => {
      torneiRootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  const handlePortalViewChange = (view: TorneiPortalView) => {
    if (view === portalView) return;
    setPortalView(view);
    scrollToRoot();
  };

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

    return { mappa, risultati, programma };
  }, [searchFilteredSections]);

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
    if (phase === 'iscritti') setGaraSearchQuery('');
    scrollToRoot();
  };

  const backToTornei = () => {
    setSelectedTorneo(null);
    setTorneoDettaglio(null);
    setDettaglioError(null);
    setSelectedGara(null);
    setGaraData(null);
    setGaraPhaseTab(null);
    scrollToRoot();
  };

  const backToTorneo = () => {
    setSelectedGara(null);
    setGaraData(null);
    setGaraPhaseTab(null);
    setGaraSearchQuery('');
    scrollToRoot();
  };

  const backToGara = () => {
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

  const filteredIscritti = useMemo(() => {
    if (!garaData?.iscritti) return [];
    const q = garaSearchQuery.toLowerCase().trim();
    if (!q) return garaData.iscritti;
    return garaData.iscritti.filter(
      (i) =>
        i.nome.toLowerCase().includes(q) ||
        i.societa.toLowerCase().includes(q) ||
        i.statusLabel.toLowerCase().includes(q)
    );
  }, [garaData?.iscritti, garaSearchQuery]);

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

  const workInProgress = false;
  if (workInProgress) {
    return (
      <div className='work-in-progress'>
        <div>
          <img src="/wip.png" alt="Lavori in corso" className="wip mb-3 w-25" />
        </div>
      </div>
    );
  }

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
      <span className="tornei-step-indicator">Passo {step} di 3</span>
    </div>
  );

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
  // STEP 3 - Fase (tabellone / gironi / iscritti)
  // ---------------------------------------------------------------------------
  if (selectedTorneo && selectedGara && garaPhaseTab) {
    return shell(
      <div className="tornei-detail">
        {renderStepBar('Torna alla gara', 3, backToGara)}

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
                  onClick={() => setBracketViewMode('cards')}
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
                {garaData.gironi.map((gir) => (
                  <section key={gir.numero} className="tornei-girone">
                    <div className="tornei-girone-head">
                      <div>
                        <span className="tornei-girone-title">Girone {gir.numero}</span>
                        <span className="tornei-girone-sub">Classifica e incontri</span>
                      </div>
                      <span className="tornei-girone-count">{gir.partite.length} incontri</span>
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
                                className="tornei-table-row"
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

                    <div className="match-cards-grid">
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
                  </section>
                ))}
              </div>
            ) : (
              <div className="tornei-empty-box">Nessun girone trovato per questo intervallo.</div>
            )}
            </div>
          </>
        )}

        {garaPhaseTab === 'iscritti' && garaData && (
          <>
            <div className="tornei-phase-toolbar">
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
                      <th className="th-rank">#</th>
                      <th className="th-athlete">Atleta</th>
                      <th className="th-provincia hide-xs">Società</th>
                      <th className="th-points text-end">Punti</th>
                      <th className="th-cat text-center">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIscritti.map((iscr) => {
                      const statusCls = iscr.statusClass.includes('diritto')
                        ? 'is-diritto'
                        : iscr.statusClass.includes('no_ammessi')
                          ? 'is-no-ammesso'
                          : iscr.statusClass.includes('wd')
                            ? 'is-wd'
                            : '';
                      return (
                        <tr
                          key={`${iscr.posizione}-${iscr.nome}`}
                          className="tornei-table-row"
                          onClick={() => handleAthleteClick(iscr.atletaId, iscr.nome)}
                        >
                          <td className="td-rank">
                            <span className={`rank-badge rank-badge-${iscr.posizione <= 3 ? iscr.posizione : 'default'}`}>
                              {iscr.posizione}
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
                            <span className="badge-points-official">{iscr.punti || '-'}</span>
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
  }

  // ---------------------------------------------------------------------------
  // STEP 2 - Gara (scelta della fase)
  // ---------------------------------------------------------------------------
  if (selectedTorneo && selectedGara) {
    const torneoName =
      torneoDettaglio?.titolo || `${selectedTorneo.luogo} (${selectedTorneo.data})`;

    return shell(
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
  }

  // ---------------------------------------------------------------------------
  // STEP 1 - Torneo (elenco gare)
  // ---------------------------------------------------------------------------
  if (selectedTorneo) {
    const torneoTitle =
      torneoDettaglio?.titolo || `${selectedTorneo.luogo} (${selectedTorneo.data})`;
    const torneoSubtitle =
      torneoDettaglio?.sottotitolo || `${selectedTorneo.data} • ${selectedTorneo.luogo}`;

    return shell(
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
              <i className="bi bi-file-earmark-pdf" aria-hidden="true"></i>
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

  // ---------------------------------------------------------------------------
  // PORTAL - Mappa / Risultati / Programma
  // ---------------------------------------------------------------------------
  const portalTabs: Array<{ key: TorneiPortalView; label: string }> = [
    { key: 'mappa', label: 'Mappa' },
    { key: 'risultati', label: 'Risultati' },
    { key: 'programma', label: 'Programma' },
  ];

  return shell(
    <>
      <nav className="tornei-portal-nav" aria-label="Sezioni tornei">
        {portalTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tornei-portal-tab ${portalView === tab.key ? 'is-active' : ''}`}
            onClick={() => handlePortalViewChange(tab.key)}
            aria-current={portalView === tab.key ? 'page' : undefined}
          >
            <span className="tornei-portal-tab-label">{tab.label}</span>
            <span className="tornei-portal-tab-count">{portalCounts[tab.key]}</span>
          </button>
        ))}
      </nav>

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

      {loading && !refreshing ? (
        loadingState
      ) : error ? (
        errorState
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
    </>
  );
};
