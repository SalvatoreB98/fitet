import React, { useState, useMemo, useRef } from 'react';
import { SquadraClassifica } from '../types/fitet';
import { MarqueeText } from './MarqueeText';
import { TeamLogo } from './TeamLogo';

interface ClassificaTabProps {
  classifica: SquadraClassifica[];
  onSelectTeam: (teamName: string, squadraId?: string) => void;
}

export const ClassificaTab: React.FC<ClassificaTabProps> = ({ classifica, onSelectTeam }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'responsive' | 'completa'>('responsive');

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

  // Sorting state for 1. Classifica Ufficiale (Primary)
  const [ufficialeSortField, setUfficialeSortField] = useState<string>('pos');
  const [ufficialeSortAsc, setUfficialeSortAsc] = useState<boolean>(true);

  // Sorting state for 2. Approfondimento 1 (Bilancio Gare & Forma)
  const [bilancioSortField, setBilancioSortField] = useState<string>('pos');
  const [bilancioSortAsc, setBilancioSortAsc] = useState<boolean>(true);

  // Sorting state for 3. Approfondimento 2 (Differenziali)
  const [diffSortField, setDiffSortField] = useState<string>('pos');
  const [diffSortAsc, setDiffSortAsc] = useState<boolean>(true);

  // Sorting state for 4. Tabellone Completo (10 Colonne)
  const [completaSortField, setCompletaSortField] = useState<string>('pos');
  const [completaSortAsc, setCompletaSortAsc] = useState<boolean>(true);

  const filteredTeams = useMemo(() => {
    return classifica.filter((sq) =>
      sq.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [classifica, searchTerm]);

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
        // Default ascending for position/team name, descending for score metrics
        setAsc(field === 'pos' || field === 'nome');
      }
    };
  };

  const handleUfficialeSort = createSortHandler(ufficialeSortField, setUfficialeSortField, ufficialeSortAsc, setUfficialeSortAsc);
  const handleBilancioSort = createSortHandler(bilancioSortField, setBilancioSortField, bilancioSortAsc, setBilancioSortAsc);
  const handleDiffSort = createSortHandler(diffSortField, setDiffSortField, diffSortAsc, setDiffSortAsc);
  const handleCompletaSort = createSortHandler(completaSortField, setCompletaSortField, completaSortAsc, setCompletaSortAsc);

  // Indicator displaying current sort direction or hoverable hint
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

  // 1. Sorted Teams for Classifica Ufficiale
  const sortedUfficialeTeams = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      let valA: any = a.posizione;
      let valB: any = b.posizione;
      if (ufficialeSortField === 'pos') {
        valA = a.posizione; valB = b.posizione;
      } else if (ufficialeSortField === 'nome') {
        return ufficialeSortAsc ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
      } else if (ufficialeSortField === 'g') {
        valA = a.incontriDisputati; valB = b.incontriDisputati;
      } else if (ufficialeSortField === 'punti') {
        valA = a.punti; valB = b.punti;
      }
      if (valA !== valB) {
        return ufficialeSortAsc ? (valA > valB ? 1 : -1) : (valB > valA ? 1 : -1);
      }
      return a.posizione - b.posizione;
    });
  }, [filteredTeams, ufficialeSortField, ufficialeSortAsc]);

  // 2. Sorted Teams for Approfondimento 1 (Bilancio Gare & Forma)
  const sortedBilancioTeams = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      let valA: any = a.posizione;
      let valB: any = b.posizione;
      if (bilancioSortField === 'pos') {
        valA = a.posizione; valB = b.posizione;
      } else if (bilancioSortField === 'nome') {
        return bilancioSortAsc ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
      } else if (bilancioSortField === 'iv') {
        valA = a.incontriVinti; valB = b.incontriVinti;
      } else if (bilancioSortField === 'ip') {
        valA = a.incontriPersi; valB = b.incontriPersi;
      } else if (bilancioSortField === 'forma') {
        valA = (a.forma || []).filter((f) => f === 'V').length;
        valB = (b.forma || []).filter((f) => f === 'V').length;
      }
      if (valA !== valB) {
        return bilancioSortAsc ? (valA > valB ? 1 : -1) : (valB > valA ? 1 : -1);
      }
      return a.posizione - b.posizione;
    });
  }, [filteredTeams, bilancioSortField, bilancioSortAsc]);

  // 3. Sorted Teams for Approfondimento 2 (Differenziali)
  const sortedDiffTeams = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      let valA: any = a.posizione;
      let valB: any = b.posizione;
      if (diffSortField === 'pos') {
        valA = a.posizione; valB = b.posizione;
      } else if (diffSortField === 'nome') {
        return diffSortAsc ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
      } else if (diffSortField === 'diffPartite') {
        valA = a.diffPartite; valB = b.diffPartite;
      } else if (diffSortField === 'diffSet') {
        valA = a.diffSet; valB = b.diffSet;
      } else if (diffSortField === 'diffPunti') {
        valA = a.diffPunti || (a.puntiVinti - a.puntiPersi);
        valB = b.diffPunti || (b.puntiVinti - b.puntiPersi);
      }
      if (valA !== valB) {
        return diffSortAsc ? (valA > valB ? 1 : -1) : (valB > valA ? 1 : -1);
      }
      return a.posizione - b.posizione;
    });
  }, [filteredTeams, diffSortField, diffSortAsc]);

  // 4. Sorted Teams for Tabellone Completo (11 Colonne)
  const sortedCompletaTeams = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      let valA: any = a.posizione;
      let valB: any = b.posizione;
      if (completaSortField === 'pos') {
        valA = a.posizione; valB = b.posizione;
      } else if (completaSortField === 'nome') {
        return completaSortAsc ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
      } else if (completaSortField === 'punti') {
        valA = a.punti; valB = b.punti;
      } else if (completaSortField === 'id') {
        valA = a.incontriDisputati; valB = b.incontriDisputati;
      } else if (completaSortField === 'iv') {
        valA = a.incontriVinti; valB = b.incontriVinti;
      } else if (completaSortField === 'ip') {
        valA = a.incontriPersi; valB = b.incontriPersi;
      } else if (completaSortField === 'diffPartite') {
        valA = a.diffPartite; valB = b.diffPartite;
      } else if (completaSortField === 'diffSet') {
        valA = a.diffSet; valB = b.diffSet;
      } else if (completaSortField === 'diffPunti') {
        valA = a.diffPunti || (a.puntiVinti - a.puntiPersi);
        valB = b.diffPunti || (b.puntiVinti - b.puntiPersi);
      } else if (completaSortField === 'forma') {
        valA = (a.forma || []).filter((f) => f === 'V').length;
        valB = (b.forma || []).filter((f) => f === 'V').length;
      }
      if (valA !== valB) {
        return completaSortAsc ? (valA > valB ? 1 : -1) : (valB > valA ? 1 : -1);
      }
      return a.posizione - b.posizione;
    });
  }, [filteredTeams, completaSortField, completaSortAsc]);

  const getPosClass = (pos: number) => {
    return pos === 1 ? 'pos-gold' : pos === 2 ? 'pos-silver' : pos === 3 ? 'pos-bronze' : '';
  };

  const renderPosBadge = (pos: number) => {
    if (pos === 1) {
      return (
        <span className="pos-badge-podium pos-badge-gold" title="1° Posto (Promozione Diretta)">
          <i className="bi bi-trophy-fill"></i>
        </span>
      );
    }
    if (pos === 2) {
      return (
        <span className="pos-badge-podium pos-badge-silver" title="2° Posto (Playoff Promozione)">
          <i className="bi bi-award-fill"></i>
        </span>
      );
    }
    if (pos === 3) {
      return (
        <span className="pos-badge-podium pos-badge-bronze" title="3° Posto (Playoff Promozione)">
          <i className="bi bi-award-fill"></i>
        </span>
      );
    }
    return <span className="pos-num-plain">{pos}</span>;
  };

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left classifica">
          {/* Expandable Search Control */}
          <div className={`search-expandable-box ${(isSearchOpen || searchTerm) ? 'is-open' : ''}`}>
            <button
              type="button"
              className={`btn-search-trigger ${(isSearchOpen || searchTerm) ? 'active' : ''}`}
              onClick={toggleSearch}
              title={isSearchOpen || searchTerm ? 'Chiudi ricerca' : 'Cerca squadra...'}
            >
              <i className="bi bi-search"></i>
            </button>
            <div className="search-expandable-content">
              <input
                ref={searchInputRef}
                type="text"
                className="search-expandable-input"
                placeholder="Cerca squadra..."
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

          {/* View mode switcher */}

          <button
            type="button"
            className={`sub-pill-btn ${viewMode === 'responsive' ? 'active' : ''}`}
            onClick={() => setViewMode('responsive')}
            title="Classifica ufficiale e viste di dettaglio"
          >
            <i className="bi bi-view-list me-1"></i> Viste Separate
          </button>
          <button
            type="button"
            className={`sub-pill-btn ${viewMode === 'completa' ? 'active' : ''}`}
            onClick={() => setViewMode('completa')}
            title="Tabellone con tutte le metriche"
          >
            <i className="bi bi-table me-1"></i> Tabellone Completo
          </button>
        </div>
      </div>

      {viewMode === 'responsive' ? (
        /* ==================== VISTE SEPARATE (ZERO SCROLL) ==================== */
        <div style={{ padding: '0 0 4px 0' }}>
          {/* 1. CLASSIFICA UFFICIALE (GERARCHICAMENTE PRINCIPALE / VALORE FEDERALE) */}
          <div className="ranking-card-block primary-official">
            <div className="ranking-section-header official-header">
              <div className="official-title-group">
                <span className="official-crown">
                  <i className="bi bi-trophy-fill text-warning"></i>
                </span>
                <div>
                  <div className="official-main-title">Classifica Ufficiale</div>
                </div>
              </div>
              <div className="official-badge-group">
                <span className="section-badge">{sortedUfficialeTeams.length} squadre</span>
              </div>
            </div>

            <div className="grid-table-container">
              <div className="grid-table classifica-ufficiale-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleUfficialeSort('pos')} title="Ordina per Posizione">
                    Pos {renderSortIndicator('pos', ufficialeSortField, ufficialeSortAsc)}
                  </div>
                  <div className="grid-th text-left" style={{ paddingLeft: '8px' }} onClick={() => handleUfficialeSort('nome')} title="Ordina per Squadra">
                    Squadra {renderSortIndicator('nome', ufficialeSortField, ufficialeSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri disputati" onClick={() => handleUfficialeSort('g')}>
                    G {renderSortIndicator('g', ufficialeSortField, ufficialeSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Punti Classifica Ufficiali" onClick={() => handleUfficialeSort('punti')}>
                    Punti {renderSortIndicator('punti', ufficialeSortField, ufficialeSortAsc)}
                  </div>
                </div>

                {sortedUfficialeTeams.map((sq) => (
                  <div
                    key={sq.squadraId}
                    className="grid-data-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectTeam(sq.nome, sq.squadraId)}
                    title={`Visualizza scheda squadra ${sq.nome}`}
                  >
                    {/* Position */}
                    <div className="grid-cell text-center">
                      {renderPosBadge(sq.posizione)}
                    </div>

                    {/* Team */}
                    <div className="grid-cell text-left" style={{ paddingLeft: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', width: '100%', minWidth: 0 }}>
                        <div className="standings-team-photo-wrapper">
                          <TeamLogo
                            teamName={sq.nome}
                            logoUrl={sq.logoUrl}
                            className="standings-team-logo"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <MarqueeText
                            text={sq.nome}
                            style={{
                              fontWeight: '600',
                              color: 'var(--text-dark)',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Giocate */}
                    <div className="grid-cell text-center" style={{ color: 'var(--text-muted)', fontWeight: '600' }}>
                      {sq.incontriDisputati}
                    </div>

                    {/* Points Official Badge */}
                    <div className="grid-cell text-center">
                      <span className="badge-points-official">
                        {sq.punti} pt
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanatory Footer Note on Promotion Rules */}
            <div className="official-card-footer">
              {/* <i className="bi bi-info-circle-fill" style={{ color: 'var(--color-primary-600)' }}></i> */}
            </div>
          </div>

          {/* ==========================================================================
             HIERARCHY DIVIDER (Tra Classifica Ufficiale e Approfondimenti Statistici)
             ========================================================================== */}
          <div className="ranking-hierarchy-divider">
            <div className="hierarchy-divider-line"></div>
            <div className="hierarchy-divider-badge">
              <i className="bi bi-bar-chart-steps"></i>
              <span>ALTRE STATISTICHE</span>
            </div>
            <div className="hierarchy-divider-line"></div>
          </div>
          <div className="ranking-hierarchy-hint">
            Clicca sulle intestazioni per ordinare liberamente per incontri vinti, persi, differenziali set o forma.
          </div>

          {/* 2. SOTTO: Bilancio Gare & Stato di Forma (Approfondimento 1) */}
          <div className="ranking-card-block secondary-stats">
            <div className="ranking-section-header secondary-header">
              <div className="secondary-title-group">
                <span>
                  <i className="bi bi-bar-chart-line-fill me-2 text-primary"></i>Bilancio Gare &amp; Stato di Forma
                </span>
              </div>
              <span className="section-badge">IV: Vinte • IP: Perse</span>
            </div>

            <div className="grid-table-container">
              <div className="grid-table classifica-bilancio-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleBilancioSort('pos')} title="Ordina per Posizione federale">
                    Pos {renderSortIndicator('pos', bilancioSortField, bilancioSortAsc)}
                  </div>
                  <div className="grid-th text-left" style={{ paddingLeft: '8px' }} onClick={() => handleBilancioSort('nome')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('nome', bilancioSortField, bilancioSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri vinti" onClick={() => handleBilancioSort('iv')}>
                    IV {renderSortIndicator('iv', bilancioSortField, bilancioSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri persi" onClick={() => handleBilancioSort('ip')}>
                    IP {renderSortIndicator('ip', bilancioSortField, bilancioSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Stato di forma recente (vittorie consecutive)" onClick={() => handleBilancioSort('forma')}>
                    Forma Recente {renderSortIndicator('forma', bilancioSortField, bilancioSortAsc)}
                  </div>
                </div>

                {sortedBilancioTeams.map((sq) => (
                  <div
                    key={`bil_${sq.squadraId}`}
                    className="grid-data-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectTeam(sq.nome, sq.squadraId)}
                    title={`Visualizza scheda squadra ${sq.nome}`}
                  >
                    <div className="grid-cell text-center">
                      {renderPosBadge(sq.posizione)}
                    </div>

                    <div className="grid-cell text-left" style={{ paddingLeft: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', width: '100%', minWidth: 0 }}>
                        <div className="standings-team-photo-wrapper">
                          <TeamLogo
                            teamName={sq.nome}
                            logoUrl={sq.logoUrl}
                            className="standings-team-logo"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <MarqueeText
                            text={sq.nome}
                            style={{
                              fontWeight: '600',
                              color: 'var(--text-dark)',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid-cell text-center" style={{ color: '#16a34a', fontWeight: '700' }}>
                      {sq.incontriVinti}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#dc2626' }}>
                      {sq.incontriPersi}
                    </div>

                    <div className="grid-cell text-center" style={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                      {sq.forma && sq.forma.length > 0 ? (
                        sq.forma.map((f, i) => (
                          <span
                            key={i}
                            className={`form-pill form-${f.toLowerCase()}`}
                            title={f === 'V' ? 'Vinto' : f === 'P' ? 'Perso' : 'Pari'}
                          >
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. SOTTO: Differenziali Partite, Set & Punti Gioco (Approfondimento 2) */}
          <div className="ranking-card-block secondary-stats">
            <div className="ranking-section-header secondary-header">
              <div className="secondary-title-group">
                <span>
                  <i className="bi bi-bullseye me-2 text-primary"></i>Differenziali Partite, Set &amp; Punti
                </span>
              </div>
              <span className="section-badge">Partite • Set • Punti</span>
            </div>

            <div className="grid-table-container">
              <div className="grid-table classifica-differenziali-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleDiffSort('pos')} title="Ordina per Posizione federale">
                    Pos {renderSortIndicator('pos', diffSortField, diffSortAsc)}
                  </div>
                  <div className="grid-th text-left" style={{ paddingLeft: '8px' }} onClick={() => handleDiffSort('nome')} title="Ordina per Squadra (A-Z)">
                    Squadra {renderSortIndicator('nome', diffSortField, diffSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Partite vinte e perse con differenziale" onClick={() => handleDiffSort('diffPartite')}>
                    Partite (Diff) {renderSortIndicator('diffPartite', diffSortField, diffSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Set vinti e persi con differenziale" onClick={() => handleDiffSort('diffSet')}>
                    Set (Diff) {renderSortIndicator('diffSet', diffSortField, diffSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Differenziale Punti gioco vinti e persi" onClick={() => handleDiffSort('diffPunti')}>
                    Punti {renderSortIndicator('diffPunti', diffSortField, diffSortAsc)}
                  </div>
                </div>

                {sortedDiffTeams.map((sq) => (
                  <div
                    key={`diff_${sq.squadraId}`}
                    className="grid-data-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectTeam(sq.nome, sq.squadraId)}
                    title={`Visualizza scheda squadra ${sq.nome}`}
                  >
                    <div className="grid-cell text-center">
                      {renderPosBadge(sq.posizione)}
                    </div>

                    <div className="grid-cell text-left" style={{ paddingLeft: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', width: '100%', minWidth: 0 }}>
                        <div className="standings-team-photo-wrapper">
                          <TeamLogo
                            teamName={sq.nome}
                            logoUrl={sq.logoUrl}
                            className="standings-team-logo"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <MarqueeText
                            text={sq.nome}
                            style={{
                              fontWeight: '600',
                              color: 'var(--text-dark)',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid-cell text-center" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: '600' }}>
                        {sq.partiteVinte}-{sq.partitePerse}
                      </span>
                      <span
                        className={`badge ${sq.diffPartite > 0 ? 'pct-100' : sq.diffPartite < 0 ? 'pct-low' : 'pct-zero'
                          }`}
                        style={{ marginLeft: '4px' }}
                      >
                        {sq.diffPartite > 0 ? `+${sq.diffPartite}` : sq.diffPartite}
                      </span>
                    </div>

                    <div className="grid-cell text-center" style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {sq.setVinti}-{sq.setPersi}
                      <small style={{ marginLeft: '2px' }}>
                        ({sq.diffSet > 0 ? `+${sq.diffSet}` : sq.diffSet})
                      </small>
                    </div>

                    <div className="grid-cell text-center" style={{ color: '#64748b', fontSize: '12px' }}>
                      {sq.puntiVinti}-{sq.puntiPersi}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== TABELLONE COMPLETO (10 COLONNE) ==================== */
        <div style={{ padding: '6px 0 16px 0' }}>
          <div className="ranking-card-block primary-official">
            <div className="ranking-section-header official-header">
              <div className="official-title-group">
                <span className="official-crown">
                  <i className="bi bi-trophy-fill text-warning"></i>
                </span>
                <div>
                  <div className="official-main-title">Tabellone Completo Classifica</div>
                </div>
              </div>
              <div className="official-badge-group">
                <span className="section-badge">{sortedCompletaTeams.length} squadre</span>
              </div>
            </div>

            <div className="grid-table-container">
              <div className="grid-table classifica-grid">
                <div className="grid-header-row">
                  <div className="grid-th text-center" onClick={() => handleCompletaSort('pos')} title="Ordina per Posizione">
                    Pos {renderSortIndicator('pos', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th grid-th-team text-left" style={{ paddingLeft: '8px' }} onClick={() => handleCompletaSort('nome')} title="Ordina per Squadra">
                    Squadra {renderSortIndicator('nome', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" onClick={() => handleCompletaSort('punti')} title="Ordina per Punti">
                    Punti {renderSortIndicator('punti', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri disputati" onClick={() => handleCompletaSort('id')}>
                    ID {renderSortIndicator('id', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri vinti" onClick={() => handleCompletaSort('iv')}>
                    IV {renderSortIndicator('iv', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Incontri persi" onClick={() => handleCompletaSort('ip')}>
                    IP {renderSortIndicator('ip', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Partite vinte e perse" onClick={() => handleCompletaSort('diffPartite')}>
                    Partite (Diff) {renderSortIndicator('diffPartite', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Set vinti e persi" onClick={() => handleCompletaSort('diffSet')}>
                    Set (Diff) {renderSortIndicator('diffSet', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Punti gioco vinti e persi" onClick={() => handleCompletaSort('diffPunti')}>
                    Punti {renderSortIndicator('diffPunti', completaSortField, completaSortAsc)}
                  </div>
                  <div className="grid-th text-center" title="Stato di forma" onClick={() => handleCompletaSort('forma')}>
                    Forma {renderSortIndicator('forma', completaSortField, completaSortAsc)}
                  </div>
                </div>

                {sortedCompletaTeams.map((sq) => (
                  <div
                    key={sq.squadraId}
                    className="grid-data-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectTeam(sq.nome, sq.squadraId)}
                    title={`Visualizza scheda squadra ${sq.nome}`}
                  >
                    <div className="grid-cell text-center">
                      {renderPosBadge(sq.posizione)}
                    </div>

                    <div className="grid-cell grid-cell-team text-left" style={{ paddingLeft: '8px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', width: '100%', minWidth: 0 }}>
                        <div className="standings-team-photo-wrapper">
                          <TeamLogo
                            teamName={sq.nome}
                            logoUrl={sq.logoUrl}
                            className="standings-team-logo"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <MarqueeText
                            text={sq.nome}
                            style={{
                              fontWeight: '600',
                              color: 'var(--text-dark)',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid-cell text-center">
                      <span className="badge-points-official">
                        {sq.punti} pt
                      </span>
                    </div>

                    <div className="grid-cell text-center" style={{ color: 'var(--text-muted)', fontWeight: '600' }}>
                      {sq.incontriDisputati}
                    </div>

                    <div className="grid-cell text-center" style={{ color: '#16a34a', fontWeight: '700' }}>
                      {sq.incontriVinti}
                    </div>
                    <div className="grid-cell text-center" style={{ color: '#dc2626' }}>
                      {sq.incontriPersi}
                    </div>

                    <div className="grid-cell text-center" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: '600' }}>
                        {sq.partiteVinte}-{sq.partitePerse}
                      </span>
                      <span
                        className={`badge ${sq.diffPartite > 0 ? 'pct-100' : sq.diffPartite < 0 ? 'pct-low' : 'pct-zero'
                          }`}
                        style={{ marginLeft: '4px' }}
                      >
                        {sq.diffPartite > 0 ? `+${sq.diffPartite}` : sq.diffPartite}
                      </span>
                    </div>

                    <div className="grid-cell text-center" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {sq.setVinti}-{sq.setPersi}
                      <small style={{ marginLeft: '2px' }}>
                        ({sq.diffSet > 0 ? `+${sq.diffSet}` : sq.diffSet})
                      </small>
                    </div>

                    <div className="grid-cell text-center" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {sq.puntiVinti}-{sq.puntiPersi}
                    </div>

                    <div className="grid-cell text-center" style={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                      {sq.forma && sq.forma.length > 0 ? (
                        sq.forma.map((f, i) => (
                          <span
                            key={i}
                            className={`form-pill form-${f.toLowerCase()}`}
                            title={f === 'V' ? 'Vinto' : f === 'P' ? 'Perso' : 'Pari'}
                          >
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="official-card-footer">
              <i className="bi bi-info-circle-fill" style={{ color: 'var(--color-primary-600)' }}></i>
              <span>
                <strong>Legenda:</strong> ID: Incontri disputati • IV: Vinti • IP: Persi • Diff: Differenziale
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Legend Footnote */}
      <div className="table-portal-footer">
      </div>
    </div>
  );
};
