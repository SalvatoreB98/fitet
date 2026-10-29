import React, { useState, useEffect, useMemo } from 'react';
import { RankingAthleteItem, RankingPageResult } from '../types/fitet';
import {
  RankingCategoryKey,
  RankingGroupKey,
  RANKING_CATEGORIES,
  RANKING_GROUPS,
  getRankingCategoryByKey,
  getRankingCategoriesByGroup,
} from '../constants/rankingCategories';
import { fetchRanking } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import './ClassificheRankingTab.css';

export interface ClassificheRankingTabProps {
  onOpenAtletaModal: (atletaId: string, nome: string) => void;
  onOpenSearchModal?: () => void;
}

export const REGIONS_COMIT = [
  { id: 0, name: 'Tutte (Nazionale)' },
  { id: 14, name: 'Abruzzo' },
  { id: 7, name: 'Alto Adige' },
  { id: 17, name: 'Basilicata' },
  { id: 19, name: 'Calabria' },
  { id: 16, name: 'Campania' },
  { id: 9, name: 'Emilia Romagna' },
  { id: 8, name: 'Friuli Venezia Giulia' },
  { id: 13, name: 'Lazio' },
  { id: 3, name: 'Liguria' },
  { id: 4, name: 'Lombardia' },
  { id: 11, name: 'Marche' },
  { id: 15, name: 'Molise' },
  { id: 2, name: 'Piemonte' },
  { id: 18, name: 'Puglia' },
  { id: 21, name: 'Sardegna' },
  { id: 20, name: 'Sicilia' },
  { id: 10, name: 'Toscana' },
  { id: 6, name: 'Trentino' },
  { id: 12, name: 'Umbria' },
  { id: 1, name: "Valle d'Aosta" },
  { id: 5, name: 'Veneto' },
];

export const ClassificheRankingTab: React.FC<ClassificheRankingTabProps> = ({
  onOpenAtletaModal,
  onOpenSearchModal,
}) => {
  // Read initial query params from URL if present
  const [sesso, setSesso] = useState<'M' | 'F'>(() => {
    if (typeof window !== 'undefined') {
      const s = new URLSearchParams(window.location.search).get('sesso');
      if (s === 'F' || s === 'M') return s;
    }
    return 'M';
  });

  const [comitId, setComitId] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const c = new URLSearchParams(window.location.search).get('comit');
      if (c && /^\d+$/.test(c)) return parseInt(c, 10);
    }
    return 0; // 0 = Nazionale
  });

  const [category, setCategory] = useState<RankingCategoryKey>(() => {
    if (typeof window !== 'undefined') {
      const cat = new URLSearchParams(window.location.search).get('cat');
      if (cat && RANKING_CATEGORIES.some((c) => c.key === cat)) {
        return cat as RankingCategoryKey;
      }
    }
    return 'generale';
  });

  const [page, setPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [data, setData] = useState<RankingPageResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(false);
  const [isQuickFiltersOpen, setIsQuickFiltersOpen] = useState<boolean>(false);

  const activeCategoryDef = getRankingCategoryByKey(category);
  const activeGroup = activeCategoryDef.group;

  // Sync state changes with URL search params without reload
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('view') === 'classifiche') {
        url.searchParams.set('sesso', sesso);
        url.searchParams.set('cat', category);
        if (comitId > 0) {
          url.searchParams.set('comit', String(comitId));
        } else {
          url.searchParams.delete('comit');
        }
        window.history.replaceState({ ...(window.history.state || {}) }, '', url.toString());
      }
    }
  }, [sesso, category, comitId]);

  const loadRanking = async (
    targetPage = page,
    targetSesso = sesso,
    targetComit = comitId,
    targetCategory = category,
    force = false
  ) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchRanking(
        targetPage,
        targetSesso,
        targetComit > 0 ? targetComit : undefined,
        targetCategory,
        force
      );
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento della classifica.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRanking(page, sesso, comitId, category);
  }, [page, sesso, comitId, category]);

  const handleComitChange = (newComit: number) => {
    setComitId(newComit);
    setPage(1);
    setSearchQuery('');
  };

  const handleSessoChange = (newSesso: 'M' | 'F') => {
    setSesso(newSesso);
    setPage(1);
    setSearchQuery('');
  };

  const handleCategoryChange = (newCategory: RankingCategoryKey) => {
    if (newCategory === category) return;
    setCategory(newCategory);
    setPage(1);
    setSearchQuery('');
  };

  const handleGroupTabClick = (groupKey: RankingGroupKey) => {
    if (groupKey === activeGroup) return;
    const groupDef = RANKING_GROUPS.find((g) => g.key === groupKey);
    if (groupDef) {
      handleCategoryChange(groupDef.defaultCategoryKey);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (data && page < data.totalPages) {
      setPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const formatPoints = (points: number) => {
    return new Intl.NumberFormat('it-IT').format(points);
  };

  const selectedRegionName = REGIONS_COMIT.find((r) => r.id === comitId)?.name || 'Nazionale';

  // Sub-categories only for multi-item groups (giovanili, master, paralimpici)
  const currentGroupCategories = useMemo(() => {
    if (activeGroup === 'giovanili' || activeGroup === 'master' || activeGroup === 'paralimpici') {
      return getRankingCategoriesByGroup(activeGroup);
    }
    return [];
  }, [activeGroup]);

  // Filter athletes locally on page by search query
  const filteredAthletes = useMemo(() => {
    if (!data?.athletes) return [];
    if (!searchQuery.trim()) return data.athletes;
    const q = searchQuery.toLowerCase().trim();
    return data.athletes.filter((a) => {
      return (
        a.nome.toLowerCase().includes(q) ||
        (a.provinciaOrRegione && a.provinciaOrRegione.toLowerCase().includes(q)) ||
        (a.settore && a.settore.toLowerCase().includes(q)) ||
        (a.categoria && a.categoria.toLowerCase().includes(q))
      );
    });
  }, [data?.athletes, searchQuery]);

  return (
    <div className="ranking-tab-container">
      {/* Top Filter Card */}
      <div className="ranking-filter-card">
        {/* Row 1: Header with Title, Gender Switcher and Actions */}

        {/* Bootstrap Accordion Container with 2 Distinct Panels */}
        <div className="accordion ranking-accordion" id="rankingFiltersAccordion">
          {/* Panel 1: Filtri Classifica (Regione, Categoria, Ricerca) */}
          <div className="accordion-item ranking-accordion-item" id="ranking-controls-expansion">
            <h3 className="accordion-header" id="headingControls">
              <button
                className={`accordion-button ${!isControlsOpen ? 'collapsed' : ''}`}
                type="button"
                onClick={() => setIsControlsOpen((prev) => !prev)}
                aria-expanded={isControlsOpen}
                aria-controls="collapseControls"
              >
                <div className="d-flex align-items-center gap-2 flex-wrap flex-grow-1 me-2">
                  <span className="fw-semibold text-main d-inline-flex align-items-center">
                    <i className="bi bi-list me-2"></i>
                    <span className="text-muted">Classifica</span>
                  </span>
                  <span className="ranking-pill-badge">
                    <i className="bi bi-geo-alt-fill me-1"></i>
                    {selectedRegionName}
                  </span>
                  <span className="ranking-pill-badge">
                    {activeCategoryDef.shortLabel}
                  </span>
                </div>
              </button>
            </h3>
            <div
              id="collapseControls"
              className={`accordion-collapse collapse ${isControlsOpen ? 'show' : ''}`}
              aria-labelledby="headingControls"
            >
              <div className="accordion-body ranking-accordion-body p-3">
                <div className="row g-3 align-items-end">
                  {/* Region Select */}
                  <div className="col-12 col-md-4">
                    <label htmlFor="ranking-region-select" className="form-label mb-1 fw-semibold small text-secondary d-flex align-items-center gap-1">
                      <span> Regione</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text border-end-0">
                        <i className="bi bi-map"></i>
                      </span>
                      <select
                        id="ranking-region-select"
                        className="form-select border-start-0 ps-1"
                        value={comitId}
                        onChange={(e) => handleComitChange(Number(e.target.value))}
                      >
                        {REGIONS_COMIT.map((reg) => (
                          <option key={reg.id} value={reg.id}>
                            {reg.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Category Select */}
                  <div className="col-12 col-md-5">
                    <label htmlFor="ranking-category-select" className="form-label mb-1 fw-semibold small text-secondary d-flex align-items-center gap-1">
                      <span>Categoria</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text border-end-0">
                        <i className="bi bi-trophy"></i>
                      </span>
                      <select
                        id="ranking-category-select"
                        className="form-select border-start-0 ps-1"
                        value={category}
                        onChange={(e) => handleCategoryChange(e.target.value as RankingCategoryKey)}
                      >
                        <optgroup label="Classifica Generale">
                          <option value="generale">Generale</option>
                        </optgroup>
                        <optgroup label="Altre Categorie (Speciali)">
                          <option value="stranieri">🌍 Stranieri</option>
                          <option value="fuori_quadro">Fuori Quadro (FQ)</option>
                          <option value="provvisori">Provvisori</option>
                        </optgroup>
                        <optgroup label="Settore Giovanile">
                          <option value="u11">Under 11 (Giovanissimi)</option>
                          <option value="u13">Under 13 (Ragazzi)</option>
                          <option value="u15">Under 15 (Allievi)</option>
                          <option value="u17">Under 17 (Cadetti)</option>
                          <option value="u19">Under 19 (Juniores)</option>
                          <option value="u21">Under 21</option>
                        </optgroup>
                        <optgroup label="Master / Veterani">
                          <option value="master_1">Master Cat. 1 (40-49)</option>
                          <option value="master_2">Master Cat. 2 (50-59)</option>
                          <option value="master_3">Master Cat. 3 (60-64)</option>
                          <option value="master_4">Master Cat. 4 (65-69)</option>
                          <option value="master_5">Master Cat. 5 (70-74)</option>
                          <option value="master_6">Master Cat. 6 (75-79)</option>
                          <option value="master_7">Master Cat. 7 (80+)</option>
                        </optgroup>
                        <optgroup label="Paralimpici">
                          <option value="para_1_5">Paralimpica Classe 1-5 (Carrozzina)</option>
                          <option value="para_6_10">Paralimpica Classe 6-10 (In piedi)</option>
                          <option value="para_11">Paralimpica Classe 11 (DIR)</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ranking-filter-header mb-4">
                <div className="ranking-header-actions">
                  {/* Gender Selector Buttons */}
                  <div className="ranking-gender-group" role="group" aria-label="Sesso">
                    <button
                      type="button"
                      className={`ranking-gender-btn ${sesso === 'M' ? 'active' : ''}`}
                      onClick={() => handleSessoChange('M')}
                    >
                      <i className="bi bi-gender-male me-1"></i>
                      Maschile
                    </button>
                    <button
                      type="button"
                      className={`ranking-gender-btn ${sesso === 'F' ? 'active' : ''}`}
                      onClick={() => handleSessoChange('F')}
                    >
                      <i className="bi bi-gender-female me-1"></i>
                      Femminile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading && !refreshing ? (
        <div className="ranking-loading-state">
          <div className="spinner-border text-primary" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <p className="ranking-loading-text">
            Caricamento {activeCategoryDef.label.toLowerCase()} FITeT...
          </p>
        </div>
      ) : error ? (
        <div className="ranking-error-card">
          <div className="ranking-error-icon">
            <i className="bi bi-exclamation-triangle-fill"></i>
          </div>
          <h3>Impossibile caricare la classifica</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn-action"
            onClick={() => loadRanking(page, sesso, comitId, category, true)}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Riprova
          </button>
        </div>
      ) : data && data.athletes.length > 0 ? (
        <div className="ranking-card-block ranking-table-card">
          {/* Section Header */}
          <div className="ranking-section-header official-header">
            <div className="official-title-group">
              <span className="official-crown">
                <i className={`${activeCategoryDef.icon || 'bi-trophy-fill'} text-warning`}></i>
              </span>
              <div>
                <div className="official-main-title">{data.title || activeCategoryDef.label}</div>
                <div className="official-subtitle-text">
                  Totale: <strong>{data.totalAthletes.toLocaleString('it-IT')}</strong> atleti registrati
                  {searchQuery && ` • ${filteredAthletes.length} corrispondenti al filtro`}
                </div>
              </div>
            </div>
            <div className="official-badge-group">
              <span className={`section-badge badge-cat-${category}`}>
                {activeCategoryDef.shortLabel}
              </span>
              <span className="section-badge">
                {selectedRegionName} • {sesso === 'M' ? 'Maschile' : 'Femminile'}
              </span>
            </div>
          </div>

          {/* Athletes Table */}
          {filteredAthletes.length > 0 ? (
            <div className="table-responsive">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th className="th-rank">#</th>
                    <th className="th-athlete">Atleta</th>
                    <th className="th-date hide-xs">Nascita</th>
                    <th className="th-settore hide-xs">Sett.</th>
                    <th className="th-points text-end">Punti</th>
                    <th className="th-posnaz hide-sm text-center">Pos. Naz</th>
                    <th className="th-provincia hide-md">Provincia</th>
                    <th className="th-cat text-center">Cat.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAthletes.map((ath: RankingAthleteItem) => {
                    const isPodium = ath.hasOfficialRank !== false && ath.rank <= 3;
                    return (
                      <tr
                        key={`${ath.atletaId || ath.nome}-${ath.rank}`}
                        className={`ranking-row ${isPodium ? `podium-rank-${ath.rank}` : ''}`}
                        onClick={() => onOpenAtletaModal(ath.atletaId, ath.nome)}
                        title="Clicca per aprire la scheda atleta"
                      >
                        {/* Rank Position */}
                        <td className="td-rank">
                          {ath.hasOfficialRank !== false ? (
                            <span className={`rank-badge rank-badge-${ath.rank <= 3 ? ath.rank : 'default'}`}>
                              {ath.rank === 1 && <i className="bi bi-trophy-fill rank-medal gold"></i>}
                              {ath.rank === 2 && <i className="bi bi-trophy-fill rank-medal silver"></i>}
                              {ath.rank === 3 && <i className="bi bi-trophy-fill rank-medal bronze"></i>}
                              {ath.rank}
                            </span>
                          ) : (
                            <span
                              className="rank-badge rank-badge-unranked"
                              title="Posizione progressiva (non numerata nella graduatoria ufficiale)"
                            >
                              <span className="unranked-hash">#</span>{ath.rank}
                            </span>
                          )}
                        </td>

                        {/* Athlete Name */}
                        <td className="td-athlete">
                          <div className="athlete-row-cell">
                            <AthleteAvatar
                              atletaId={ath.atletaId}
                              nome={ath.nome}
                              size={28}
                              className="ranking-athlete-avatar"
                            />
                            <div className="athlete-name-cell">
                              <button
                                type="button"
                                className="athlete-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenAtletaModal(ath.atletaId, ath.nome);
                                }}
                              >
                                <MarqueeText text={ath.nome} className="athlete-link-text" />
                                <i className="bi bi-arrow-up-right athlete-link-arrow"></i>
                              </button>
                              {/* Mobile submeta */}
                              <div className="athlete-mobile-meta show-xs">
                                {ath.provinciaOrRegione && <span>{ath.provinciaOrRegione}</span>}
                                {ath.settore && <span> • {ath.settore}</span>}
                                {category === 'stranieri' && (
                                  <span className="mobile-stranieri-pill">Straniero</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Data Nascita */}
                        <td className="td-date hide-xs">
                          <span className="date-text">{ath.dataNascita || '-'}</span>
                        </td>

                        {/* Settore */}
                        <td className="td-settore hide-xs">
                          <span className="settore-badge">{ath.settore || '-'}</span>
                        </td>

                        {/* Punti */}
                        <td className="td-points text-end">
                          <span className="badge-points-official">{formatPoints(ath.punti)}</span>
                        </td>

                        {/* Pos Naz */}
                        <td className="td-posnaz hide-sm text-center">
                          <span className="posnaz-text">{ath.posNazOrVariazione || '-'}</span>
                        </td>

                        {/* Provincia */}
                        <td className="td-provincia hide-md">
                          <span className="provincia-text">{ath.provinciaOrRegione || '-'}</span>
                        </td>

                        {/* Categoria */}
                        <td className="td-cat text-center">
                          <span className={`cat-pill cat-pill-${ath.categoria || 'default'}`}>
                            {ath.categoria ? `${ath.categoria}ª` : '-'}
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
              <i className="bi bi-search me-2"></i>
              Nessun atleta corrisponde alla ricerca &quot;{searchQuery}&quot; su questa pagina.
            </div>
          )}

          {/* Pagination Controls */}
          <div className="ranking-pagination-bar">
            <button
              type="button"
              className="ranking-page-nav-btn"
              onClick={handlePrevPage}
              disabled={page <= 1}
              aria-label="Pagina precedente"
            >
              <i className="bi bi-chevron-left me-1"></i>
              Precedente
            </button>

            <div className="ranking-page-indicator">
              <span>
                Pagina <strong>{page}</strong> di <strong>{data.totalPages}</strong>
              </span>
            </div>

            <button
              type="button"
              className="ranking-page-nav-btn"
              onClick={handleNextPage}
              disabled={page >= data.totalPages}
              aria-label="Pagina successiva"
            >
              Successiva
              <i className="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      ) : (
        <div className="ranking-empty-card">
          <i className="bi bi-clipboard-x ranking-empty-icon"></i>
          <h3>Nessun atleta trovato</h3>
          <p>
            Non ci sono atleti registrati per la categoria <strong>{activeCategoryDef.label}</strong> (
            {selectedRegionName}, {sesso === 'M' ? 'Maschile' : 'Femminile'}).
          </p>
          <button
            type="button"
            className="btn-action"
            onClick={() => handleCategoryChange('generale')}
          >
            <i className="bi bi-arrow-left me-1"></i>
            Torna alla Classifica Generale
          </button>
        </div>
      )}
    </div>
  );
};
