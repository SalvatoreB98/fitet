import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GiornataCalendario, PartitaCalendario } from '../types/fitet';
import { MarqueeText } from './MarqueeText';
import { RefertoModal } from './RefertoModal';
import { TeamLogo } from './TeamLogo';

interface CalendarioTabProps {
  calendario: GiornataCalendario[];
  selectedTeamFilter: string | null;
  statisticheAtleti?: Array<{ atleta: string; atletaId: string | null }>;
  isSubmodalOpen?: boolean;
  onClearTeamFilter: () => void;
  onSelectTeamFilter: (team: string) => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
  onOpenSquadraModal?: (teamName: string) => void;
  currentCamId?: number;
}

interface BloccoFaseGiornata {
  key: string;
  numero: number;
  fase: 'andata' | 'ritorno';
  partite: PartitaCalendario[];
  targetDate: Date | null;
}

/**
 * Converte la stringa data FITeT (es. "DD/MM/YYYY" o standard ISO) in oggetto Date.
 */
const parseMatchDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  } else {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const shouldShowReferto = (match: PartitaCalendario): boolean => {
  if (!match.refertoUrl) return false;
  if (match.disputato) return true;
  const matchDate = parseMatchDate(match.data);
  if (!matchDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  matchDate.setHours(0, 0, 0, 0);

  return today.getTime() >= matchDate.getTime();
};

export const CalendarioTab: React.FC<CalendarioTabProps> = ({
  calendario,
  selectedTeamFilter,
  statisticheAtleti,
  isSubmodalOpen,
  onClearTeamFilter,
  onSelectTeamFilter,
  onOpenAtletaModal,
  onOpenSquadraModal,
  currentCamId,
}) => {
  const [selectedGiornata, setSelectedGiornata] = useState<number | 'all'>('all');
  const [faseFilter, setFaseFilter] = useState<'all' | 'andata' | 'ritorno'>('all');
  const [selectedReferto, setSelectedReferto] = useState<{
    incontroId: string;
    camId?: string;
    formulaId?: string;
    casa?: string;
    ospite?: string;
  } | null>(null);

  // Mappa dei ref per ogni blocco giornata
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const hasScrolledRef = useRef(false);

  const handleOpenReferto = (m: PartitaCalendario) => {
    let incontroId = m.incontroId;
    let camId = String(currentCamId);
    let formulaId = m.formula ? String(m.formula) : '19';

    if (m.refertoUrl) {
      const incMatch = m.refertoUrl.match(/INCONTRO=(\d+)/i);
      const camMatch = m.refertoUrl.match(/CAM=(\d+)/i);
      const formMatch = m.refertoUrl.match(/FORMULA=(\d+)/i);

      if (incMatch) incontroId = incMatch[1];
      if (camMatch) camId = camMatch[1];
      if (formMatch) formulaId = formMatch[1];
    }

    if (incontroId) {
      setSelectedReferto({
        incontroId,
        camId,
        formulaId,
        casa: m.squadraCasa,
        ospite: m.squadraOspite,
      });
    }
  };

  const allTeams = useMemo(() => {
    return Array.from(
      new Set(
        calendario.flatMap((g) => [
          ...g.partiteAndata.map((m) => m.squadraCasa),
          ...g.partiteAndata.map((m) => m.squadraOspite),
        ])
      )
    ).sort();
  }, [calendario]);

  // 1. Separa andata e ritorno in blocchi distinti e calcola la data di riferimento
  const blocchiFasi = useMemo<BloccoFaseGiornata[]>(() => {
    const list: BloccoFaseGiornata[] = [];

    calendario.forEach((g) => {
      // Blocco Andata
      if (g.partiteAndata && g.partiteAndata.length > 0) {
        const dates = g.partiteAndata.map((p) => parseMatchDate(p.data)).filter(Boolean) as Date[];
        const targetDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
        list.push({
          key: `${g.numero}-andata`,
          numero: g.numero,
          fase: 'andata',
          partite: g.partiteAndata,
          targetDate,
        });
      }

      // Blocco Ritorno
      if (g.partiteRitorno && g.partiteRitorno.length > 0) {
        const dates = g.partiteRitorno.map((p) => parseMatchDate(p.data)).filter(Boolean) as Date[];
        const targetDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
        list.push({
          key: `${g.numero}-ritorno`,
          numero: g.numero,
          fase: 'ritorno',
          partite: g.partiteRitorno,
          targetDate,
        });
      }
    });

    // Ordina tutti i blocchi cronologicamente in base alla data della prima partita
    return list.sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.getTime() - b.targetDate.getTime();
    });
  }, [calendario]);

  // 2. Filtra i blocchi in base alla fase e alla giornata selezionata
  const displayedBlocchi = useMemo(() => {
    return blocchiFasi.filter((blocco) => {
      if (selectedGiornata !== 'all' && blocco.numero !== selectedGiornata) return false;
      if (faseFilter !== 'all' && blocco.fase !== faseFilter) return false;
      return true;
    });
  }, [blocchiFasi, selectedGiornata, faseFilter]);

  // 3. Trova la giornata più vicina ad oggi
  const closestKey = useMemo(() => {
    if (displayedBlocchi.length === 0) return null;
    const now = new Date().getTime();

    let bestKey = displayedBlocchi[0].key;
    let minDiff = Infinity;

    displayedBlocchi.forEach((b) => {
      if (b.targetDate) {
        const diff = Math.abs(b.targetDate.getTime() - now);
        if (diff < minDiff) {
          minDiff = diff;
          bestKey = b.key;
        }
      }
    });

    return bestKey;
  }, [displayedBlocchi]);

  // 4. Scroll automatico alla giornata più vicina al mount
  useEffect(() => {
    if (!hasScrolledRef.current && closestKey && sectionRefs.current[closestKey]) {
      const timer = setTimeout(() => {
        const element = sectionRefs.current[closestKey];
        if (element) {
          const navHeight = 90; // altezza navbar in px (o document.querySelector('nav').offsetHeight)
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - navHeight;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          hasScrolledRef.current = true;
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [closestKey]);

  let totalDisplayedMatches = 0;

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left calendario">
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

          <select
            value={selectedGiornata}
            onChange={(e) =>
              setSelectedGiornata(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
            }
          >
            <option value="all">Tutte le giornate</option>
            {calendario.map((g) => (
              <option key={g.numero} value={g.numero}>
                {g.numero}^ Giornata
              </option>
            ))}
          </select>

          <div className="select-clearable-wrapper">
            <select
              value={selectedTeamFilter || ''}
              onChange={(e) => onSelectTeamFilter(e.target.value)}
              className={selectedTeamFilter ? 'has-clear' : ''}
            >
              <option value="">Tutte le squadre</option>
              {allTeams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {selectedTeamFilter && (
              <button
                type="button"
                className="select-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTeamFilter();
                }}
                title={`Rimuovi filtro: ${selectedTeamFilter}`}
                aria-label={`Rimuovi filtro: ${selectedTeamFilter}`}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            )}
          </div>
        </div>

        <div className="controls-right text-muted" style={{ fontSize: '12px' }}>
          Risultati ufficiali e referti federali FITeT
        </div>
      </div>

      {/* Calendario Match Cards Container */}
      <div className="calendario-cards-container">
        {displayedBlocchi.map((blocco) => {
          const filteredMatches = blocco.partite.filter((m) => {
            if (!selectedTeamFilter) return true;
            const filterNorm = selectedTeamFilter.toUpperCase();
            return (
              m.squadraCasa.toUpperCase().includes(filterNorm) ||
              m.squadraOspite.toUpperCase().includes(filterNorm)
            );
          });

          if (filteredMatches.length === 0) return null;
          totalDisplayedMatches += filteredMatches.length;

          const isClosest = blocco.key === closestKey;

          return (
            <section
              key={blocco.key}
              ref={(el) => (sectionRefs.current[blocco.key] = el)}
              className={`giornata-section ${isClosest ? 'giornata-prossima' : ''}`}
            >
              {/* Header Giornata con etichetta Andata/Ritorno separata */}
              <div className="giornata-header-banner">
                <div className="giornata-title-group">
                  <span className={`giornata-badge-pill ${isClosest ? 'actual-giornata-badge-pill' : ''}`}>
                    {blocco.numero}ª GIORNATA
                  </span>
                  <span className='actual-giornata'>
                    {isClosest && <span className="badge-in-corso"> • </span>}
                  </span>
                </div>
                <div className="giornata-meta-count">
                  {filteredMatches.length} {filteredMatches.length === 1 ? 'incontro' : 'incontri'}
                </div>
              </div>

              {/* Grid Partite */}
              <div className="match-cards-grid">
                {filteredMatches.map((m) => {
                  const isCasaWinner = m.vincitore === 'casa';
                  const isOspiteWinner = m.vincitore === 'ospite';
                  const isDraw = m.vincitore === 'pareggio';
                  const hasReferto = Boolean(m.refertoUrl && shouldShowReferto(m));

                  return (
                    <article
                      key={m.id}
                      className={`match-card ${hasReferto ? 'has-referto' : ''}`}
                      onClick={() => {
                        if (hasReferto) handleOpenReferto(m);
                      }}
                    >
                      <div className="match-card-top">
                        <div className="match-card-meta">
                          <span className="match-meta-datetime">
                            {m.data} {m.ora ? `ore ${m.ora}` : ''}
                          </span>
                          <span className="match-meta-dot">•</span>
                          <span className="match-meta-phase">
                            {blocco.fase === 'andata' ? 'Andata' : 'Ritorno'}
                          </span>
                        </div>

                        <div className="match-card-status">
                          {m.disputato ? (
                            <span className="match-status-label status-disputato">Finale</span>
                          ) : (
                            <span className="match-status-label status-programmato">In programma</span>
                          )}
                        </div>
                      </div>

                      <div className="match-card-teams">
                        {/* Casa */}
                        <div
                          className={`match-card-team-row ${isCasaWinner ? 'is-winner' : m.disputato && !isDraw ? 'is-loser' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenSquadraModal) onOpenSquadraModal(m.squadraCasa);
                            else onSelectTeamFilter(m.squadraCasa);
                          }}
                          title={onOpenSquadraModal ? `Scheda ${m.squadraCasa}` : `Filtra ${m.squadraCasa}`}
                        >
                          <div className="match-card-team-left">
                            <TeamLogo teamName={m.squadraCasa} className="team-society-logo" />
                            <div className="match-card-name-wrapper">
                              <MarqueeText
                                text={m.squadraCasa}
                                className={`team-name-text ${isCasaWinner ? 'name-winner' : m.disputato && !isDraw ? 'name-loser' : 'name-neutral'}`}
                              />
                            </div>
                          </div>
                          <div
                            className={`match-card-score-digit ${isCasaWinner
                              ? 'score-winner'
                              : m.disputato && !isDraw
                                ? 'score-loser'
                                : 'score-pending'
                              }`}
                          >
                            {m.disputato ? (m.puntiCasa !== null ? m.puntiCasa : '-') : '-'}
                          </div>
                        </div>

                        {/* Ospite */}
                        <div
                          className={`match-card-team-row ${isOspiteWinner ? 'is-winner' : m.disputato && !isDraw ? 'is-loser' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenSquadraModal) onOpenSquadraModal(m.squadraOspite);
                            else onSelectTeamFilter(m.squadraOspite);
                          }}
                          title={onOpenSquadraModal ? `Scheda ${m.squadraOspite}` : `Filtra ${m.squadraOspite}`}
                        >
                          <div className="match-card-team-left">
                            <TeamLogo teamName={m.squadraOspite} className="team-society-logo" />
                            <div className="match-card-name-wrapper">
                              <MarqueeText
                                text={m.squadraOspite}
                                className={`team-name-text ${isOspiteWinner ? 'name-winner' : m.disputato && !isDraw ? 'name-loser' : 'name-neutral'}`}
                              />
                            </div>
                          </div>
                          <div
                            className={`match-card-score-digit ${isOspiteWinner
                              ? 'score-winner'
                              : m.disputato && !isDraw
                                ? 'score-loser'
                                : 'score-pending'
                              }`}
                          >
                            {m.disputato ? (m.puntiOspite !== null ? m.puntiOspite : '-') : '-'}
                          </div>
                        </div>
                      </div>

                      {(hasReferto || isDraw) && (
                        <div className="match-card-bottom">
                          {isDraw ? <span className="match-card-draw-label">Pareggio</span> : <span />}
                          {hasReferto && (
                            <button
                              type="button"
                              className="btn-referto-link"
                              title="Visualizza referto di gara e risultati completi"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReferto(m);
                              }}
                            >
                              <span>Referto</span>
                              <i className="bi bi-chevron-right ms-1"></i>
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        {totalDisplayedMatches === 0 && (
          <div className="no-matches-found">
            <div className="empty-state-icon mb-2">
              <i className="bi bi-calendar-x" style={{ fontSize: '36px', color: 'var(--text-muted)' }}></i>
            </div>
            <p style={{ margin: '4px 0', fontWeight: 600 }}>Nessun incontro trovato con i filtri selezionati.</p>
            {selectedTeamFilter && (
              <button className="btn-action" onClick={onClearTeamFilter} style={{ marginTop: '8px' }}>
                Rimuovi filtro ({selectedTeamFilter}) <i className="bi bi-x-lg ms-1"></i>
              </button>
            )}
          </div>
        )}
      </div>

      {selectedReferto && (
        <RefertoModal
          incontroId={selectedReferto.incontroId}
          camId={selectedReferto.camId}
          formulaId={selectedReferto.formulaId}
          squadraCasaNome={selectedReferto.casa}
          squadraOspiteNome={selectedReferto.ospite}
          statisticheAtleti={statisticheAtleti}
          isSubmodalOpen={isSubmodalOpen}
          onClose={() => setSelectedReferto(null)}
          onOpenAtletaModal={onOpenAtletaModal}
        />
      )}
    </div>
  );
};