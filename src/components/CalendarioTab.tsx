import React, { useState } from 'react';
import { GiornataCalendario, PartitaCalendario } from '../types/fitet';
import { MarqueeText } from './MarqueeText';

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
  const [faseFilter, setFaseFilter] = useState<'all' | 'andata' | 'ritorno'>('all');

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
          Risultati ufficiali e referti federali FITeT
        </div>
      </div>

      {/* Calendario Match Cards Container */}
      <div className="calendario-cards-container">
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
            <section key={giornata.numero} className="giornata-section">
              {/* Giornata Header Banner */}
              <div className="giornata-header-banner">
                <div className="giornata-title-group">
                  <span className="giornata-badge-pill">{giornata.numero}ª GIORNATA</span>
                  <span className="giornata-phase-text">Incontri di Campionato</span>
                </div>
                <div className="giornata-meta-count">
                  {filteredMatches.length} {filteredMatches.length === 1 ? 'incontro' : 'incontri'}
                </div>
              </div>

              {/* Responsive Cards Grid */}
              <div className="match-cards-grid">
                {filteredMatches.map((m) => {
                  const isCasaWinner = m.vincitore === 'casa';
                  const isOspiteWinner = m.vincitore === 'ospite';

                  return (
                    <article key={m.id} className="match-card">
                      {/* Card Top: Phase, Date, Time & Status */}
                      <div className="match-card-top">
                        <div className="match-card-top-left">
                          <span
                            className={`match-phase-badge ${
                              m.tipo === 'andata' ? 'phase-andata' : 'phase-ritorno'
                            }`}
                          >
                            {m.tipo.toUpperCase()}
                          </span>
                          <span className="match-card-datetime">
                            📅 {m.data} • 🕒 {m.ora}
                          </span>
                        </div>

                        <div className="match-card-top-right">
                          {m.disputato ? (
                            <span className="match-status-badge status-disputato">
                              ✓ Disputato
                            </span>
                          ) : (
                            <span className="match-status-badge status-programmato">
                              ⏳ In programma
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Teams & Scores */}
                      <div className="match-card-teams">
                        {/* Squadra Casa */}
                        <div
                          className={`match-card-team-row ${isCasaWinner ? 'is-winner' : ''}`}
                          onClick={() => onSelectTeamFilter(m.squadraCasa)}
                          title={`Filtra incontri per ${m.squadraCasa}`}
                        >
                          <div className="match-card-team-left">
                            <span className="team-role-tag role-casa">CASA</span>
                            <div className="match-card-name-wrapper">
                              <MarqueeText
                                text={m.squadraCasa}
                                style={{
                                  fontSize: '13.5px',
                                  fontWeight: isCasaWinner ? '700' : '600',
                                  color: isCasaWinner ? 'var(--color-primary-700, #1d4ed8)' : 'var(--text-dark)',
                                }}
                              />
                            </div>
                            {isCasaWinner && (
                              <span className="winner-trophy" title="Vincitore incontro">
                                🏆
                              </span>
                            )}
                          </div>

                          <div
                            className={`match-card-score-box ${
                              isCasaWinner
                                ? 'score-winner'
                                : m.disputato
                                ? 'score-played'
                                : 'score-pending'
                            }`}
                          >
                            {m.disputato ? (m.puntiCasa !== null ? m.puntiCasa : '-') : '-'}
                          </div>
                        </div>

                        {/* Squadra Ospite */}
                        <div
                          className={`match-card-team-row ${isOspiteWinner ? 'is-winner' : ''}`}
                          onClick={() => onSelectTeamFilter(m.squadraOspite)}
                          title={`Filtra incontri per ${m.squadraOspite}`}
                        >
                          <div className="match-card-team-left">
                            <span className="team-role-tag role-ospite">OSPITE</span>
                            <div className="match-card-name-wrapper">
                              <MarqueeText
                                text={m.squadraOspite}
                                style={{
                                  fontSize: '13.5px',
                                  fontWeight: isOspiteWinner ? '700' : '600',
                                  color: isOspiteWinner ? 'var(--color-primary-700, #1d4ed8)' : 'var(--text-dark)',
                                }}
                              />
                            </div>
                            {isOspiteWinner && (
                              <span className="winner-trophy" title="Vincitore incontro">
                                🏆
                              </span>
                            )}
                          </div>

                          <div
                            className={`match-card-score-box ${
                              isOspiteWinner
                                ? 'score-winner'
                                : m.disputato
                                ? 'score-played'
                                : 'score-pending'
                            }`}
                          >
                            {m.disputato ? (m.puntiOspite !== null ? m.puntiOspite : '-') : '-'}
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom: Summary & Referto FITeT */}
                      <div className="match-card-bottom">
                        <div className="match-card-summary">
                          {m.disputato ? (
                            <span>
                              Risultato: <strong style={{ color: 'var(--text-dark)' }}>{m.risultato}</strong>
                              {isCasaWinner && ''}
                              {isOspiteWinner && ''}
                              {m.vincitore === 'pareggio' && ' • Pareggio'}
                            </span>
                          ) : (
                            <span></span>
                          )}
                        </div>

                        {m.refertoUrl && Date.now() > new Date(m.data).getTime() && (
                          <a
                            href={m.refertoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-referto-link"
                            title="Visualizza referto di gara sul portale FITeT"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>Dettaglio partita</span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        {totalDisplayedMatches === 0 && (
          <div className="no-matches-found">
            <span style={{ fontSize: '32px' }}>🏓</span>
            <p style={{ margin: '4px 0', fontWeight: 600 }}>Nessun incontro trovato con i filtri selezionati.</p>
            {selectedTeamFilter && (
              <button
                className="btn-action"
                onClick={onClearTeamFilter}
                style={{ marginTop: '8px' }}
              >
                Rimuovi filtro ({selectedTeamFilter}) ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
