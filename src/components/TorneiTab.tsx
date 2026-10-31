import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  TorneiResponse,
  TorneoItem,
  TorneoDettaglioResponse,
  TorneoGaraLink,
  TorneoGaraDettaglioResponse,
} from '../types/fitet';
import {
  TorneoGroupKey,
  TORNEI_GROUPS,
  TORNEI_CATEGORIES,
  getTorneoCategoryByKey,
  getTorneiCategoriesByGroup,
} from '../constants/torneiCategories';
import { REGIONS_COMIT } from './ClassificheRankingTab';
import { fetchTornei, fetchTorneoDettaglio, fetchTorneoGara } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import { TorneoBracket, BracketRoundData } from './TorneoBracket';
import {
  EMPTY_MAP_SELECTION,
  TorneiItalyMap,
  TorneiMapSelection,
} from './TorneiItalyMap';
import { getTorneoPlace, regionMatches } from '../utils/torneoMap';
import './ClassificheRankingTab.css';
import './TorneiTab.css';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'disputato' | 'in_programma'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapSelection, setMapSelection] = useState<TorneiMapSelection>(EMPTY_MAP_SELECTION);
  const torneiListRef = useRef<HTMLDivElement | null>(null);

  const [data, setData] = useState<TorneiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Tournament Detail State
  const [selectedTorneo, setSelectedTorneo] = useState<TorneoItem | null>(null);
  const [torneoDettaglio, setTorneoDettaglio] = useState<TorneoDettaglioResponse | null>(null);
  const [loadingDettaglio, setLoadingDettaglio] = useState<boolean>(false);

  // Selected Gara inside Tournament
  const [selectedGara, setSelectedGara] = useState<TorneoGaraLink | null>(null);
  const [garaData, setGaraData] = useState<TorneoGaraDettaglioResponse | null>(null);
  const [loadingGara, setLoadingGara] = useState<boolean>(false);
  const [garaPhaseTab, setGaraPhaseTab] = useState<'tabellone' | 'gironi' | 'iscritti'>('tabellone');
  const [garaSearchQuery, setGaraSearchQuery] = useState<string>('');
  const [bracketViewMode, setBracketViewMode] = useState<'bracket' | 'cards'>('bracket');
  const [bracketLoading, setBracketLoading] = useState<boolean>(false);
  const [fullBracketCache, setFullBracketCache] = useState<{ [garaKey: string]: BracketRoundData[] }>({});

  const activeCategoryDef = getTorneoCategoryByKey(categoryKey);
  const activeGroup: TorneoGroupKey = useMemo(() => {
    if (categoryKey === 'all') return 'all';
    if (categoryKey === 'reg_all') return 'regionali';
    return activeCategoryDef?.group || 'all';
  }, [categoryKey, activeCategoryDef]);

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

  const handleGroupClick = (groupKey: TorneoGroupKey) => {
    setSelectedTorneo(null);
    setMapSelection(EMPTY_MAP_SELECTION);
    if (groupKey === 'all') {
      setCategoryKey('all');
      setRegFilterId(0);
      return;
    }
    if (groupKey === 'regionali') {
      if (comitId === 0) setComitId(4); // Default Lombardia se nessuna regione scelta
      setCategoryKey('reg_all');
      return;
    }
    const groupDef = TORNEI_GROUPS.find((g) => g.key === groupKey);
    if (groupDef) {
      if (groupKey !== 'open') setComitId(0);
      setCategoryKey(groupDef.defaultCategoryKey);
    }
  };

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
    setMapSelection(EMPTY_MAP_SELECTION);
    setComitId(newComit);
    setRegFilterId(newComit);
    if (newComit > 0 && categoryKey !== 'open' && !categoryKey.startsWith('reg_') && categoryKey !== 'all') {
      setCategoryKey('reg_all');
    } else if (newComit === 0 && categoryKey.startsWith('reg_')) {
      setCategoryKey('all');
    }
  };

  const handleShowList = () => {
    torneiListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Sub-categories for the active macro group
  const currentGroupCategories = useMemo(() => {
    if (activeGroup === 'all' || activeGroup === 'open') return [];
    return getTorneiCategoriesByGroup(activeGroup);
  }, [activeGroup]);

  // Open available regions from `TOR=0&COMIT=30&ID=36`
  const openAvailableRegions = useMemo(() => {
    if (!data?.sections) return [];
    for (const sec of data.sections) {
      if (sec.availableRegions && sec.availableRegions.length > 0) {
        return sec.availableRegions;
      }
    }
    return [];
  }, [data]);

  // Filtered sections based on statusFilter and searchQuery
  const filteredSections = useMemo(() => {
    if (!data?.sections) return [];
    const q = searchQuery.toLowerCase().trim();

    return data.sections
      .map((sec) => {
        const filtered = sec.tornei.filter((t) => {
          if (statusFilter !== 'all' && t.status !== statusFilter) return false;
          if (!q) return true;
          return (
            t.luogo.toLowerCase().includes(q) ||
            t.data.toLowerCase().includes(q) ||
            (t.regione && t.regione.toLowerCase().includes(q)) ||
            sec.title.toLowerCase().includes(q)
          );
        });
        return { ...sec, tornei: filtered };
      })
      .filter((sec) => sec.tornei.length > 0);
  }, [data, statusFilter, searchQuery]);

  const totalFilteredCount = useMemo(() => {
    return filteredSections.reduce((acc, s) => acc + s.tornei.length, 0);
  }, [filteredSections]);

  // Load a single tournament's detail and first competition
  const handleSelectTorneo = async (torneo: TorneoItem) => {
    setSelectedTorneo(torneo);
    setTorneoDettaglio(null);
    setSelectedGara(null);
    setGaraData(null);
    setLoadingDettaglio(true);
    setGaraSearchQuery('');

    try {
      const det = await fetchTorneoDettaglio(torneo.idt, torneo.com, torneo.anno);
      setTorneoDettaglio(det);
      if (det.gare.length > 0) {
        await handleSelectGara(det.gare[0]);
      }
    } catch {
      // Fallback empty
    } finally {
      setLoadingDettaglio(false);
    }
  };

  const handleSelectGara = async (
    gara: TorneoGaraLink,
    customRange?: { cod1: number; cod2: number },
    customTurno?: { tab: number; turno: number }
  ) => {
    setSelectedGara(gara);
    setLoadingGara(true);
    try {
      const res = await fetchTorneoGara({
        idt: gara.idt,
        com: gara.com,
        gara: gara.garaId,
        anno: gara.anno,
        isDoppio: gara.isDoppio,
        mode: gara.mode,
        cod1: customRange?.cod1,
        cod2: customRange?.cod2,
        tab: customTurno?.tab,
        turno: customTurno?.turno,
      });
      setGaraData(res);
      if (!customRange && !customTurno) {
        if (res.mode === 'iscrizioni') {
          setGaraPhaseTab('iscritti');
        } else if (res.partiteTabellone.length > 0) {
          setGaraPhaseTab('tabellone');
        } else if (res.gironi.length > 0) {
          setGaraPhaseTab('gironi');
        } else {
          setGaraPhaseTab('tabellone');
        }
      }
    } catch {
      // Keep previous or empty
    } finally {
      setLoadingGara(false);
    }
  };

  const handleAthleteClick = (atletaId: string | null | undefined, nome: string) => {
    const clean = (nome || '').trim();
    if (!clean) return;
    // Se è un doppio (es. "ROSSI MARIO / BIANCHI LUCA"), apri il primo atleta
    const primaryName = clean.includes('/') ? clean.split('/')[0].trim() : clean;
    onOpenAtletaModal(atletaId || primaryName, primaryName);
  };

  const selectedRegionName =
    REGIONS_COMIT.find((r) => r.id === comitId)?.name || 'Tutte (Nazionale)';

  const headerTitle = activeCategoryDef
    ? activeCategoryDef.label
    : categoryKey === 'reg_all'
      ? `Tornei Regionali (${selectedRegionName})`
      : 'Tornei e Manifestazioni FITeT';

  const headerSubtitle = activeCategoryDef
    ? `${activeCategoryDef.description} • ${selectedRegionName}`
    : `Calendario risultati, tabelloni e iscritti • ${selectedRegionName}`;

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
      garaPhaseTab === 'tabellone' &&
      bracketViewMode === 'bracket' &&
      selectedGara &&
      garaData?.turniTabellone &&
      garaData.turniTabellone.length > 0
    ) {
      const garaKey = `${selectedGara.idt}_${selectedGara.com}_${selectedGara.garaId}`;
      if (!fullBracketCache[garaKey]) {
        loadCompleteBracket(selectedGara, garaData.turniTabellone);
      }
    }
  }, [
    garaPhaseTab,
    bracketViewMode,
    selectedGara,
    garaData?.turniTabellone,
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
          if (!reg && t.com > 0) {
            reg = REGIONS_COMIT.find((r) => r.id === t.com)?.name;
          }
          if (!reg) {
            reg = sec.regioneNome || 'Nazionale';
          }
          if (reg.toLowerCase().includes('nazionale') || t.com === 0) {
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

  const workInProgress = false;
  if (workInProgress) return <div className='work-in-progress'>
    <div>
      <img src="/wip.png" alt="Lavori in corso" className="wip mb-3 w-25" />
    </div>
  </div>;

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left tornei">
          <div className="filter-btn-group">
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Tutti
            </button>
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'disputato' ? 'active' : ''}`}
              onClick={() => setStatusFilter('disputato')}
            >
              Risultati
            </button>
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'in_programma' ? 'active' : ''}`}
              onClick={() => setStatusFilter('in_programma')}
            >
              In Programma
            </button>
          </div>

          <select
            id="tornei-region-select"
            value={comitId}
            onChange={(e) => handleRegionChange(Number(e.target.value))}
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
        </div>
      </div>

      <div className="ranking-tab-container">

        {/* Selected Tournament Interactive Detail View */}
        {selectedTorneo ? (
          <div className="ranking-card-block ranking-table-card">
            <div className="ranking-section-header official-header">
              <div className="official-title-group">
                <span className="official-crown">
                  <i className="bi bi-trophy-fill text-warning"></i>
                </span>
                <div>
                  <div className="official-main-title">
                    {torneoDettaglio?.titolo || `${selectedTorneo.luogo} (${selectedTorneo.data})`}
                  </div>
                  <div className="official-subtitle-text">
                    {torneoDettaglio?.sottotitolo || `${selectedTorneo.data} • ${selectedTorneo.luogo}`}
                    {selectedTorneo.regione ? ` • ${selectedTorneo.regione}` : ''}
                  </div>
                </div>
              </div>

              <div className="official-badge-group">
                <button
                  type="button"
                  className="ranking-refresh-btn"
                  onClick={() => setSelectedTorneo(null)}
                >
                  <i className="bi bi-arrow-left me-1"></i>
                  Torna Indietro
                </button>
              </div>
            </div>

            {/* Document Links & Gare Selector */}
            <div className="torneo-detail-banner">
              <div className="torneo-detail-links">
                {torneoDettaglio?.pdfSinteticoUrl && (
                  <a
                    href={torneoDettaglio.pdfSinteticoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="torneo-doc-link"
                  >
                    <i className="bi bi-file-earmark-pdf-fill text-danger"></i>
                  </a>
                )}
                {torneoDettaglio?.tabelloniHomeUrl && (
                  <a
                    href={torneoDettaglio.tabelloniHomeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="torneo-doc-link"
                  >
                    <i className="bi bi-diagram-3-fill text-success"></i>
                    <span>Tabelloni Ufficiali</span>
                  </a>
                )}
                <a
                  href={selectedTorneo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="torneo-doc-link"
                >
                  <i className="bi bi-box-arrow-up-right"></i>
                  <span>Pagina FITeT</span>
                </a>
              </div>

              {torneoDettaglio && torneoDettaglio.gare.length > 0 && (
                <div className="ranking-subchips-list">
                  {torneoDettaglio.gare.map((g) => (
                    <button
                      key={g.garaId}
                      type="button"
                      className={`ranking-subchip-btn ${selectedGara?.garaId === g.garaId ? 'is-active' : ''}`}
                      onClick={() => handleSelectGara(g)}
                    >
                      <i className={`bi ${g.isDoppio ? 'bi-people-fill' : 'bi-person-fill'} me-1`}></i>
                      {g.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Body of the selected Gara */}
            {loadingDettaglio || loadingGara ? (
              <div className="ranking-loading-state" style={{ border: 'none', borderRadius: 0 }}>
                <div className="spinner-border text-primary" role="status" style={{ width: '2.2rem', height: '2.2rem' }}>
                  <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="ranking-loading-text">Caricamento dati gara dal portale FITeT...</p>
              </div>
            ) : garaData ? (
              <div className="tornei-cards-body">
                {/* Winner Banner if available */}
                {garaData.vincitore && (
                  <div className="torneo-winner-banner" style={{ margin: '0 0 12px' }}>
                    <div className="athlete-row-cell">
                      <AthleteAvatar
                        atletaId={garaData.vincitoreId || undefined}
                        nome={garaData.vincitore}
                        size={36}
                        className="ranking-athlete-avatar"
                      />
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          <i className="bi bi-trophy-fill me-1"></i> 1° Classificato • {garaData.titoloGara}
                        </div>
                        <button
                          type="button"
                          className="athlete-link-btn"
                          onClick={() => handleAthleteClick(garaData.vincitoreId, garaData.vincitore!)}
                        >
                          <span>{garaData.vincitore}</span>
                          <i className="bi bi-arrow-up-right athlete-link-arrow"></i>
                        </button>
                      </div>
                    </div>
                    {garaData.valoreRanking && (
                      <span className="section-badge">Valore Ranking: {garaData.valoreRanking}</span>
                    )}
                  </div>
                )}

                {/* Phase Switcher if mode === 'risultati' */}
                {garaData.mode === 'risultati' && (garaData.turniTabellone.length > 0 || garaData.gironiRanges.length > 0) && (
                  <div className="controls" style={{ marginBottom: '12px', borderRadius: '8px' }}>
                    <div className="controls-left">
                      <div className="ranking-gender-group">
                        {garaData.turniTabellone.length > 0 && (
                          <button
                            type="button"
                            className={`ranking-gender-btn ${garaPhaseTab === 'tabellone' ? 'active' : ''}`}
                            onClick={() => setGaraPhaseTab('tabellone')}
                          >
                            <i className="bi bi-diagram-3-fill me-1"></i>
                            Eliminazione Diretta
                          </button>
                        )}
                        {garaData.gironiRanges.length > 0 && (
                          <button
                            type="button"
                            className={`ranking-gender-btn ${garaPhaseTab === 'gironi' ? 'active' : ''}`}
                            onClick={() => setGaraPhaseTab('gironi')}
                          >
                            <i className="bi bi-grid-3x3-gap-fill me-1"></i>
                            Gironi di Qualificazione
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="controls-right">
                      {garaPhaseTab === 'tabellone' && selectedGara && (
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          {/* Bracket Mode Switcher */}
                          <div className="filter-btn-group">
                            <button
                              type="button"
                              className={`filter-btn ${bracketViewMode === 'bracket' ? 'active' : ''}`}
                              onClick={() => setBracketViewMode('bracket')}
                              title="Visualizza Tabellone Grafico ad albero"
                            >
                              <i className="bi bi-diagram-3-fill me-1"></i>
                              Tabellone
                            </button>
                            <button
                              type="button"
                              className={`filter-btn ${bracketViewMode === 'cards' ? 'active' : ''}`}
                              onClick={() => setBracketViewMode('cards')}
                              title="Visualizza Elenco Incontri per turno"
                            >
                              <i className="bi bi-list-ul me-1"></i>
                              Elenco Partite
                            </button>
                          </div>

                          {bracketViewMode === 'cards' && garaData.turniTabellone.length > 0 && (
                            <div className="ranking-subchips-list">
                              {garaData.turniTabellone.map((t) => {
                                const isAct =
                                  garaData.activeTurno?.turno === t.turno &&
                                  garaData.activeTurno?.tab === t.tab;
                                return (
                                  <button
                                    key={`${t.tab}-${t.turno}`}
                                    type="button"
                                    className={`ranking-subchip-btn ${isAct ? 'is-active' : ''}`}
                                    onClick={() => handleSelectGara(selectedGara, undefined, { tab: t.tab, turno: t.turno })}
                                  >
                                    {t.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {garaPhaseTab === 'gironi' && garaData.gironiRanges.length > 0 && selectedGara && (
                        <div className="ranking-subchips-list">
                          <span className="subchips-label me-1">Gironi:</span>
                          {garaData.gironiRanges.map((gr) => {
                            const isAct =
                              garaData.activeGironiRange?.cod1 === gr.cod1 &&
                              garaData.activeGironiRange?.cod2 === gr.cod2;
                            return (
                              <button
                                key={`${gr.cod1}-${gr.cod2}`}
                                type="button"
                                className={`ranking-subchip-btn ${isAct ? 'is-active' : ''}`}
                                onClick={() => handleSelectGara(selectedGara, { cod1: gr.cod1, cod2: gr.cod2 })}
                              >
                                {gr.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 1. TABELLONE ELIMINAZIONE DIRETTA */}
                {garaData.mode === 'risultati' && garaPhaseTab === 'tabellone' && (
                  <div>
                    {bracketViewMode === 'bracket' ? (
                      bracketLoading ? (
                        <div className="bracket-loading-box">
                          <div
                            className="spinner-border text-primary"
                            role="status"
                            style={{ width: '2.5rem', height: '2.5rem' }}
                          >
                            <span className="visually-hidden">Caricamento tabellone completo...</span>
                          </div>
                          <p className="mt-3 mb-1 fw-bold fs-6">Generazione del tabellone completo in corso...</p>
                          <small className="text-muted">
                            Scaricamento di tutte le partite dei turni ({garaData.turniTabellone.map((t) => t.label).join(' • ')})
                          </small>
                        </div>
                      ) : (
                        <TorneoBracket
                          rounds={currentFullBracketRounds}
                          competitionName={
                            garaData.titoloGara || selectedGara?.nome || 'Tabellone Eliminazione Diretta'
                          }
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
                      <div className="ranking-no-results-box">
                        Nessun incontro registrato per questo turno. Seleziona un altro turno o consulta i Gironi di Qualificazione.
                      </div>
                    )}
                  </div>
                )}

                {/* 2. GIRONI DI QUALIFICAZIONE */}
                {garaData.mode === 'risultati' && garaPhaseTab === 'gironi' && (
                  <div className="tornei-sections-stack">
                    {garaData.gironi.length > 0 ? (
                      garaData.gironi.map((gir) => (
                        <div key={gir.numero} className="giornata-section" style={{ marginBottom: '16px' }}>
                          <div className="giornata-header-banner" style={{ marginBottom: '10px', background: 'var(--bg-th)' }}>
                            <div className="giornata-title-group">
                              <span className="giornata-badge-pill">Girone {gir.numero}</span>
                              <span className="giornata-phase-text">Classifica e Incontri</span>
                            </div>
                            <span className="giornata-meta-count">{gir.partite.length} incontri</span>
                          </div>

                          {gir.classifica.length > 0 && (
                            <div className="table-responsive" style={{ marginBottom: '12px' }}>
                              <table className="ranking-table">
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
                                      className="ranking-row"
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
                                            className="ranking-athlete-avatar"
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
                        </div>
                      ))
                    ) : (
                      <div className="ranking-no-results-box">
                        Nessun girone trovato per questo intervallo.
                      </div>
                    )}
                  </div>
                )}

                {/* 3. ELENCO ISCRITTI GARA */}
                {garaData.mode === 'iscrizioni' && (
                  <div>
                    <div className="controls" style={{ marginBottom: '10px', borderRadius: '8px' }}>
                      <div className="controls-left">
                        <strong>{garaData.titoloGara}</strong>
                        <span className="giornata-meta-count">
                          {garaData.iscritti.length} iscritti
                          {garaData.maxIscritti ? ` (max ${garaData.maxIscritti})` : ''}
                        </span>
                      </div>
                      <div className="controls-right">
                        <div className="ranking-search-inner">
                          <i className="bi bi-search ranking-search-icon"></i>
                          <input
                            type="text"
                            className="ranking-search-input"
                            placeholder="Cerca atleta o società..."
                            value={garaSearchQuery}
                            onChange={(e) => setGaraSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {filteredIscritti.length > 0 ? (
                      <div className="table-responsive">
                        <table className="ranking-table">
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
                                  className="ranking-row"
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
                                        className="ranking-athlete-avatar"
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
                      <div className="ranking-no-results-box">
                        Nessun iscritto pubblicato al momento per questa gara.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="ranking-no-results-box">
                Seleziona una gara sopra oppure apri il documento PDF dei dati sintetici.
              </div>
            )}
          </div>
        ) : loading && !refreshing ? (
          <div className="ranking-loading-state">
            <div className="spinner-border text-primary" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
              <span className="visually-hidden">Caricamento...</span>
            </div>
            <p className="ranking-loading-text">Caricamento calendario e risultati tornei FITeT...</p>
          </div>
        ) : error ? (
          <div className="ranking-error-card">
            <div className="ranking-error-icon">
              <i className="bi bi-exclamation-triangle-fill"></i>
            </div>
            <h3>Impossibile caricare i tornei</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn-action"
              onClick={() => loadTornei(categoryKey, comitId, regFilterId, true)}
            >
              <i className="bi bi-arrow-clockwise me-1"></i>
              Riprova
            </button>
          </div>
        ) : torneiByRegion.length > 0 ? (
          <div className="tornei-explorer">
            <aside className="tornei-map-column">
              <TorneiItalyMap
                groups={torneiByRegion}
                selection={mapSelection}
                onSelectionChange={setMapSelection}
                onShowList={handleShowList}
              />
            </aside>

            <section className="tornei-list-column" ref={torneiListRef}>
              {mapSelection.region && (
                <div className="tornei-map-filter-banner">
                  <div className="tornei-map-filter-text">
                    <i className="bi bi-funnel-fill"></i>
                    <span>
                      Filtro mappa: <strong>{mapSelection.label || mapSelection.region}</strong>
                      <span className="tornei-map-filter-count">
                        {visibleTorneiCount}{' '}
                        {visibleTorneiCount === 1 ? 'torneo' : 'tornei'}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="tornei-map-filter-clear"
                    onClick={() => setMapSelection(EMPTY_MAP_SELECTION)}
                  >
                    <i className="bi bi-x-lg"></i>
                    <span>Mostra tutti</span>
                  </button>
                </div>
              )}

              <div className="tornei-list-heading">
                <div>
                  <h3>{headerTitle}</h3>
                  <p>{headerSubtitle}</p>
                </div>
                <span className="tornei-list-count">
                  {visibleTorneiCount}{' '}
                  {visibleTorneiCount === 1 ? 'torneo' : 'tornei'}
                </span>
              </div>

              {visibleTorneiByRegion.length > 0 ? (
                <div className="torneo-regions-list">
                  {visibleTorneiByRegion.map((group) => (
                    <div key={group.region} className="torneo-region-card">
                      <div className="torneo-region-header">
                        <div className="d-flex align-items-center gap-2">
                          <i
                            className={`bi ${group.region === 'Nazionale'
                                ? 'bi-trophy-fill text-warning'
                                : 'bi-geo-alt-fill text-primary'
                              }`}
                          ></i>
                          <span>{group.region}</span>
                        </div>
                        <span className="torneo-region-badge">
                          {group.items.length} {group.items.length === 1 ? 'torneo' : 'tornei'}
                        </span>
                      </div>

                      <div className="torneo-rows-container">
                        {group.items.map(({ torneo, sectionTitle }) => (
                          <div
                            key={`${torneo.com}-${torneo.idt}-${torneo.tipo}`}
                            className="torneo-row"
                            onClick={() => handleSelectTorneo(torneo)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectTorneo(torneo);
                              }
                            }}
                          >
                            <div className="torneo-row-date">
                              <i className="bi bi-calendar3 me-1 text-muted"></i>
                              <span>{torneo.data}</span>
                            </div>

                            <div className="torneo-row-info">
                              <div className="torneo-row-title">{torneo.luogo}</div>
                              {sectionTitle && (
                                <div className="torneo-row-meta">{sectionTitle}</div>
                              )}
                            </div>

                            <div className="torneo-row-badge-wrap">
                              <span
                                className={`torneo-status-pill ${torneo.status === 'disputato'
                                    ? 'status-disputato'
                                    : 'status-programma'
                                  }`}
                              >
                                <i
                                  className={`bi ${torneo.status === 'disputato'
                                      ? 'bi-check2'
                                      : 'bi-clock'
                                    } me-1`}
                                ></i>
                                {torneo.status === 'disputato'
                                  ? 'Risultati'
                                  : 'In Programma'}
                              </span>
                            </div>

                            <div className="torneo-row-chevron">
                              <i className="bi bi-chevron-right"></i>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ranking-empty-card tornei-map-empty-list">
                  <i className="bi bi-geo-alt ranking-empty-icon"></i>
                  <h3>Nessun torneo per questo filtro</h3>
                  <p>
                    La mappa non ha tornei corrispondenti a{' '}
                    <strong>{mapSelection.label || mapSelection.region}</strong> con i filtri
                    attuali.
                  </p>
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => setMapSelection(EMPTY_MAP_SELECTION)}
                  >
                    <i className="bi bi-arrow-left me-1"></i>
                    Mostra tutti i tornei
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="ranking-empty-card">
            <i className="bi bi-trophy ranking-empty-icon"></i>
            <h3>Nessun torneo trovato</h3>
            <p>
              Non ci sono tornei pubblicati per i filtri selezionati ({headerTitle} • {selectedRegionName}).
            </p>
            <button
              type="button"
              className="btn-action"
              onClick={() => {
                setCategoryKey('all');
                setComitId(0);
                setRegFilterId(0);
                setStatusFilter('all');
                setSearchQuery('');
              }}
            >
              <i className="bi bi-arrow-left me-1"></i>
              Mostra Tutti i Tornei Attivi
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
