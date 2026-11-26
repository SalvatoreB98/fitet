import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefertoIncontro, DettaglioPartitaIndividuale, PartitaRefertoIndividuale } from '../types/fitet';
import { fetchReferto, fetchDettaglioPartita } from '../services/api';
import { getTeamLogoUrl } from '../utils/teamLogos';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { useModalTransition } from '../utils/useModalTransition';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import MarqueeText from './MarqueeText';
import { SkeletonWrap, SkeletonVersus, SkeletonSectionHead, SkeletonTableRows } from './ModalSkeleton';

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
  const { isClosing, requestClose } = useModalTransition(onClose);

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
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose, isSubmodalOpen]);

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
  const isCompactState = !loading && Boolean(error && !referto);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={`modal-backdrop-simple modal-referto-backdrop ${isClosing ? 'modal-closing' : ''}`} onClick={requestClose}>
      <div
        className={`modal-card-simple referto-modal-card ${isClosing ? 'is-closing' : ''} ${isCompactState ? 'is-compact-state' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="referto-modal-header">
          <div className="referto-header-title-group">
            <h3 className="referto-modal-title">Referto Ufficiale</h3>
            <div className="referto-modal-subtitle">
              <span>{referto?.giornata || 'Incontro Campionato'}</span>
              <span className="referto-dot-sep" aria-hidden="true">·</span>
              <span className="referto-id-mono">ID {incontroId}</span>
            </div>
          </div>

          <div className="referto-header-actions">
            <button
              type="button"
              className="referto-icon-btn"
              onClick={() => loadRefertoData(true)}
              disabled={refreshing || loading}
              title="Aggiorna referto da portale FITeT"
              aria-label="Aggiorna referto"
            >
              <i className={`bi ${refreshing ? 'bi-arrow-repeat spin-anim' : 'bi-arrow-clockwise'}`}></i>
            </button>
            <button
              type="button"
              className="referto-icon-btn referto-close-btn"
              onClick={requestClose}
              title="Chiudi finestra (ESC)"
              aria-label="Chiudi finestra"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple referto-modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading && !referto && (
            <SkeletonWrap
              label="Caricamento referto di gara"
              caption="Recupero risultati ufficiali e parziali set da portale.fitet.org..."
            >
              <SkeletonVersus
                leftLabel={squadraCasaNome || 'Squadra Casa'}
                rightLabel={squadraOspiteNome || 'Squadra Ospite'}
                avatarShape="square"
                showScoreBar
              />
              <div style={{ marginTop: '18px' }}>
                <SkeletonSectionHead titleW={160} badgeW={90} />
                <SkeletonTableRows count={6} hasAvatar={false} cols={3} />
              </div>
            </SkeletonWrap>
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
            <div className="referto-content-enter">
              {/* Top Scoreboard Hero Banner */}
              <div className="referto-hero-card">
                {/* Squadra Casa */}
                <div className={`referto-team-box ${isCasaWinner ? 'is-winner' : 'is-non-winner'}`}>
                  <div className="referto-logo-wrapper">
                    <TeamLogo
                      teamName={referto.squadraCasa.nome}
                      logoUrl={logoCasa}
                      className="referto-club-logo"
                    />
                  </div>
                  <div className="referto-team-name-group">
                    <div className="referto-team-eyebrow">
                      <span className="referto-role-label">CASA</span>
                      {isCasaWinner && <span className="referto-winner-dot" title="Vincitore incontro">· Vincente</span>}
                    </div>
                    <h4 className="referto-team-name" title={referto.squadraCasa.nome}>
                      {referto.squadraCasa.nome || squadraCasaNome}
                    </h4>
                  </div>
                </div>

                {/* Scoreboard Center */}
                <div className="referto-score-center">
                  <div className="referto-main-score">
                    <span className={`score-digit ${isCasaWinner ? 'digit-winner' : 'digit-loser'}`}>
                      {referto.squadraCasa.punti}
                    </span>
                    <span className="score-divider">:</span>
                    <span className={`score-digit ${isOspiteWinner ? 'digit-winner' : 'digit-loser'}`}>
                      {referto.squadraOspite.punti}
                    </span>
                  </div>

                  <div className="referto-substats-group">
                    <div className="referto-substat-pill">
                      <span className="substat-label">Set</span>
                      <span className="substat-value">
                        {referto.squadraCasa.setTotali}–{referto.squadraOspite.setTotali}
                      </span>
                    </div>
                    <span className="referto-substat-sep" aria-hidden="true">·</span>
                    <div className="referto-substat-pill">
                      <span className="substat-label">Punti</span>
                      <span className="substat-value">
                        {referto.squadraCasa.puntiTotali}–{referto.squadraOspite.puntiTotali}
                      </span>
                    </div>
                  </div>

                  {isPareggio && (
                    <div className="referto-pareggio-pill">Pareggio</div>
                  )}
                </div>

                {/* Squadra Ospite */}
                <div className={`referto-team-box ospite-box ${isOspiteWinner ? 'is-winner' : 'is-non-winner'}`}>
                  <div className="referto-team-name-group ospite-name-group">
                    <div className="referto-team-eyebrow ospite-eyebrow">
                      {isOspiteWinner && <span className="referto-winner-dot" title="Vincitore incontro">Vincente ·</span>}
                      <span className="referto-role-label">OSPITE</span>
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
              <div className="referto-grid-table">
                {/* Grid Header Row */}
                <div className="referto-grid-header">
                  <div className="r-th r-th-num">#</div>
                  <div className="r-th r-th-casa">
                    <span className="r-th-team-text">{referto.squadraCasa.nome}</span>
                  </div>
                  <div className="r-th r-th-score">Set</div>
                  <div className="r-th r-th-ospite">
                    <span className="r-th-team-text">{referto.squadraOspite.nome}</span>
                  </div>
                  <div className="r-th r-th-partials">Parziali</div>
                  <div className="r-th r-th-action"></div>
                </div>

                {/* Matches List */}
                <div className="referto-matches-list">
                  {referto.partite.map((match, idx) => {
                    const isExpanded = expandedMatchId === match.id;
                    const dettaglio = dettaglioCache[match.id];
                    const isLoadingDettaglio = loadingDettaglioId === match.id;

                    return (
                      <div
                        key={match.id}
                        className={`referto-match-row ${isExpanded ? 'is-expanded' : ''}`}
                        style={{ '--row-index': idx } as React.CSSProperties}
                      >
                        {/* Main Match Summary Row - Grid Layout */}
                        <div
                          className="referto-match-summary"
                          onClick={() => handleToggleExpandMatch(match)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleExpandMatch(match);
                            }
                          }}
                          title="Clicca per aprire/chiudere il dettaglio parziali"
                        >
                          {/* 1. Numero incontro */}
                          <div className="match-num-badge">{String(match.numero).padStart(2, '0')}</div>

                          {/* 2. Atleta Casa */}
                          <div className={`match-player casa-player ${match.isCasaWinner ? 'is-winner' : 'is-non-winner'}`}>
                            <span className="player-name">{match.atletaCasa}</span>
                          </div>

                          {/* 3. Risultato Set (Score) */}
                          <div className="match-sets-badge">
                            <span className={`sets-digit ${match.isCasaWinner ? 'winner-digit' : 'loser-digit'}`}>
                              {match.setVintiCasa}
                            </span>
                            <span className="sets-divider">–</span>
                            <span className={`sets-digit ${match.isOspiteWinner ? 'winner-digit' : 'loser-digit'}`}>
                              {match.setVintiOspite}
                            </span>
                          </div>

                          {/* 4. Atleta Ospite */}
                          <div className={`match-player ospite-player ${match.isOspiteWinner ? 'is-winner' : 'is-non-winner'}`}>
                            <span className="player-name">{match.atletaOspite}</span>
                          </div>

                          {/* 5. Parziali Set con 5 slot a griglia fissa */}
                          <div className="match-partials-slots">
                            {[1, 2, 3, 4, 5].map((slotIdx) => {
                              const set = match.sets.find((s) => s.setNumero === slotIdx);
                              if (!set) {
                                return (
                                  <span key={slotIdx} className="set-slot empty" aria-hidden="true">
                                    ·
                                  </span>
                                );
                              }
                              const isCasaSetWinner = set.puntiCasa > set.puntiOspite;
                              return (
                                <span
                                  key={slotIdx}
                                  className="set-slot filled"
                                  title={`${slotIdx}° set: ${set.puntiCasa}-${set.puntiOspite}`}
                                >
                                  <span className={isCasaSetWinner ? 'set-pt-win' : 'set-pt-lose'}>{set.puntiCasa}</span>
                                  <span className="set-pt-sep">-</span>
                                  <span className={!isCasaSetWinner ? 'set-pt-win' : 'set-pt-lose'}>{set.puntiOspite}</span>
                                </span>
                              );
                            })}
                          </div>

                          {/* 6. Bottone Espandi / Dettaglio */}
                          <div className="match-expand-btn" aria-hidden="true">
                            <span className="expand-label">{isExpanded ? 'Chiudi' : 'Dettagli'}</span>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="expand-chevron"
                            >
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </div>
                        </div>

                        {/* Expanded View: Smooth Accordion */}
                        <div className={`referto-accordion-wrap ${isExpanded ? 'is-open' : ''}`}>
                          <div className="referto-accordion-inner">
                            {isExpanded && (
                              <div className="referto-expanded-panel">
                                {isLoadingDettaglio && (
                                  <div className="referto-detail-loading">
                                    <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                                    <i className='bi arrow-counterclockwise'></i>
                                  </div>
                                )}

                                <div className="expanded-detail-grid">
                                  <div className="sets-table-box">
                                    <table className="sets-progression-table">
                                      <thead>
                                        <tr>
                                          <th>
                                            <button
                                              type="button"
                                              className={`referto-athlete-btn ${onOpenAtletaModal ? 'is-clickable' : ''}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenAthlete(
                                                  dettaglio?.atletaCasa.atletaId,
                                                  match.atletaCasa
                                                );
                                              }}
                                              disabled={!onOpenAtletaModal}
                                              title={onOpenAtletaModal ? `Apri scheda ${match.atletaCasa}` : undefined}
                                            >
                                              <AthleteAvatar
                                                atletaId={dettaglio?.atletaCasa.atletaId || athleteIdMap[match.atletaCasa.trim().toUpperCase()]}
                                                nome={match.atletaCasa}
                                                size={22}
                                                className="athlete-photo"
                                              />
                                              <span className="casa-ospite-detail">
                                                <MarqueeText>{match.atletaCasa}</MarqueeText>
                                              </span>
                                            </button>
                                          </th>
                                          <th className="sets-th-center">Set</th>
                                          <th>
                                            <button
                                              type="button"
                                              className={`referto-athlete-btn ${onOpenAtletaModal ? 'is-clickable' : ''}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenAthlete(
                                                  dettaglio?.atletaOspite.atletaId,
                                                  match.atletaOspite
                                                );
                                              }}
                                              disabled={!onOpenAtletaModal}
                                              title={onOpenAtletaModal ? `Apri scheda ${match.atletaOspite}` : undefined}
                                            >
                                              <AthleteAvatar
                                                atletaId={dettaglio?.atletaOspite.atletaId || athleteIdMap[match.atletaOspite.trim().toUpperCase()]}
                                                nome={match.atletaOspite}
                                                size={22}
                                                className="athlete-photo"
                                              />
                                              <span className="casa-ospite-detail">
                                                <MarqueeText>{match.atletaOspite}</MarqueeText>
                                              </span>
                                            </button>
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(dettaglio?.sets && dettaglio.sets.length > 0 ? dettaglio.sets : match.sets).map(
                                          (s) => {
                                            const casaWonSet = s.puntiCasa > s.puntiOspite;
                                            return (
                                              <tr key={s.setNumero}>
                                                <td className={`set-pts ${casaWonSet ? 'set-winner-pts' : 'set-loser-pts'}`}>
                                                  {s.puntiCasa}
                                                </td>
                                                <td className="set-label">{s.setNumero}°</td>
                                                <td className={`set-pts ${!casaWonSet ? 'set-winner-pts' : 'set-loser-pts'}`}>
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
                                              Totale punti{' '}
                                              <strong>
                                                {dettaglio?.puntiTotali ||
                                                  `${match.sets.reduce((a, b) => a + b.puntiCasa, 0)} – ${match.sets.reduce((a, b) => a + b.puntiOspite, 0)}`}
                                              </strong>
                                            </td>
                                          </tr>
                                        </tfoot>
                                      )}
                                    </table>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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

