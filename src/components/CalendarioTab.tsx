import React, { useState } from 'react';
import { GiornataCalendario, PartitaCalendario } from '../types/fitet';

interface CalendarioTabProps {
  calendario: GiornataCalendario[];
  selectedTeamFilter: string | null;
  onClearTeamFilter: () => void;
  onSelectTeamFilter: (team: string) => void;
}

export const CalendarioTab: React.FC<CalendarioTabProps> = ({
  calendario,
  selectedTeamFilter,
  onClearTeamFilter,
  onSelectTeamFilter,
}) => {
  const [selectedGiornata, setSelectedGiornata] = useState<number | 'all'>('all');
  const [faseFilter, setFaseFilter] = useState<'all' | 'andata' | 'ritorno'>('andata');

  const allTeams = Array.from(
    new Set(
      calendario.flatMap((g) => [
        ...g.partiteAndata.map((m) => m.squadraCasa),
        ...g.partiteAndata.map((m) => m.squadraOspite),
      ])
    )
  ).sort();

  const displayedGiornate = calendario.filter((g) => {
    if (selectedGiornata !== 'all' && g.numero !== selectedGiornata) return false;
    return true;
  });

  let totalDisplayedMatches = 0;

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left">
          {/* Phase Filter Buttons */}
          <div className="filter-btn-group">
            <button
              className={`filter-btn ${faseFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFaseFilter('all')}
            >
              Tutte le fasi
            </button>
            <button
              className={`filter-btn ${faseFilter === 'andata' ? 'active' : ''}`}
              onClick={() => setFaseFilter('andata')}
            >
              Andata
            </button>
            <button
              className={`filter-btn ${faseFilter === 'ritorno' ? 'active' : ''}`}
              onClick={() => setFaseFilter('ritorno')}
            >
              Ritorno
            </button>
          </div>

          {/* Giornata Select */}
          <select
            value={selectedGiornata}
            onChange={(e) =>
              setSelectedGiornata(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
            }
          >
            <option value="all">Tutte le giornate (1-9)</option>
            {calendario.map((g) => (
              <option key={g.numero} value={g.numero}>
                {g.numero}^ Giornata
              </option>
            ))}
          </select>

          {/* Team Select */}
          <select
            value={selectedTeamFilter || ''}
            onChange={(e) => onSelectTeamFilter(e.target.value)}
          >
            <option value="">Tutte le squadre</option>
            {allTeams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {selectedTeamFilter && (
            <button className="btn-action" onClick={onClearTeamFilter}>
              Rimuovi filtro: {selectedTeamFilter} ✕
            </button>
          )}
        </div>

        <div className="controls-right text-muted" style={{ fontSize: '12px' }}>
          Risultati ufficiali e referti federali
        </div>
      </div>

      {/* Calendar Grid Container (Responsive: Grid on Desktop, Wrapped Cards on Mobile) */}
      <div className="grid-table-container calendario-grid-container">
        <div className="grid-table calendario-grid">
          {/* Desktop Header Row */}
          <div className="grid-header-row">
            <div className="grid-th text-center">Fase</div>
            <div className="grid-th text-center">Data &amp; Ora</div>
            <div className="grid-th text-right" style={{ paddingRight: '16px' }}>Squadra Casa</div>
            <div className="grid-th text-center">Risultato</div>
            <div className="grid-th text-left" style={{ paddingLeft: '16px' }}>Squadra Ospite</div>
            <div className="grid-th text-center">Stato</div>
            <div className="grid-th text-center">Referto</div>
          </div>

          {/* Giornate & Match Rows */}
          {displayedGiornate.map((giornata) => {
            const matchesToDisplay: PartitaCalendario[] = [];
            if (faseFilter === 'all' || faseFilter === 'andata') {
              matchesToDisplay.push(...giornata.partiteAndata);
            }
            if (faseFilter === 'all' || faseFilter === 'ritorno') {
              matchesToDisplay.push(...giornata.partiteRitorno);
            }

            const filteredMatches = matchesToDisplay.filter((m) => {
              if (!selectedTeamFilter) return true;
              const filterNorm = selectedTeamFilter.toUpperCase();
              return (
                m.squadraCasa.toUpperCase().includes(filterNorm) ||
                m.squadraOspite.toUpperCase().includes(filterNorm)
              );
            });

            if (filteredMatches.length === 0) return null;
            totalDisplayedMatches += filteredMatches.length;

            return (
              <React.Fragment key={giornata.numero}>
                {/* Giornata Section Divider */}
                <div className="grid-section-divider">
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: '13.5px', fontWeight: '700', color: 'var(--color-primary-700)' }}>
                    {giornata.titolo}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                    {filteredMatches.length} incontri
                  </span>
                </div>

                {/* Match Rows */}
                {filteredMatches.map((m) => {
                  const isCasaWinner = m.vincitore === 'casa';
                  const isOspiteWinner = m.vincitore === 'ospite';

                  return (
                    <div key={m.id} className="calendario-match-row">
                      {/* Meta Group: Fase, Data&Ora, Mobile Stato & Referto */}
                      <div className="match-meta-group">
                        <span
                          className={`badge ${m.tipo === 'andata' ? 'pct-high' : 'pct-mid'}`}
                          style={{ fontSize: '10px' }}
                        >
                          {m.tipo.toUpperCase()}
                        </span>

                        <span className="match-datetime">
                          {m.data} • {m.ora}
                        </span>

                        <div className="mobile-meta-right">
                          {m.disputato ? (
                            <span className="badge pct-100" style={{ fontSize: '10px' }}>
                              Disputato
                            </span>
                          ) : (
                            <span className="badge pct-zero" style={{ fontSize: '10px' }}>
                              In programma
                            </span>
                          )}

                          {m.refertoUrl && (
                            <a
                              href={m.refertoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-action"
                              title="Visualizza referto di gara sul portale FITeT"
                            >
                              Apri ↗
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Squadra Casa */}
                      <div
                        className={`match-team-casa ${isCasaWinner ? 'is-winner' : 'is-not-winner'}`}
                        onClick={() => onSelectTeamFilter(m.squadraCasa)}
                        title={`Filtra per ${m.squadraCasa}`}
                      >
                        <span className="team-name">{m.squadraCasa}</span>
                        <span className="mobile-score-val">
                          {m.disputato ? (m.puntiCasa !== null ? m.puntiCasa : '-') : '-'}
                        </span>
                      </div>

                      {/* Desktop Center Score Box */}
                      <div className="match-score-desktop">
                        <span className={`score-box ${m.disputato ? 'played' : ''}`}>
                          {m.risultato}
                        </span>
                      </div>

                      {/* Squadra Ospite */}
                      <div
                        className={`match-team-ospite ${isOspiteWinner ? 'is-winner' : 'is-not-winner'}`}
                        onClick={() => onSelectTeamFilter(m.squadraOspite)}
                        title={`Filtra per ${m.squadraOspite}`}
                      >
                        <span className="team-name">{m.squadraOspite}</span>
                        <span className="mobile-score-val">
                          {m.disputato ? (m.puntiOspite !== null ? m.puntiOspite : '-') : '-'}
                        </span>
                      </div>

                      {/* Desktop Status */}
                      <div className="match-status-desktop">
                        {m.disputato ? (
                          <span className="badge pct-100" style={{ fontSize: '10.5px' }}>
                            Disputato
                          </span>
                        ) : (
                          <span className="badge pct-zero" style={{ fontSize: '10.5px' }}>
                            In programma
                          </span>
                        )}
                      </div>

                      {/* Desktop Referto Link */}
                      <div className="match-referto-desktop">
                        {m.refertoUrl ? (
                          <a
                            href={m.refertoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-action"
                            title="Visualizza referto di gara sul portale FITeT"
                          >
                            Apri ↗
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {totalDisplayedMatches === 0 && (
            <div style={{ padding: '36px 16px', color: '#64748b', textAlign: 'center' }}>
              Nessun incontro trovato con i filtri selezionati.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
