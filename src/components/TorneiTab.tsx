import React, { useState, useEffect, useMemo } from 'react';
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
    if (newComit > 0 && categoryKey !== 'open' && !categoryKey.startsWith('reg_') && categoryKey !== 'all') {
      setCategoryKey('reg_all');
    } else if (newComit === 0 && categoryKey.startsWith('reg_')) {
      setCategoryKey('all');
    }
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
  const workInProgress = true;
  if (workInProgress) return <div className='work-in-progress'>
    <div>
      <img src="/wip.png" alt="Lavori in corso" className="wip mb-3 w-25" />
    </div>
  </div>;
  return (
    <div className="ranking-tab-container">
      {/* Top Filter Card reusing ClassificheRankingTab classes */}
      <div className="ranking-filter-card">
        {/* Row 1: Header with Title, Status Switcher and Refresh */}
        <div className="ranking-filter-header">
          <div className="ranking-header-actions">
            {/* Status Filter Buttons */}
            <div className="ranking-gender-group" role="group" aria-label="Stato tornei">
              <button
                type="button"
                className={`ranking-gender-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Tutti
              </button>
              <button
                type="button"
                className={`ranking-gender-btn ${statusFilter === 'disputato' ? 'active' : ''}`}
                onClick={() => setStatusFilter('disputato')}
              >
                <i className="bi bi-check2-circle me-1"></i>
                Risultati
              </button>
              <button
                type="button"
                className={`ranking-gender-btn ${statusFilter === 'in_programma' ? 'active' : ''}`}
                onClick={() => setStatusFilter('in_programma')}
              >
                <i className="bi bi-calendar-event me-1"></i>
                In Programma
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Macro Category Navigation Pills */}
        <div className="ranking-macro-nav" role="tablist" aria-label="Categorie Tornei">
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'all'}
            className={`ranking-macro-pill ${activeGroup === 'all' ? 'is-active' : ''}`}
            onClick={() => handleGroupClick('all')}
          >
            <i className="bi bi-trophy-fill me-1"></i>
            <span>Tutti Attivi</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'top'}
            className={`ranking-macro-pill ${activeGroup === 'top' ? 'is-active' : ''}`}
            onClick={() => handleGroupClick('top')}
          >
            <i className="bi bi-stars me-1"></i>
            <span>Tornei Top</span>
            <span className="macro-badge">Top 1-6</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'open'}
            className={`ranking-macro-pill pill-stranieri ${activeGroup === 'open' ? 'is-active' : ''}`}
            onClick={() => handleGroupClick('open')}
          >
            <i className="bi bi-globe-europe-africa me-1"></i>
            <span>Tornei Open</span>
            <span className="pill-highlight-dot"></span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'nazionali'}
            className={`ranking-macro-pill ${activeGroup === 'nazionali' ? 'is-active' : ''}`}
            onClick={() => handleGroupClick('nazionali')}
          >
            <i className="bi bi-flag-fill me-1"></i>
            <span>Nazionali</span>
            <span className="macro-badge">Giov • Master • Para</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === 'regionali'}
            className={`ranking-macro-pill ${activeGroup === 'regionali' ? 'is-active' : ''}`}
            onClick={() => handleGroupClick('regionali')}
          >
            <i className="bi bi-geo-alt-fill me-1"></i>
            <span>Regionali</span>
            <span className="macro-badge">Comitati</span>
          </button>
        </div>

        {/* Row 3a: Sub-Category Chips for Top / Nazionali / Regionali */}
        {currentGroupCategories.length > 0 && (
          <div className="ranking-subchips-container" role="group" aria-label="Sotto-categorie tornei">
            <span className="subchips-label">
              <i className="bi bi-funnel-fill me-1"></i>
              Seleziona:
            </span>
            <div className="ranking-subchips-list">
              {activeGroup === 'regionali' && (
                <button
                  type="button"
                  className={`ranking-subchip-btn ${categoryKey === 'reg_all' ? 'is-active' : ''}`}
                  onClick={() => handleCategoryChange('reg_all')}
                >
                  Tutti Regionali
                </button>
              )}
              {currentGroupCategories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  className={`ranking-subchip-btn ${categoryKey === cat.key ? 'is-active' : ''}`}
                  onClick={() => handleCategoryChange(cat.key)}
                >
                  {cat.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 3b: Region Sub-Chips when viewing Tornei Open (TOR=0&COMIT=30&ID=36) */}
        {activeGroup === 'open' && openAvailableRegions.length > 0 && (
          <div className="ranking-subchips-container" role="group" aria-label="Regioni Tornei Open">
            <span className="subchips-label">
              <i className="bi bi-geo-alt-fill me-1"></i>
              Regioni Open:
            </span>
            <div className="ranking-subchips-list">
              <button
                type="button"
                className={`ranking-subchip-btn ${regFilterId === 0 ? 'is-active' : ''}`}
                onClick={() => {
                  setRegFilterId(0);
                  setComitId(0);
                }}
              >
                Tutte ({openAvailableRegions.length})
              </button>
              {openAvailableRegions.map((r) => (
                <button
                  key={r.regId}
                  type="button"
                  className={`ranking-subchip-btn ${regFilterId === r.regId ? 'is-active' : ''}`}
                  onClick={() => {
                    setRegFilterId(r.regId);
                    setComitId(r.regId);
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 4: Controls Row with Region Select, Category Select & Search */}
        <div className="ranking-controls-row">
          <div className="ranking-region-select-wrap">
            <label htmlFor="tornei-region-select" className="ranking-select-label">
              <i className="bi bi-geo-alt-fill me-1 text-primary"></i>
              Comitato:
            </label>
            <div className="ranking-select-inner">
              <select
                id="tornei-region-select"
                className="ranking-select-input"
                value={comitId}
                onChange={(e) => handleRegionChange(Number(e.target.value))}
              >
                {REGIONS_COMIT.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name}
                  </option>
                ))}
              </select>
              <i className="bi bi-chevron-down ranking-select-chevron"></i>
            </div>
          </div>

          <div className="ranking-category-select-wrap">
            <label htmlFor="tornei-category-select" className="ranking-select-label">
              <i className="bi bi-trophy-fill me-1 text-primary"></i>
              Manifestazione:
            </label>
            <div className="ranking-select-inner">
              <select
                id="tornei-category-select"
                className="ranking-select-input ranking-cat-select"
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
              <i className="bi bi-chevron-down ranking-select-chevron"></i>
            </div>
          </div>

          <div className="ranking-inline-search-wrap">
            <div className="ranking-search-inner">
              <i className="bi bi-search ranking-search-icon"></i>
              <input
                type="text"
                className="ranking-search-input"
                placeholder="Cerca sede, provincia o data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ranking-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Cancella filtro"
                >
                  <i className="bi bi-x-circle-fill"></i>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Tournament Interactive Detail View */}
      {selectedTorneo ? (
        <div className="ranking-card-block primary-official ranking-table-card">
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
                Elenco Tornei
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
                  <span>Dati Sintetici (PDF)</span>
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
                    {garaPhaseTab === 'tabellone' && garaData.turniTabellone.length > 0 && selectedGara && (
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
                  {garaData.partiteTabellone.length > 0 ? (
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
      ) : filteredSections.length > 0 ? (
        <div className="tornei-sections-stack">
          {filteredSections.map((sec) => (
            <div key={`${sec.key}-${sec.comit}-${sec.reg || 0}`} className="ranking-card-block primary-official ranking-table-card">
              <div className="ranking-section-header official-header">
                <div className="official-title-group">
                  <span className="official-crown">
                    <i className="bi bi-trophy-fill text-warning"></i>
                  </span>
                  <div>
                    <div className="official-main-title">{sec.title}</div>
                    <div className="official-subtitle-text">
                      <strong>{sec.tornei.length}</strong> {sec.tornei.length === 1 ? 'torneo disponibile' : 'tornei disponibili'}
                      {sec.regioneNome ? ` • ${sec.regioneNome}` : ''}
                    </div>
                  </div>
                </div>
                <div className="official-badge-group">
                  <span className="section-badge">{sec.shortLabel}</span>
                </div>
              </div>

              <div className="tornei-cards-body">
                <div className="match-cards-grid">
                  {sec.tornei.map((torneo) => (
                    <div
                      key={`${torneo.com}-${torneo.idt}-${torneo.tipo}`}
                      className={`match-card torneo-item-card ${torneo.status === 'disputato' ? 'is-disputato' : 'is-in-programma'
                        }`}
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
                      <div className="torneo-card-top">
                        <span className="torneo-date-pill">
                          <i className="bi bi-calendar3"></i>
                          {torneo.data}
                        </span>
                        <span
                          className={`torneo-status-pill ${torneo.status === 'disputato' ? 'status-disputato' : 'status-programma'
                            }`}
                        >
                          <i
                            className={`bi ${torneo.status === 'disputato' ? 'bi-check-circle-fill' : 'bi-clock-fill'
                              }`}
                          ></i>
                          {torneo.status === 'disputato' ? 'Risultati' : 'In Programma'}
                        </span>
                      </div>

                      <h3 className="torneo-luogo-title">
                        <span>{torneo.luogo}</span>
                        <i className="bi bi-chevron-right" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}></i>
                      </h3>

                      <div className="torneo-card-footer">
                        <span>
                          <i className="bi bi-geo-alt me-1"></i>
                          {torneo.regione || 'Nazionale'}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--color-info-text)' }}>
                          {torneo.status === 'disputato' ? 'Vedi risultati e tabelloni' : 'Vedi gare e iscritti'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
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
  );
};
