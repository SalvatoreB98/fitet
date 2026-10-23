import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefertoIncontro, DettaglioPartitaIndividuale, PartitaRefertoIndividuale } from '../types/fitet';
import { fetchReferto, fetchDettaglioPartita } from '../services/api';
import { getTeamLogoUrl } from '../utils/teamLogos';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';

interface RefertoModalProps {
  incontroId: string;
  camId?: string;
  formulaId?: string;
  squadraCasaNome?: string;
  squadraOspiteNome?: string;
  statisticheAtleti?: Array<{ atleta: string; atletaId: string | null }>;
  isSubmodalOpen?: boolean;
  onClose: () => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
}

export const RefertoModal: React.FC<RefertoModalProps> = ({
  incontroId,
  camId = '',
  formulaId = '',
  squadraCasaNome,
  squadraOspiteNome,
  statisticheAtleti,
  isSubmodalOpen,
  onClose,
  onOpenAtletaModal,
}) => {
  useBodyScrollLock(true);

  const [referto, setReferto] = useState<RefertoIncontro | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded match tracking and per-match detail cache
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [dettaglioCache, setDettaglioCache] = useState<Record<string, DettaglioPartitaIndividuale>>({});
  const [loadingDettaglioId, setLoadingDettaglioId] = useState<string | null>(null);

  // Mappa nomi atleti -> ID federale per garantire l'apertura immediata della scheda
  const athleteIdMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (statisticheAtleti) {
      for (const a of statisticheAtleti) {
        if (a.atleta && a.atletaId) {
          map[a.atleta.trim().toUpperCase()] = a.atletaId;
        }
      }
    }
    return map;
  }, [statisticheAtleti]);

  const handleOpenAthlete = (athleteId: string | undefined, athleteName: string) => {
    if (!onOpenAtletaModal) return;
    const clean = athleteName.trim().toUpperCase();
    const targetId = athleteId || athleteIdMap[clean] || athleteName;
    onOpenAtletaModal(targetId, athleteName);
  };

  const loadRefertoData = (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const cId = parseInt(camId, 10);
    const fId = parseInt(formulaId, 10);

    fetchReferto(incontroId, cId, fId, force)
      .then((data) => {
        setReferto(data);
      })
      .catch((err) => {
        setError(err.message || 'Impossibile recuperare il referto di gara.');
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    loadRefertoData();
  }, [incontroId, camId, formulaId]);

  // Handle ESC key (evita di chiudere il referto se sopra è aperta la scheda ranking atleta)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmodalOpen) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmodalOpen]);

  // Handle expanding a match to fetch / display full details
  const handleToggleExpandMatch = async (match: PartitaRefertoIndividuale) => {
    if (expandedMatchId === match.id) {
      setExpandedMatchId(null);
      return;
    }

    setExpandedMatchId(match.id);

    // If already cached, don't re-fetch
    if (dettaglioCache[match.id] || !match.id || match.id.startsWith('match_')) {
      return;
    }

    setLoadingDettaglioId(match.id);
    try {
      const data = await fetchDettaglioPartita(match.id);
      setDettaglioCache((prev) => ({ ...prev, [match.id]: data }));
    } catch (err) {
      console.warn(`Could not load single match detail ${match.id}:`, err);
    } finally {
      setLoadingDettaglioId(null);
    }
  };

  const isCasaWinner = referto && referto.squadraCasa.punti > referto.squadraOspite.punti;
  const isOspiteWinner = referto && referto.squadraOspite.punti > referto.squadraCasa.punti;
  const isPareggio = referto && referto.squadraCasa.punti === referto.squadraOspite.punti;

  const logoCasa = referto?.squadraCasa.logoUrl || getTeamLogoUrl(referto?.squadraCasa.nome || squadraCasaNome);
  const logoOspite = referto?.squadraOspite.logoUrl || getTeamLogoUrl(referto?.squadraOspite.nome || squadraOspiteNome);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop-simple modal-referto-backdrop" onClick={onClose}>
      <div
        className="modal-card-simple referto-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '880px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="modal-header-simple">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Referto Ufficiale di Gara</h3>
            </div>
            <div style={{ fontSize: '11.5px', color: '#bfdbfe', marginTop: '3px' }}>
              {referto?.giornata || 'Incontro Campionato'} • ID Incontro: {incontroId}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-action btn-modal-refresh"
              onClick={() => loadRefertoData(true)}
              disabled={refreshing || loading}
              title="Aggiorna referto da portale FITeT"
            >
              {refreshing ? (
                <>
                  <i className="bi bi-arrow-repeat spin-anim me-1"></i>Aggiornamento...
                </>
              ) : (
                <i className="bi bi-arrow-clockwise" style={{ fontSize: '13px' }}></i>
              )}
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              title="Chiudi finestra (ESC)"
              aria-label="Chiudi finestra"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {loading && !referto && (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <div style={{ fontSize: '14.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-dark)' }}>
                Caricamento referto di gara in corso...
              </div>
              <div style={{ fontSize: '12px' }}>Recupero risultati ufficiali e parziali set da portale.fitet.org</div>
            </div>
          )}

          {error && !referto && (
            <div className="modal-error-box">
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Impossibile caricare il referto</div>
              <div style={{ fontSize: '12.5px', marginBottom: '12px' }}>{error}</div>
              <button className="btn-action" onClick={() => loadRefertoData(true)}>
                Riprova connessione
              </button>
            </div>
          )}

          {referto && (
            <div>
              {/* Top Scoreboard Hero Banner */}
              <div className="referto-hero-card">
                {/* Squadra Casa */}
                <div className={`referto-team-box ${isCasaWinner ? 'is-winner' : ''}`}>
                  <div className="referto-logo-wrapper">
                    <TeamLogo
                      teamName={referto.squadraCasa.nome}
                      logoUrl={logoCasa}
                      className="referto-club-logo"
                    />
                  </div>
                  <div className="referto-team-name-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="team-role-tag role-casa">CASA</span>
                      {isCasaWinner && (
                        <span className="referto-winner-badge">
                          <i className="bi bi-trophy-fill text-warning me-1"></i>Vincitore incontro
                        </span>
                      )}
                    </div>
                    <h4 className="referto-team-name" title={referto.squadraCasa.nome}>
                      {referto.squadraCasa.nome || squadraCasaNome}
                    </h4>
                  </div>
                </div>

                {/* Scoreboard Center */}
                <div className="referto-score-center">
                  <div className="referto-main-score">
                    <span className={`score-digit ${isCasaWinner ? 'digit-winner' : ''}`}>
                      {referto.squadraCasa.punti}
                    </span>
                    <span className="score-divider">:</span>
                    <span className={`score-digit ${isOspiteWinner ? 'digit-winner' : ''}`}>
                      {referto.squadraOspite.punti}
                    </span>
                  </div>

                  <div className="referto-substats-group">
                    <div className="referto-substat-pill">
                      <span className="substat-label">SET</span>
                      <span className="substat-value">
                        {referto.squadraCasa.setTotali} - {referto.squadraOspite.setTotali}
                      </span>
                    </div>
                    <div className="referto-substat-pill">
                      <span className="substat-label">PUNTI</span>
                      <span className="substat-value">
                        {referto.squadraCasa.puntiTotali} - {referto.squadraOspite.puntiTotali}
                      </span>
                    </div>
                  </div>

                  {isPareggio && (
                    <div className="referto-pareggio-pill">PAREGGIO</div>
                  )}
                </div>

                {/* Squadra Ospite */}
                <div className={`referto-team-box ospite-box ${isOspiteWinner ? 'is-winner' : ''}`}>
                  <div className="referto-team-name-group ospite-name-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      {isOspiteWinner && (
                        <span className="referto-winner-badge">
                          <i className="bi bi-trophy-fill text-warning me-1"></i>Vincitore incontro
                        </span>
                      )}
                      <span className="team-role-tag role-ospite">OSPITE</span>
                    </div>
                    <h4 className="referto-team-name" title={referto.squadraOspite.nome}>
                      {referto.squadraOspite.nome || squadraOspiteNome}
                    </h4>
                  </div>
                  <div className="referto-logo-wrapper">
                    <TeamLogo
                      teamName={referto.squadraOspite.nome}
                      logoUrl={logoOspite}
                      className="referto-club-logo"
                    />
                  </div>
                </div>
              </div>

              {/* Grid Table Container */}
              <div className="referto-grid-table mt-3">
                {/* Grid Header Row with Society Logos & Team Names */}
                <div className="referto-grid-header">
                  <div className="r-th r-th-num">#</div>
                  <div className="r-th r-th-casa">
                    <TeamLogo
                      teamName={referto.squadraCasa.nome}
                      logoUrl={logoCasa}
                      className="r-th-society-img"
                    />
                    <span className="r-th-team-text">{referto.squadraCasa.nome}</span>
                    <span className="team-role-tag role-casa">CASA</span>
                  </div>
                  <div className="r-th r-th-score">SET</div>
                  <div className="r-th r-th-ospite">
                    <span className="team-role-tag role-ospite">OSPITE</span>
                    <span className="r-th-team-text">{referto.squadraOspite.nome}</span>
                    <TeamLogo
                      teamName={referto.squadraOspite.nome}
                      logoUrl={logoOspite}
                      className="r-th-society-img"
                    />
                  </div>
                  <div className="r-th r-th-partials">PARZIALI SET (1°-5°)</div>
                  <div className="r-th r-th-action">DETTAGLIO</div>
                </div>

                {/* Matches List */}
                <div className="referto-matches-list">
                  {referto.partite.map((match) => {
                    const isExpanded = expandedMatchId === match.id;
                    const dettaglio = dettaglioCache[match.id];
                    const isLoadingDettaglio = loadingDettaglioId === match.id;

                    return (
                      <div
                        key={match.id}
                        className={`referto-match-row ${isExpanded ? 'is-expanded' : ''}`}
                      >
                        {/* Main Match Summary Row - Grid Layout */}
                        <div
                          className="referto-match-summary"
                          onClick={() => handleToggleExpandMatch(match)}
                          title="Clicca per aprire/chiudere il dettaglio parziali e atleti"
                        >
                          {/* 1. Numero incontro */}
                          <div className="match-num-badge">#{match.numero}</div>

                          {/* 2. Atleta Casa */}
                          <div className={`match-player casa-player ${match.isCasaWinner ? 'is-winner' : ''}`}>
                            <span className="player-name">{match.atletaCasa}</span>
                            {match.isCasaWinner && (
                              <span className="trophy-small" title="Vincitore incontro">
                                <i className="bi bi-trophy-fill text-warning"></i>
                              </span>
                            )}
                            <TeamLogo
                              teamName={referto.squadraCasa.nome}
                              logoUrl={logoCasa}
                              className="player-society-badge"
                              title={referto.squadraCasa.nome}
                            />
                          </div>

                          {/* 3. Risultato Set (Score) */}
                          <div className="match-sets-badge">
                            <span className={`sets-digit ${match.isCasaWinner ? 'winner-digit' : ''}`}>
                              {match.setVintiCasa}
                            </span>
                            <span className="sets-divider">-</span>
                            <span className={`sets-digit ${match.isOspiteWinner ? 'winner-digit' : ''}`}>
                              {match.setVintiOspite}
                            </span>
                          </div>

                          {/* 4. Atleta Ospite */}
                          <div className={`match-player ospite-player ${match.isOspiteWinner ? 'is-winner' : ''}`}>
                            <TeamLogo
                              teamName={referto.squadraOspite.nome}
                              logoUrl={logoOspite}
                              className="player-society-badge"
                              title={referto.squadraOspite.nome}
                            />
                            {match.isOspiteWinner && (
                              <span className="trophy-small" title="Vincitore incontro">
                                <i className="bi bi-trophy-fill text-warning"></i>
                              </span>
                            )}
                            <span className="player-name">{match.atletaOspite}</span>
                          </div>

                          {/* 5. Parziali Set con 5 slot a griglia fissa */}
                          <div className="match-partials-slots">
                            {[1, 2, 3, 4, 5].map((slotIdx) => {
                              const set = match.sets.find((s) => s.setNumero === slotIdx);
                              if (!set) {
                                return (
                                  <span key={slotIdx} className="set-slot empty" title="Set non disputato">
                                    -
                                  </span>
                                );
                              }
                              const isCasaSetWinner = set.puntiCasa > set.puntiOspite;
                              return (
                                <span
                                  key={slotIdx}
                                  className={`set-slot filled ${isCasaSetWinner ? 'set-casa-win' : 'set-ospite-win'}`}
                                  title={`${slotIdx}° set: ${set.puntiCasa}-${set.puntiOspite}`}
                                >
                                  {set.puntiCasa}-{set.puntiOspite}
                                </span>
                              );
                            })}
                          </div>

                          {/* 6. Bottone Espandi / Dettaglio */}
                          <div className="match-expand-btn" aria-label="Espandi">
                            <span className="expand-label">{isExpanded ? 'Chiudi' : 'Dettagli'}</span>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                              }}
                            >
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </div>
                        </div>

                        {/* Expanded View: Full Game Details */}
                        {isExpanded && (
                          <div className="referto-expanded-panel">
                            {isLoadingDettaglio && (
                              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                                <span style={{ fontSize: '12.5px' }}>Caricamento parziali e dati atleti...</span>
                              </div>
                            )}

                            {/* Individual match detail view */}
                            <div className="expanded-detail-grid">
                              {/* Athlete Casa Profile Card */}
                              {(() => {
                                const isDoublesCasa = match.atletaCasa.includes(' - ');
                                const casaPlayers = isDoublesCasa
                                  ? match.atletaCasa.split(' - ').map((s) => s.trim())
                                  : [match.atletaCasa];
                                const hasValidPhoto =
                                  Boolean(dettaglio?.atletaCasa.fotoUrl) &&
                                  !dettaglio?.atletaCasa.fotoUrl?.includes('-vuoto');

                                return (
                                  <div className="athlete-card casa-card">
                                    <div
                                      className="athlete-photo-frame"
                                      onClick={() => handleOpenAthlete(dettaglio?.atletaCasa.atletaId, match.atletaCasa)}
                                      style={{ cursor: onOpenAtletaModal ? 'pointer' : 'default' }}
                                      title={onOpenAtletaModal ? `Visualizza scheda ${match.atletaCasa}` : undefined}
                                    >
                                      <AthleteAvatar
                                        atletaId={dettaglio?.atletaCasa.atletaId || athleteIdMap[match.atletaCasa.trim().toUpperCase()]}
                                        nome={match.atletaCasa}
                                        size={36}
                                        className="athlete-photo"
                                      />
                                    </div>
                                    <div className="athlete-info">
                                      <div className="athlete-name-row">
                                        <strong>{match.atletaCasa}</strong>
                                        {dettaglio?.atletaCasa.bandieraUrl && (
                                          <img
                                            src={dettaglio.atletaCasa.bandieraUrl}
                                            alt="Bandiera"
                                            className="athlete-flag"
                                          />
                                        )}
                                      </div>
                                      {onOpenAtletaModal &&
                                        (isDoublesCasa ? (
                                          <div className="doubles-athlete-links">
                                            {casaPlayers.map((player, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                className="btn-athlete-link"
                                                onClick={() =>
                                                  handleOpenAthlete(
                                                    idx === 0 ? dettaglio?.atletaCasa.atletaId : undefined,
                                                    player
                                                  )
                                                }
                                                title={`Visualizza scheda ranking di ${player}`}
                                              >
                                                Scheda {player.split(' ')[0]} <i className="bi bi-box-arrow-up-right ms-1"></i>
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            className="btn-athlete-link"
                                            onClick={() =>
                                              handleOpenAthlete(dettaglio?.atletaCasa.atletaId, match.atletaCasa)
                                            }
                                            title="Visualizza scheda atleta e storico punti"
                                          >
                                            Visualizza Scheda atleta <i className="bi bi-box-arrow-up-right ms-1"></i>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Sets Progression Table */}
                              <div className="sets-table-box">
                                <table className="sets-progression-table">
                                  <thead>
                                    <tr>
                                      <th>CASA</th>
                                      <th>SET</th>
                                      <th>OSPITE</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(dettaglio?.sets && dettaglio.sets.length > 0 ? dettaglio.sets : match.sets).map(
                                      (s) => {
                                        const casaWonSet = s.puntiCasa > s.puntiOspite;
                                        return (
                                          <tr key={s.setNumero}>
                                            <td className={`set-pts ${casaWonSet ? 'set-winner-pts' : ''}`}>
                                              {s.puntiCasa}
                                            </td>
                                            <td className="set-label">{s.setNumero}° set</td>
                                            <td className={`set-pts ${!casaWonSet ? 'set-winner-pts' : ''}`}>
                                              {s.puntiOspite}
                                            </td>
                                          </tr>
                                        );
                                      }
                                    )}
                                  </tbody>
                                  {(dettaglio?.puntiTotali || match.sets.length > 0) && (
                                    <tfoot>
                                      <tr>
                                        <td colSpan={3} className="total-pts-row">
                                          Totale Punti: <strong>{dettaglio?.puntiTotali || `${match.sets.reduce((a, b) => a + b.puntiCasa, 0)} : ${match.sets.reduce((a, b) => a + b.puntiOspite, 0)}`}</strong>
                                        </td>
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>

                              {/* Athlete Ospite Profile Card */}
                              {(() => {
                                const isDoublesOspite = match.atletaOspite.includes(' - ');
                                const ospitePlayers = isDoublesOspite
                                  ? match.atletaOspite.split(' - ').map((s) => s.trim())
                                  : [match.atletaOspite];
                                const hasValidPhoto =
                                  Boolean(dettaglio?.atletaOspite.fotoUrl) &&
                                  !dettaglio?.atletaOspite.fotoUrl?.includes('-vuoto');

                                return (
                                  <div className="athlete-card ospite-card">
                                    <div
                                      className="athlete-photo-frame"
                                      onClick={() => handleOpenAthlete(dettaglio?.atletaOspite.atletaId, match.atletaOspite)}
                                      style={{ cursor: onOpenAtletaModal ? 'pointer' : 'default' }}
                                      title={onOpenAtletaModal ? `Visualizza scheda ${match.atletaOspite}` : undefined}
                                    >
                                      <AthleteAvatar
                                        atletaId={dettaglio?.atletaOspite.atletaId || athleteIdMap[match.atletaOspite.trim().toUpperCase()]}
                                        nome={match.atletaOspite}
                                        size={36}
                                        className="athlete-photo"
                                      />
                                    </div>
                                    <div className="athlete-info">
                                      <div className="athlete-name-row">
                                        <strong>{match.atletaOspite}</strong>
                                        {dettaglio?.atletaOspite.bandieraUrl && (
                                          <img
                                            src={dettaglio.atletaOspite.bandieraUrl}
                                            alt="Bandiera"
                                            className="athlete-flag"
                                          />
                                        )}
                                      </div>
                                      {onOpenAtletaModal &&
                                        (isDoublesOspite ? (
                                          <div className="doubles-athlete-links">
                                            {ospitePlayers.map((player, idx) => (
                                              <button
                                                key={idx}
                                                type="button"
                                                className="btn-athlete-link"
                                                onClick={() =>
                                                  handleOpenAthlete(
                                                    idx === 0 ? dettaglio?.atletaOspite.atletaId : undefined,
                                                    player
                                                  )
                                                }
                                                title={`Visualizza scheda ranking di ${player}`}
                                              >
                                                Scheda {player.split(' ')[0]} <i className="bi bi-box-arrow-up-right ms-1"></i>
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            className="btn-athlete-link"
                                            onClick={() =>
                                              handleOpenAthlete(dettaglio?.atletaOspite.atletaId, match.atletaOspite)
                                            }
                                            title="Visualizza scheda atleta e storico punti"
                                          >
                                            Visualizza scheda atleta <i className="bi bi-box-arrow-up-right ms-1"></i>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Meta bar: Arbitro, Campo Gara */}
              {(referto.arbitro || referto.campoGara) && (
                <div className="referto-meta-bar mt-3">
                  {referto.arbitro && (
                    <div className="referto-meta-item">
                      <span className="meta-icon">
                        <i className="bi bi-person-badge"></i>
                      </span>
                      <span className="meta-text">
                        <strong>Arbitro:</strong> {referto.arbitro}
                      </span>
                    </div>
                  )}
                  {referto.campoGara && (
                    <div className="referto-meta-item">
                      <span className="meta-icon">
                        <i className="bi bi-geo-alt-fill"></i>
                      </span>
                      <span className="meta-text">
                        <strong>Campo Gara:</strong> {referto.campoGara}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

