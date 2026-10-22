import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StatisticaAtleta } from '../types/fitet';
import { MarqueeText } from './MarqueeText';
import { AthleteAvatar } from './AthleteAvatar';

interface StatisticheTabProps {
  statistiche: StatisticaAtleta[];
  onOpenAtletaModal: (atletaId: string, atletaNome: string) => void;
}

type SortField =
  | 'pos'
  | 'atleta'
  | 'squadra'
  | 'incontriDisputati'
  | 'partiteDisputate'
  | 'partiteVinte'
  | 'partitePerse'
  | 'setVinti'
  | 'setPersi'
  | 'puntiVinti'
  | 'puntiPersi'
  | 'percentualeVittorie';

export interface AthleteWithRanking extends StatisticaAtleta {
  posUfficiale: number;
}


export const StatisticheTab: React.FC<StatisticheTabProps> = ({ statistiche, onOpenAtletaModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [subRanking, setSubRanking] = useState<'pct' | 'vinte' | 'set' | 'all' | 'full'>('pct');

  const toggleSearch = () => {
    setIsSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 60);
      } else {
        setSearchTerm('');
      }
      return next;
    });
  };

  // Sorting state for 1. % Vittorie (Ranking Principale)
  const [pctSortField, setPctSortField] = useState<string>('percentualeVittorie');
  const [pctSortAsc, setPctSortAsc] = useState<boolean>(false);

  // Sorting state for 2. Più Vincenti (Approfondimento 1)
  const [vinteSortField, setVinteSortField] = useState<string>('partiteVinte');
  const [vinteSortAsc, setVinteSortAsc] = useState<boolean>(false);

  // Sorting state for 3. Differenziali Set & Punti (Approfondimento 2)
  const [diffSetSortField, setDiffSetSortField] = useState<string>('diffSet');
  const [diffSetSortAsc, setDiffSetSortAsc] = useState<boolean>(false);

  // Sorting state for 4. Tabellone Completo (11 Colonne)
  const [sortField, setSortField] = useState<SortField>('percentualeVittorie');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  useEffect(() => {
    if (window.innerWidth > 1050) {
      setSubRanking('full');
    }
  }, []);

  const teams = useMemo(() => {
    return Array.from(new Set(statistiche.map((s) => s.squadra))).sort();
  }, [statistiche]);

  // Generic sort handler creator
  const createSortHandler = (
    currentField: string,
    setField: (f: string) => void,
    currentAsc: boolean,
    setAsc: (a: boolean) => void
  ) => {
    return (field: string) => {
      if (currentField === field) {
        setAsc(!currentAsc);
      } else {
        setField(field);
        setAsc(field === 'pos' || field === 'atleta' || field === 'squadra');
      }
    };
  };

  const handlePctSort = createSortHandler(pctSortField, setPctSortField, pctSortAsc, setPctSortAsc);
  const handleVinteSort = createSortHandler(vinteSortField, setVinteSortField, vinteSortAsc, setVinteSortAsc);
  const handleDiffSetSort = createSortHandler(diffSetSortField, setDiffSetSortField, diffSetSortAsc, setDiffSetSortAsc);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'pos' || field === 'atleta' || field === 'squadra');
    }
  };

  // Pre-calculate official championship ranking position from unfiltered list
  const athletesWithRank = useMemo<AthleteWithRanking[]>(() => {
    return statistiche.map((a, index) => ({
      ...a,
      posUfficiale: a.posizione ?? (index + 1),
    }));
  }, [statistiche]);

  // Base filtered list
  const filteredAthletes = useMemo(() => {
    return athletesWithRank.filter((a) => {
      const matchesSearch =
        a.atleta.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.squadra.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTeam = !selectedTeam || a.squadra === selectedTeam;
      return matchesSearch && matchesTeam;
    });
  }, [athletesWithRank, searchTerm, selectedTeam]);

  // 1. % Vittorie (Efficacia - Ranking Principale)
  const sortedPctAthletes = useMemo(() => {
    const list = [...filteredAthletes];
    list.sort((a, b) => {
      if (pctSortField === 'pos') {
        return pctSortAsc ? a.posUfficiale - b.posUfficiale : b.posUfficiale - a.posUfficiale;
      }
      if (pctSortField === 'atleta') {
        return pctSortAsc ? a.atleta.localeCompare(b.atleta) : b.atleta.localeCompare(a.atleta);
      }
      if (pctSortField === 'squadra') {
        return pctSortAsc ? a.squadra.localeCompare(b.squadra) : b.squadra.localeCompare(a.squadra);
      }
      if (pctSortField === 'vg' || pctSortField === 'partiteVinte') {
        const diff = pctSortAsc ? a.partiteVinte - b.partiteVinte : b.partiteVinte - a.partiteVinte;
        if (diff !== 0) return diff;
        return pctSortAsc ? a.partiteDisputate - b.partiteDisputate : b.partiteDisputate - a.partiteDisputate;
      }
      if (pctSortField === 'percentualeVittorie') {
        const diff = pctSortAsc ? a.percentualeVittorie - b.percentualeVittorie : b.percentualeVittorie - a.percentualeVittorie;
        if (diff !== 0) return diff;
        return pctSortAsc ? a.partiteVinte - b.partiteVinte : b.partiteVinte - a.partiteVinte;
      }
      // default / 'pos'
      const baseDiff = b.percentualeVittorie - a.percentualeVittorie;
      if (baseDiff !== 0) {
        return pctSortAsc ? -baseDiff : baseDiff;
      }
      return pctSortAsc ? a.partiteVinte - b.partiteVinte : b.partiteVinte - a.partiteVinte;
    });
    return list;
  }, [filteredAthletes, pctSortField, pctSortAsc]);

  // 2. Più Vincenti (Approfondimento 1)
  const sortedVinteAthletes = useMemo(() => {
    const list = [...filteredAthletes];
    list.sort((a, b) => {
      if (vinteSortField === 'atleta') {
        return vinteSortAsc ? a.atleta.localeCompare(b.atleta) : b.atleta.localeCompare(a.atleta);
      }
      if (vinteSortField === 'squadra') {
        return vinteSortAsc ? a.squadra.localeCompare(b.squadra) : b.squadra.localeCompare(a.squadra);
      }
      if (vinteSortField === 'partiteVinte') {
        const diff = vinteSortAsc ? a.partiteVinte - b.partiteVinte : b.partiteVinte - a.partiteVinte;
        if (diff !== 0) return diff;
        return a.partitePerse - b.partitePerse;
      }
      if (vinteSortField === 'partitePerse') {
        const diff = vinteSortAsc ? a.partitePerse - b.partitePerse : b.partitePerse - a.partitePerse;
        if (diff !== 0) return diff;
        return b.partiteVinte - a.partiteVinte;
      }
      if (vinteSortField === 'diff') {
        const diffA = a.partiteVinte - a.partitePerse;
        const diffB = b.partiteVinte - b.partitePerse;
        const diff = vinteSortAsc ? diffA - diffB : diffB - diffA;
        if (diff !== 0) return diff;
        return b.partiteVinte - a.partiteVinte;
      }
      // default / 'pos'
      if (b.partiteVinte !== a.partiteVinte) {
        return vinteSortAsc ? a.partiteVinte - b.partiteVinte : b.partiteVinte - a.partiteVinte;
      }
      return vinteSortAsc ? b.partitePerse - a.partitePerse : a.partitePerse - b.partitePerse;
    });
    return list;
  }, [filteredAthletes, vinteSortField, vinteSortAsc]);

  // 3. Differenziale Set & Punti (Approfondimento 2)
  const sortedSetAthletes = useMemo(() => {
    const list = [...filteredAthletes];
    list.sort((a, b) => {
      if (diffSetSortField === 'atleta') {
        return diffSetSortAsc ? a.atleta.localeCompare(b.atleta) : b.atleta.localeCompare(a.atleta);
      }
      if (diffSetSortField === 'squadra') {
        return diffSetSortAsc ? a.squadra.localeCompare(b.squadra) : b.squadra.localeCompare(a.squadra);
      }
      if (diffSetSortField === 'diffSet') {
        const diffSetA = a.setVinti - a.setPersi;
        const diffSetB = b.setVinti - b.setPersi;
        const diff = diffSetSortAsc ? diffSetA - diffSetB : diffSetB - diffSetA;
        if (diff !== 0) return diff;
        return (b.puntiVinti - b.puntiPersi) - (a.puntiVinti - a.puntiPersi);
      }
      if (diffSetSortField === 'diffPunti') {
        const diffPuntiA = a.puntiVinti - a.puntiPersi;
        const diffPuntiB = b.puntiVinti - b.puntiPersi;
        const diff = diffSetSortAsc ? diffPuntiA - diffPuntiB : diffPuntiB - diffPuntiA;
        if (diff !== 0) return diff;
        return (b.setVinti - b.setPersi) - (a.setVinti - a.setPersi);
      }
      // default / 'pos'
      const diffSetA = a.setVinti - a.setPersi;
      const diffSetB = b.setVinti - b.setPersi;
      if (diffSetB !== diffSetA) {
        return diffSetSortAsc ? diffSetA - diffSetB : diffSetB - diffSetA;
      }
      return diffSetSortAsc
        ? (a.puntiVinti - a.puntiPersi) - (b.puntiVinti - b.puntiPersi)
        : (b.puntiVinti - b.puntiPersi) - (a.puntiVinti - a.puntiPersi);
    });
    return list;
  }, [filteredAthletes, diffSetSortField, diffSetSortAsc]);

  // 4. Tabellone Completo (custom sort)
  const fullAthletes = useMemo(() => {
    const list = [...filteredAthletes];
    list.sort((a, b) => {
      if (sortField === 'pos') {
        return sortAsc ? a.posUfficiale - b.posUfficiale : b.posUfficiale - a.posUfficiale;
      }

      let valA: string | number = a[sortField];
      let valB: string | number = b[sortField];

      if (sortField === 'percentualeVittorie' && valA === valB) {
        valA = a.partiteVinte;
        valB = b.partiteVinte;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      const numDiff = sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      if (numDiff !== 0) return numDiff;
      return a.posUfficiale - b.posUfficiale;
    });
    return list;
  }, [filteredAthletes, sortField, sortAsc]);

  const renderSortIndicator = (field: string, activeField: string, isAsc: boolean) => {
    if (field !== activeField) {
      return (
        <i
          className="bi bi-arrow-down-up"
          style={{ marginLeft: '4px', opacity: 0.35, fontSize: '10px' }}
          title="Clicca per ordinare"
        />
      );
    }
    return (
      <i
        className={isAsc ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill'}
        style={{
          marginLeft: '4px',
          color: 'var(--color-primary-600)',
          fontSize: '11px',
        }}
      />
    );
  };

  const getPctBadgeClass = (pct: number) => {
    if (pct === 100) return 'pct-100';
    if (pct >= 70) return 'pct-high';
    if (pct >= 50) return 'pct-mid';
    if (pct > 0) return 'pct-low';
    return 'pct-zero';
  };

  // Athlete Name Cell with Photo & Optional Foreign Badge
  const renderAthleteNameCell = (a: StatisticaAtleta) => (
    <div className="grid-cell text-left" style={{ paddingLeft: '6px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden', width: '100%' }}>
        <AthleteAvatar atletaId={a.atletaId} nome={a.atleta} />
        <span
          style={{
            fontWeight: '600',
            fontSize: '12.5px',
            color: 'var(--text-dark)',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
          title={a.atleta}
        >
          {a.atleta}
        </span>
        {a.nazionalita && a.nazionalita !== 'IT' && (
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: '700',
              padding: '1px 4px',
              borderRadius: '3px',
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              flexShrink: 0,
            }}
            title={`Nazionalità: ${a.nazionalita}`}
          >
            {a.nazionalita}
          </span>
        )}
      </div>
    </div>
  );

  // Common Action Button with comfortable width and centering
  const renderSchedaButton = (a: StatisticaAtleta) => (
    <div className="grid-cell text-center" style={{ padding: '0 4px', justifyContent: 'center' }}>
      <button
        type="button"
        className="btn-action"
        style={{
          padding: '3px 8px',
          fontSize: '11px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          justifyContent: 'center',
          minWidth: '20px',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpenAtletaModal(a.atletaId || a.atleta, a.atleta);
        }}
        title={`Apri scheda federale di ${a.atleta}`}
      >
        <i className="bi bi-box-arrow-up-right"></i>
      </button>
    </div>
  );

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left">
          {/* Expandable Search Control */}
          <div className={`search-expandable-box ${(isSearchOpen || searchTerm) ? 'is-open' : ''}`}>
            <button
              type="button"
              className={`btn-search-trigger ${(isSearchOpen || searchTerm) ? 'active' : ''}`}
              onClick={toggleSearch}
              title={isSearchOpen || searchTerm ? 'Chiudi ricerca' : 'Cerca atleta o squadra...'}
            >
              <i className="bi bi-search"></i>
            </button>
            <div className="search-expandable-content">
              <input
                ref={searchInputRef}
                type="text"
                className="search-expandable-input"
                placeholder="Cerca atleta o squadra..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="search-expandable-clear"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  title="Cancella ricerca"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </div>
          {(searchTerm || selectedTeam) && (
            <button
              className="btn-action"
              onClick={() => {
                setSearchTerm('');
                setSelectedTeam('');
              }}
            >
              Azzera <i className="bi bi-x-lg ms-1"></i>
            </button>
          )}

          {/* Sub-Ranking Switcher Pills */}

          <button
            type="button"
            className={`sub-pill-btn ${subRanking === 'pct' ? 'active' : ''}`}
            onClick={() => setSubRanking('pct')}
            title="Classifica rendimento e percentuale vittorie (zero scroll)"
          >
            <i className="bi bi-trophy me-1"></i> % Vittorie
          </button>
          <button
            type="button"
            className={`sub-pill-btn ${subRanking === 'vinte' ? 'active' : ''}`}
            onClick={() => setSubRanking('vinte')}
            title="Classifica singolari più vincenti (zero scroll)"
          >
            <i className="bi bi-award me-1"></i> Più Vincenti
          </button>
          <button
            type="button"
            className={`sub-pill-btn ${subRanking === 'set' ? 'active' : ''}`}
            onClick={() => setSubRanking('set')}
            title="Classifica differenziale set e punti (zero scroll)"
          >
            <i className="bi bi-bullseye me-1"></i> Set &amp; Punti
          </button>
          <button
            type="button"
            className={`sub-pill-btn ${subRanking === 'all' ? 'active' : ''}`}
            onClick={() => setSubRanking('all')}
            title="Visualizza tutte le classifiche"
          >
            <i className="bi bi-view-stacked me-1"></i> Tutte le Viste
          </button>
          <button
            type="button"
            className={`sub-pill-btn ${subRanking === 'full' ? 'active' : ''}`}
            onClick={() => setSubRanking('full')}
            title="Tabellone completo con tutte le metriche"
          >
            <i className="bi bi-table me-1"></i> Tabellone Completo
          </button>

        </div>

        <div className="controls-right text-muted" style={{ fontSize: '12px' }}>
          {filteredAthletes.length} atleti • Clicca sulle intestazioni per ordinare le classifiche
        </div>
      </div>

      <div style={{ padding: '6px 0 16px 0' }}>
        {/* ==================== SUB-RANKING 1: % VITTORIE (RANKING PRINCIPALE) ==================== */}
        {(subRanking === 'pct' || subRanking === 'all') && (
          <div className="ranking-card-block primary-official">
            <div className="ranking-section-header official-header">
              <div className="official-title-group">
                <span className="official-crown">
                  <i className="bi bi-trophy-fill text-warning"></i>
                </span>
                <div>
                  <div className="official-main-title">Percentuale Vittorie (%pv)</div>
                  <div className="official-main-sub">
                    Classifica di rendimento atleti nei singolari disputati
                  </div>
                </div>
              </div>
              <div className="official-badge-group">
                <span className="section-badge">{sortedPctAthletes.length} atleti</span>
              </div>
            </div>

            <div className="grid-table-container">
              <div className="grid-table stat-ranking-pct-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handlePctSort('pos')} title="Ordina per Posizione">
                    # {renderSortIndicator('pos', pctSortField, pctSortAsc)}
                  </div>
                  <div
                    className="grid-th text-left"
                    style={{ paddingLeft: '8px' }}
                    onClick={() => handlePctSort('atleta')}
                    title="Ordina per Atleta (A-Z)"
                  >
                    Atleta {renderSortIndicator('atleta', pctSortField, pctSortAsc)}
                  </div>
                  <div className="grid-th text-left" onClick={() => handlePctSort('squadra')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('squadra', pctSortField, pctSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite Vinte / Partite Disputate"
                    onClick={() => handlePctSort('vg')}
                  >
                    V / G {renderSortIndicator('vg', pctSortField, pctSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Percentuale di vittorie"
                    onClick={() => handlePctSort('percentualeVittorie')}
                  >
                    % Vittorie {renderSortIndicator('percentualeVittorie', pctSortField, pctSortAsc)}
                  </div>
                </div>

                {sortedPctAthletes.map((a, i) => (
                  <div
                    key={`pct_${a.atleta}_${i}`}
                    className="grid-data-row"
                    style={{ cursor: a.atletaId ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (a.atletaId) onOpenAtletaModal(a.atletaId, a.atleta);
                    }}
                  >
                    <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                      {a.posUfficiale}
                    </div>
                    {renderAthleteNameCell(a)}
                    <div
                      className="grid-cell text-left"
                      style={{ overflow: 'hidden', padding: '0 8px', minWidth: 0 }}
                    >
                      <MarqueeText
                        text={a.squadra}
                        style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}
                      />
                    </div>
                    <div className="grid-cell text-center" style={{ fontWeight: '600', color: '#334155' }}>
                      <span style={{ color: '#15803d', fontWeight: '700' }}>{a.partiteVinte}</span>
                      <span style={{ color: '#94a3b8', margin: '0 2px' }}>/</span>
                      <span>{a.partiteDisputate}</span>
                    </div>
                    <div className="grid-cell text-center">
                      <span className={`badge ${getPctBadgeClass(a.percentualeVittorie)}`}>
                        {a.percentualeVittorie.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================================
           HIERARCHY DIVIDER (Tra Ranking Principale e Approfondimenti Atleti)
           ========================================================================== */}
        {subRanking === 'all' && (
          <>
            <div className="ranking-hierarchy-divider">
              <div className="hierarchy-divider-line"></div>
              <div className="hierarchy-divider-badge">
                <i className="bi bi-bar-chart-steps"></i>
                <span>APPROFONDIMENTI STATISTICI ATLETI (SUBORDINATI ORDINABILI)</span>
              </div>
              <div className="hierarchy-divider-line"></div>
            </div>
            <div className="ranking-hierarchy-hint">
              Clicca sulle intestazioni di colonna per ordinare liberamente per vittorie, perse, differenziali set o punti.
            </div>
          </>
        )}

        {/* ==================== SUB-RANKING 2: PIÙ VINCENTI (APPROFONDIMENTO 1) ==================== */}
        {(subRanking === 'vinte' || subRanking === 'all') && (
          <div className="ranking-card-block secondary-stats">
            <div className="ranking-section-header secondary-header">
              <div className="secondary-title-group">
                <span>
                  <i className="bi bi-award-fill me-2 text-primary"></i>Singolari Più Vincenti
                </span>
              </div>
              <span className="section-badge">{sortedVinteAthletes.length} atleti</span>
            </div>

            <div className="grid-table-container">
              <div className="grid-table stat-ranking-pav-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleVinteSort('pos')} title="Ordina per Posizione">
                    # {renderSortIndicator('pos', vinteSortField, vinteSortAsc)}
                  </div>
                  <div
                    className="grid-th text-left"
                    style={{ paddingLeft: '8px' }}
                    onClick={() => handleVinteSort('atleta')}
                    title="Ordina per Atleta (A-Z)"
                  >
                    Atleta {renderSortIndicator('atleta', vinteSortField, vinteSortAsc)}
                  </div>
                  <div className="grid-th text-left" onClick={() => handleVinteSort('squadra')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('squadra', vinteSortField, vinteSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite Vinte"
                    onClick={() => handleVinteSort('partiteVinte')}
                  >
                    PaV {renderSortIndicator('partiteVinte', vinteSortField, vinteSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite Perse"
                    onClick={() => handleVinteSort('partitePerse')}
                  >
                    PaP {renderSortIndicator('partitePerse', vinteSortField, vinteSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Differenziale Partite (+/-)"
                    onClick={() => handleVinteSort('diff')}
                  >
                    Diff {renderSortIndicator('diff', vinteSortField, vinteSortAsc)}
                  </div>
                  <div className="grid-th text-center" style={{ cursor: 'default' }}>Scheda</div>
                </div>

                {sortedVinteAthletes.map((a, i) => {
                  const diff = a.partiteVinte - a.partitePerse;
                  return (
                    <div
                      key={`vinte_${a.atleta}_${i}`}
                      className="grid-data-row"
                      style={{ cursor: a.atletaId ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (a.atletaId) onOpenAtletaModal(a.atletaId, a.atleta);
                      }}
                    >
                      <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                        {i + 1}
                      </div>
                      {renderAthleteNameCell(a)}
                      <div
                        className="grid-cell text-left"
                        style={{ overflow: 'hidden', padding: '0 8px', minWidth: 0 }}
                      >
                        <MarqueeText
                          text={a.squadra}
                          style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}
                        />
                      </div>
                      <div className="grid-cell text-center" style={{ color: '#15803d', fontWeight: '700' }}>
                        {a.partiteVinte}
                      </div>
                      <div className="grid-cell text-center" style={{ color: '#b91c1c' }}>
                        {a.partitePerse}
                      </div>
                      <div className="grid-cell text-center">
                        <span className={`badge ${diff > 0 ? 'pct-100' : diff < 0 ? 'pct-low' : 'pct-zero'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </div>
                      {renderSchedaButton(a)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SUB-RANKING 3: DIFFERENZIALI SET & PUNTI (APPROFONDIMENTO 2) ==================== */}
        {(subRanking === 'set' || subRanking === 'all') && (
          <div className="ranking-card-block secondary-stats">
            <div className="ranking-section-header secondary-header">
              <div className="secondary-title-group">
                <span>
                  <i className="bi bi-bullseye me-2 text-primary"></i>Differenziali Set &amp; Punti
                </span>
              </div>
              <span className="section-badge">{sortedSetAthletes.length} atleti</span>
            </div>

            <div className="grid-table-container">
              <div className="grid-table stat-ranking-set-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleDiffSetSort('pos')} title="Ordina per Posizione">
                    # {renderSortIndicator('pos', diffSetSortField, diffSetSortAsc)}
                  </div>
                  <div
                    className="grid-th text-left"
                    style={{ paddingLeft: '8px' }}
                    onClick={() => handleDiffSetSort('atleta')}
                    title="Ordina per Atleta (A-Z)"
                  >
                    Atleta {renderSortIndicator('atleta', diffSetSortField, diffSetSortAsc)}
                  </div>
                  <div className="grid-th text-left" onClick={() => handleDiffSetSort('squadra')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('squadra', diffSetSortField, diffSetSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Differenziale Set Vinti e Persi"
                    onClick={() => handleDiffSetSort('diffSet')}
                  >
                    Set (Diff) {renderSortIndicator('diffSet', diffSetSortField, diffSetSortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Differenziale Punti Gioco Vinti e Persi"
                    onClick={() => handleDiffSetSort('diffPunti')}
                  >
                    PvPg {renderSortIndicator('diffPunti', diffSetSortField, diffSetSortAsc)}
                  </div>
                  <div className="grid-th text-center" style={{ cursor: 'default' }}>Scheda</div>
                </div>

                {sortedSetAthletes.map((a, i) => {
                  const diffSet = a.setVinti - a.setPersi;
                  return (
                    <div
                      key={`set_${a.atleta}_${i}`}
                      className="grid-data-row"
                      style={{ cursor: a.atletaId ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (a.atletaId) onOpenAtletaModal(a.atletaId, a.atleta);
                      }}
                    >
                      <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                        {i + 1}
                      </div>
                      {renderAthleteNameCell(a)}
                      <div
                        className="grid-cell text-left"
                        style={{ overflow: 'hidden', padding: '0 8px', minWidth: 0 }}
                      >
                        <MarqueeText
                          text={a.squadra}
                          style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}
                        />
                      </div>
                      <div className="grid-cell text-center" style={{ color: '#334155', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        <span style={{ fontWeight: '600' }}>{a.setVinti}-{a.setPersi}</span>
                        <small style={{ marginLeft: '3px', color: diffSet > 0 ? '#15803d' : diffSet < 0 ? '#b91c1c' : '#64748b' }}>
                          ({diffSet > 0 ? `+${diffSet}` : diffSet})
                        </small>
                      </div>
                      <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                        {a.puntiVinti}-{a.puntiPersi}
                      </div>
                      {renderSchedaButton(a)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SUB-RANKING 4: TABELLONE COMPLETO (11 COLONNE) ==================== */}
        {subRanking === 'full' && (
          <div className="ranking-card-block">
            <div className="grid-table-container">
              <div className="grid-table statistiche-grid">
                <div className="grid-header-row">
                  <div
                    className="grid-th text-center"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('pos')}
                    title="Ordina per Posizione in Classifica"
                  >
                    # {renderSortIndicator('pos', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-left"
                    style={{ paddingLeft: '8px' }}
                    onClick={() => handleSort('atleta')}
                    title="Ordina per Atleta (A-Z)"
                  >
                    Atleta {renderSortIndicator('atleta', sortField, sortAsc)}
                  </div>
                  <div className="grid-th text-left" onClick={() => handleSort('squadra')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('squadra', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Incontri disputati"
                    onClick={() => handleSort('incontriDisputati')}
                  >
                    ID {renderSortIndicator('incontriDisputati', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite disputate"
                    onClick={() => handleSort('partiteDisputate')}
                  >
                    PD {renderSortIndicator('partiteDisputate', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite vinte"
                    onClick={() => handleSort('partiteVinte')}
                  >
                    PaV {renderSortIndicator('partiteVinte', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Partite perse"
                    onClick={() => handleSort('partitePerse')}
                  >
                    PaP {renderSortIndicator('partitePerse', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Set vinti e persi"
                    onClick={() => handleSort('setVinti')}
                  >
                    Set {renderSortIndicator('setVinti', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Punti vinti e persi"
                    onClick={() => handleSort('puntiVinti')}
                  >
                    Punti {renderSortIndicator('puntiVinti', sortField, sortAsc)}
                  </div>
                  <div
                    className="grid-th text-center"
                    title="Percentuale vittorie"
                    onClick={() => handleSort('percentualeVittorie')}
                  >
                    %pv {renderSortIndicator('percentualeVittorie', sortField, sortAsc)}
                  </div>
                  <div className="grid-th text-center" style={{ cursor: 'default' }}>Scheda</div>
                </div>

                {fullAthletes.map((a, i) => (
                  <div
                    key={`full_${a.atleta}_${i}`}
                    className="grid-data-row"
                    style={{ cursor: a.atletaId ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (a.atletaId) onOpenAtletaModal(a.atletaId, a.atleta);
                    }}
                  >
                    <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                      {a.posUfficiale}
                    </div>
                    {renderAthleteNameCell(a)}
                    <div
                      className="grid-cell text-left"
                      style={{ overflow: 'hidden', padding: '0 8px', minWidth: 0 }}
                    >
                      <MarqueeText
                        text={a.squadra}
                        style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}
                      />
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#475569' }}>
                      {a.incontriDisputati}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#475569' }}>
                      {a.partiteDisputate}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#15803d', fontWeight: '700' }}>
                      {a.partiteVinte}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#b91c1c' }}>
                      {a.partitePerse}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                      {a.setVinti}-{a.setPersi}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                      {a.puntiVinti}-{a.puntiPersi}
                    </div>
                    <div className="grid-cell text-center">
                      <span className={`badge ${getPctBadgeClass(a.percentualeVittorie)}`}>
                        {a.percentualeVittorie.toFixed(1)}%
                      </span>
                    </div>
                    {renderSchedaButton(a)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table Footnote */}
      <div
        style={{
          padding: '10px 20px',
          fontSize: '11px',
          color: '#64748b',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <span className="badge pct-100" style={{ marginRight: '4px' }}>
            100%
          </span>
          <span className="badge pct-high" style={{ marginRight: '4px' }}>
            ≥70%
          </span>
          <span className="badge pct-mid" style={{ marginRight: '4px' }}>
            ≥50%
          </span>
          <span className="badge pct-low" style={{ marginRight: '4px' }}>
            &gt;0%
          </span>
          <span className="badge pct-zero">0%</span>
        </div>
        <div>
          V/G: Vinte / Giocate • PaV: Partite Vinte • PaP: Perse • %pv: Vittorie • Scheda: Ranking FITeT
        </div>
      </div>
    </div>
  );
};
