import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CampionatoAttualeInfo, DettaglioAtleta, PartitaCalendario, RefertoIncontro } from '../types/fitet';
import { fetchAtleta, fetchDashboard, fetchReferto } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { useModalTransition } from '../utils/useModalTransition';
import { AthleteAvatar } from './AthleteAvatar';
import { TeamLogo } from './TeamLogo';
import { RefertoModal } from './RefertoModal';
import './MatchDetailModal.css';

export interface MatchDetailItem {
  id: string;
  tipo: 'girone' | 'campionato' | 'torneo';
  data: string;
  titolo: string;
  sottotitolo?: string;
  avversario: string;
  avversarioId?: string;
  giornata?: number;
  fase?: string;
  isVittoria: boolean;
  risultatoSet?: string;
  sets?: string[];
  punti?: number;
  rawRisultato?: string;
}

interface MatchDetailModalProps {
  match: MatchDetailItem;
  athleteId: string;
  athleteName: string;
  athletePhotoUrl?: string;
  athleteClub?: string;
  athleteRank?: number;
  athletePoints?: number;
  athleteCategory?: string;
  camId?: number;
  annoId?: number;
  playedChampionships?: CampionatoAttualeInfo[];
  zIndex?: number;
  isTopModal?: boolean;
  onClose: () => void;
  onOpenHeadToHead: (opponent: { id?: string; name: string }) => void;
  onOpenOpponentProfile?: (idOrName: string, name: string) => void;
  onNavigateToGiornata?: (camId?: number, giornata?: number) => void;
}

function parseSetWonByAthlete(setStr: string): boolean | null {
  const m = setStr.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return null;
  return a > b;
}

function normTeam(name?: string): string {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normDateStr(dateStr?: string): string {
  if (!dateStr) return '';
  const m = dateStr.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return '';
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${mo}-${d}`;
}

function teamMatchesClub(teamName: string, clubName?: string): boolean {
  if (!clubName) return false;
  const t = normTeam(teamName);
  const c = normTeam(clubName);
  if (!t || !c) return false;
  if (t.includes(c) || c.includes(t)) return true;
  const words = clubName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['TENNISTAVOLO', 'ASD', 'SSD', 'POLISPORTIVA', 'CLUB', 'SPORT'].includes(w));
  return words.length > 0 && words.some((w) => t.includes(w));
}

function playerNamesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  const wa = norm(a);
  const wb = norm(b);
  if (wa.length === 0 || wb.length === 0) return false;
  // Almeno il cognome (primo token) + un altro token se entrambi ne hanno >= 2
  if (wa.length >= 2 && wb.length >= 2) {
    const common = wa.filter((w) => wb.includes(w));
    return common.length >= 2 || (wa.join(' ') === wb.join(' '));
  }
  return wa[0] === wb[0];
}

function refertoContainsMatch(refData: RefertoIncontro | null | undefined, athleteName: string, opponentName: string): boolean {
  if (!refData?.partite?.length) return false;
  return refData.partite.some(
    (p) =>
      (playerNamesMatch(p.atletaCasa, athleteName) && playerNamesMatch(p.atletaOspite, opponentName)) ||
      (playerNamesMatch(p.atletaCasa, opponentName) && playerNamesMatch(p.atletaOspite, athleteName))
  );
}

function formatWholePoints(points?: number): string {
  if (points === undefined || points === null || Number.isNaN(points)) return '-';
  return `${Math.round(points)} pt`;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  athleteId,
  athleteName,
  athletePhotoUrl,
  athleteClub,
  athleteRank,
  athletePoints,
  athleteCategory,
  camId,
  annoId = 41,
  playedChampionships,
  zIndex,
  isTopModal = true,
  onClose,
  onOpenHeadToHead,
  onOpenOpponentProfile,
  onNavigateToGiornata,
}) => {
  useBodyScrollLock(true);
  const { isClosing, requestClose } = useModalTransition(onClose);

  const [opponentData, setOpponentData] = useState<DettaglioAtleta | null>(null);
  const [loadingOpponent, setLoadingOpponent] = useState(false);

  const [teamMatch, setTeamMatch] = useState<PartitaCalendario | null>(null);
  const [otherDayMatches, setOtherDayMatches] = useState<PartitaCalendario[]>([]);
  const [showOtherDayMatches, setShowOtherDayMatches] = useState(false);
  const [referto, setReferto] = useState<RefertoIncontro | null>(null);
  const [loadingReferto, setLoadingReferto] = useState(false);
  const [isRefertoModalOpen, setIsRefertoModalOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal && !isRefertoModalOpen) {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose, isTopModal, isRefertoModalOpen]);

  // Carica in background i dettagli dell'avversario (foto, ID reale, rank, punti, società)
  useEffect(() => {
    const lookupKey = match.avversarioId?.trim() || match.avversario?.trim();
    if (!lookupKey) {
      setOpponentData(null);
      return;
    }
    let active = true;
    setLoadingOpponent(true);
    fetchAtleta(lookupKey)
      .then((data) => {
        if (active) setOpponentData(data);
      })
      .catch(() => {
        if (active) setOpponentData(null);
      })
      .finally(() => {
        if (active) setLoadingOpponent(false);
      });
    return () => {
      active = false;
    };
  }, [match.avversarioId, match.avversario]);

  // Se è un incontro di campionato/girone, determina il camId corretto e recupera incontro a squadre + altre partite giornata + referto
  const resolvedChampInfo = useMemo(() => {
    if (match.tipo === 'torneo') return { effectiveCamId: undefined, clubHint: undefined };
    const list = playedChampionships || [];
    const titleNorm = normTeam(match.titolo);
    const matched = list.find((c) => {
      const cn = normTeam(c.nome);
      return cn && titleNorm && (cn.includes(titleNorm) || titleNorm.includes(cn));
    });
    return {
      effectiveCamId: matched?.camId ?? camId ?? list[0]?.camId,
      clubHint: matched?.squadra || match.sottotitolo || athleteClub,
    };
  }, [match.tipo, match.titolo, match.sottotitolo, playedChampionships, camId, athleteClub]);

  useEffect(() => {
    const targetCamId = resolvedChampInfo.effectiveCamId;
    if (!targetCamId || match.tipo === 'torneo') return;
    let active = true;
    setLoadingReferto(true);

    fetchDashboard(targetCamId, annoId)
      .then(async (dash) => {
        if (!active || !dash?.calendario) return;
        const allTeamMatches = dash.calendario.flatMap((g) => [
          ...(g.partiteAndata || []),
          ...(g.partiteRitorno || []),
        ]);

        // Ricava le squadre esatte dei due atleti dalle statistiche del campionato (distingue es. Squadra A vs Squadra B della stessa società)
        const stats = dash.statisticheAtleti || [];
        const findPlayerTeam = (pId?: string, pName?: string): string | undefined => {
          if (pId) {
            const byId = stats.find((s) => s.atletaId === pId);
            if (byId?.squadra) return byId.squadra;
          }
          if (pName) {
            const byName = stats.find((s) => playerNamesMatch(s.atleta, pName));
            if (byName?.squadra) return byName.squadra;
          }
          return undefined;
        };

        const myExactTeam = findPlayerTeam(athleteId, athleteName);
        const oppExactTeam = findPlayerTeam(match.avversarioId, match.avversario);
        const clubTarget = myExactTeam || resolvedChampInfo.clubHint;
        const targetDate = normDateStr(match.data);

        let pool = allTeamMatches;
        if (match.giornata !== undefined) {
          pool = allTeamMatches.filter((tm) => tm.giornata === match.giornata);
        } else if (targetDate) {
          const byDate = allTeamMatches.filter((tm) => normDateStr(tm.data) === targetDate);
          if (byDate.length > 0) pool = byDate;
        }

        const matchesExactTeam = (tmTeam: string, exactTeam?: string) =>
          Boolean(exactTeam && normTeam(tmTeam) === normTeam(exactTeam));

        const candidates = pool.filter((tm) => {
          if (myExactTeam && oppExactTeam) {
            return (
              (matchesExactTeam(tm.squadraCasa, myExactTeam) && matchesExactTeam(tm.squadraOspite, oppExactTeam)) ||
              (matchesExactTeam(tm.squadraCasa, oppExactTeam) && matchesExactTeam(tm.squadraOspite, myExactTeam))
            );
          }
          if (myExactTeam) {
            return matchesExactTeam(tm.squadraCasa, myExactTeam) || matchesExactTeam(tm.squadraOspite, myExactTeam);
          }
          return teamMatchesClub(tm.squadraCasa, clubTarget) || teamMatchesClub(tm.squadraOspite, clubTarget);
        });

        let verifiedMatch: PartitaCalendario | undefined = undefined;
        let verifiedReferto: RefertoIncontro | null = null;

        // Se abbiamo più candidati (es. due squadre della stessa società) o un candidato con incontroId, verifichiamo dentro il referto
        const toCheck = candidates.length > 0 ? candidates.slice(0, 4) : [];
        for (const cand of toCheck) {
          if (!cand.incontroId) continue;
          try {
            const refData = await fetchReferto(cand.incontroId, targetCamId, cand.formula);
            if (!active) return;
            if (refertoContainsMatch(refData, athleteName, match.avversario)) {
              verifiedMatch = cand;
              verifiedReferto = refData;
              break;
            }
          } catch {
            // Ignora e prova il prossimo candidato
          }
        }

        // Fallback: solo se c'è un unico candidato con squadra esatta (myExactTeam) e non abbiamo trovato altro
        if (!verifiedMatch && candidates.length === 1 && myExactTeam) {
          verifiedMatch = candidates[0];
        }

        if (active) {
          setTeamMatch(verifiedMatch || null);
          setReferto(verifiedReferto);
          if (verifiedMatch) {
            setOtherDayMatches(
              allTeamMatches.filter(
                (tm) => tm.giornata === verifiedMatch!.giornata && tm.tipo === verifiedMatch!.tipo && tm.id !== verifiedMatch!.id
              )
            );
          } else {
            setOtherDayMatches([]);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingReferto(false);
      });

    return () => {
      active = false;
    };
  }, [resolvedChampInfo.effectiveCamId, resolvedChampInfo.clubHint, annoId, match.tipo, match.giornata, match.data, athleteId, athleteName, match.avversarioId, match.avversario]);

  const oppResolvedId = opponentData?.id || match.avversarioId;
  const oppPhotoUrl = opponentData?.anagrafica?.fotoUrl || undefined;
  const oppLastSnap = opponentData?.storicoClassifica?.length
    ? opponentData.storicoClassifica[opponentData.storicoClassifica.length - 1]
    : undefined;
  const oppRank = oppLastSnap?.posizione ?? undefined;
  const oppPoints = opponentData?.anagrafica?.punti ?? opponentData?.riepilogo?.punteggioFinale;
  const oppCategory = opponentData?.anagrafica?.categoria;
  const oppClub = opponentData?.anagrafica?.societa;

  const kickerLabel = useMemo(() => {
    const scope =
      match.tipo === 'torneo'
        ? 'TORNEO'
        : match.tipo === 'girone'
          ? 'CAMPIONATO GIRONE'
          : 'CAMPIONATO';
    return `${scope} • DETTAGLIO INCONTRO`;
  }, [match.tipo]);

  const mainScore = match.risultatoSet || (match.isVittoria ? 'V' : 'S');
  const athleteRankLabel = athleteRank ? `#${athleteRank}` : athleteCategory || '-';
  const oppRankLabel = loadingOpponent ? '...' : oppRank ? `#${oppRank}` : oppCategory || '-';

  const bothHaveRank = typeof athleteRank === 'number' && typeof oppRank === 'number' && athleteRank !== oppRank;
  const athleteBetterRank = bothHaveRank && athleteRank! < oppRank!;
  const oppBetterRank = bothHaveRank && oppRank! < athleteRank!;

  const bothHavePoints =
    typeof athletePoints === 'number' && typeof oppPoints === 'number' && Math.round(athletePoints) !== Math.round(oppPoints);
  const athleteBetterPoints = bothHavePoints && athletePoints! > oppPoints!;
  const oppBetterPoints = bothHavePoints && oppPoints! > athletePoints!;

  return createPortal(
    <div
      className={`match-detail-backdrop${isClosing ? ' is-closing' : ''}`}
      style={zIndex ? { zIndex } : undefined}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Dettaglio incontro contro ${match.avversario}`}
    >
      <div
        className={`match-detail-dialog${isClosing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="match-detail-close-btn"
          onClick={requestClose}
          aria-label="Chiudi dettaglio incontro"
          title="Chiudi (ESC)"
        >
          <i className="bi bi-x-lg" />
        </button>

        <div className="match-detail-body">
          {/* Info Campionato, Giornata, Data, Punti vinti */}
          <div className="match-detail-top-info">
            <p className="match-detail-kicker">{kickerLabel}</p>
            <div className="match-detail-meta-row">
              {match.titolo && (
                <span className="match-detail-meta-pill">
                  <i className="bi bi-trophy-fill" style={{ fontSize: '10px', opacity: 0.75 }} />
                  <span>{match.titolo}</span>
                </span>
              )}
              {match.giornata !== undefined && (
                <span className="match-detail-meta-pill">Giornata {match.giornata}</span>
              )}
              {match.fase && (
                <span className="match-detail-meta-pill">{match.fase}</span>
              )}
              {match.data && (
                <span className="match-detail-meta-pill">
                  <i className="bi bi-calendar3" style={{ fontSize: '10px', opacity: 0.75 }} />
                  <span>{match.data}</span>
                </span>
              )}
              {match.punti !== undefined && (
                <span
                  className={`match-detail-meta-pill ${match.punti > 0 ? 'is-points-pos' : match.punti < 0 ? 'is-points-neg' : ''
                    }`}
                >
                  {match.punti > 0
                    ? `+${match.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`
                    : `${match.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`}
                </span>
              )}
            </div>
          </div>

          {/* Singolo Card */}
          <div className="match-detail-card">
            <div className="match-detail-players-grid">
              {/* Atleta corrente */}
              <div className="match-detail-player">
                <div className="match-detail-avatar-wrap">
                  <AthleteAvatar
                    atletaId={athleteId}
                    photoUrlOverride={athletePhotoUrl}
                    nome={athleteName}
                    size={54}
                  />
                </div>
                <div className="match-detail-player-name">{athleteName}</div>
                {athleteClub && (
                  <div className="match-detail-club-row">
                    <TeamLogo teamName={athleteClub} size={16} />
                    <span className="match-detail-player-sub" title={athleteClub}>
                      {athleteClub}
                    </span>
                  </div>
                )}
              </div>

              {/* Centro: VS + Risultato + Esito */}
              <div className="match-detail-center-score">
                <span className="match-detail-vs-badge">VS</span>
                <div className={`match-detail-score-big ${match.isVittoria ? 'is-win' : 'is-loss'}`}>
                  {mainScore}
                </div>
                <span className={`match-detail-outcome-pill ${match.isVittoria ? 'is-win' : 'is-loss'}`}>
                  {match.isVittoria ? 'VINTA' : 'PERSA'}
                </span>
              </div>

              {/* Avversario */}
              <div className="match-detail-player">
                <button
                  type="button"
                  className="match-detail-player-btn"
                  onClick={() => {
                    if (onOpenOpponentProfile) {
                      onOpenOpponentProfile(oppResolvedId || match.avversario, match.avversario);
                    }
                  }}
                  title={`Apri scheda di ${match.avversario}`}
                >
                  <div className="match-detail-avatar-wrap">
                    <AthleteAvatar
                      atletaId={oppResolvedId}
                      photoUrlOverride={oppPhotoUrl}
                      nome={match.avversario}
                      size={54}
                    />
                  </div>
                  <div className="match-detail-player-name">{match.avversario}</div>
                </button>
                {oppClub && (
                  <div className="match-detail-club-row">
                    <TeamLogo teamName={oppClub} size={16} />
                    <span className="match-detail-player-sub" title={oppClub}>
                      {oppClub}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Pulsante Testa a Testa */}
            <button
              type="button"
              className="match-detail-h2h-btn"
              onClick={() => onOpenHeadToHead({ id: oppResolvedId, name: match.avversario })}
            >
              <i className="bi bi-arrow-left-right" />
              <span>
                Dati e pronostico IA
              </span>
            </button>
            {/* Tabella confronto Rank & Punti */}
            <div className="match-detail-compare-table">
              <div className="match-detail-compare-row">
                <div className="match-detail-compare-cell">
                  <span className={`match-detail-stat-pill is-rank${athleteBetterRank ? ' is-better' : ''}`}>
                    {athleteRankLabel}
                  </span>
                </div>
                <div className="match-detail-compare-label">Rank</div>
                <div className="match-detail-compare-cell">
                  <span className={`match-detail-stat-pill is-rank${oppBetterRank ? ' is-better' : ''}`}>
                    {oppRankLabel}
                  </span>
                </div>
              </div>
              <div className="match-detail-compare-row">
                <div className="match-detail-compare-cell">
                  <span className={`match-detail-stat-pill is-points${athleteBetterPoints ? ' is-better' : ''}`}>
                    {formatWholePoints(athletePoints)}
                  </span>
                </div>
                <div className="match-detail-compare-label">Punti</div>
                <div className="match-detail-compare-cell">
                  <span className={`match-detail-stat-pill is-points${oppBetterPoints ? ' is-better' : ''}`}>
                    {loadingOpponent ? '...' : formatWholePoints(oppPoints)}
                  </span>
                </div>
              </div>
            </div>

            {/* Griglia Set */}
            {match.sets && match.sets.length > 0 && (
              <div className="match-detail-sets-grid">
                {match.sets.map((setStr, i) => {
                  const won = parseSetWonByAthlete(setStr);
                  return (
                    <div
                      key={`${setStr}-${i}`}
                      className={`match-detail-set-box${won === true ? ' is-won' : ''}`}
                    >
                      {won === true && <span className="match-detail-set-dot" aria-hidden="true" />}
                      <div className="match-detail-set-label">Set {i + 1}</div>
                      <div className="match-detail-set-score">{setStr}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sezione Incontro a Squadre */}
          {(teamMatch || loadingReferto) && (
            <div>
              <p className="match-detail-section-label">Incontro a Squadre • Risultato Generale</p>
              <div className="match-detail-card">
                {teamMatch ? (
                  <div className="match-detail-team-grid">
                    <div className="match-detail-team-side">
                      <div className="match-detail-team-logo-wrap">
                        <TeamLogo teamName={teamMatch.squadraCasa} size={40} />
                      </div>
                      <div className="match-detail-team-name">{teamMatch.squadraCasa}</div>
                    </div>

                    <div className="match-detail-center-score">
                      <div className="match-detail-team-score">
                        {teamMatch.puntiCasa !== null && teamMatch.puntiOspite !== null
                          ? `${teamMatch.puntiCasa} - ${teamMatch.puntiOspite}`
                          : '-'}
                      </div>
                      <span className="match-detail-meta-pill">
                        {teamMatch.disputato ? 'Incontro Concluso' : 'In Programma'}
                      </span>
                    </div>

                    <div className="match-detail-team-side">
                      <div className="match-detail-team-logo-wrap">
                        <TeamLogo teamName={teamMatch.squadraOspite} size={40} />
                      </div>
                      <div className="match-detail-team-name">{teamMatch.squadraOspite}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Caricamento incontro a squadre...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Referto Incontri Squadre */}
          {referto && referto.partite && referto.partite.length > 0 && (
            <div>
              <p className="match-detail-section-label">Referto Incontri Squadre</p>
              <div className="match-detail-card" style={{ padding: '6px 10px' }}>
                <div className="match-detail-referto-list">
                  {referto.partite.map((rp, idx) => {
                    const scoreStr = `${rp.setVintiCasa} - ${rp.setVintiOspite}`;
                    const setsCompact = rp.sets?.map((s) => `${s.puntiCasa}-${s.puntiOspite}`).join(', ') || '';
                    const firstWord = athleteName.split(' ')[0].toUpperCase();
                    const isCurrentMatch =
                      rp.atletaCasa.toUpperCase().includes(firstWord) ||
                      rp.atletaOspite.toUpperCase().includes(firstWord);

                    return (
                      <div
                        key={rp.id || idx}
                        className={`match-detail-referto-row${isCurrentMatch ? ' is-current' : ''}`}
                      >
                        <div className="match-detail-referto-players" title={`${rp.atletaCasa} vs ${rp.atletaOspite}`}>
                          {rp.atletaCasa} <span style={{ color: 'var(--text-muted)' }}>vs</span> {rp.atletaOspite}
                        </div>
                        <div className="match-detail-referto-score">{scoreStr}</div>
                        {setsCompact && <div className="match-detail-referto-sets">{setsCompact}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Altre partite di questa giornata */}
          {otherDayMatches.length > 0 && (
            <div>
              <button
                type="button"
                className="match-detail-day-toggle"
                onClick={() => setShowOtherDayMatches((prev) => !prev)}
                aria-expanded={showOtherDayMatches}
              >
                <span>Altre partite di questa giornata ({otherDayMatches.length})</span>
                <i className={`bi ${showOtherDayMatches ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
              </button>

              {showOtherDayMatches && (
                <div className="match-detail-card" style={{ padding: '6px 10px', marginTop: '8px' }}>
                  <div className="match-detail-referto-list">
                    {otherDayMatches.map((om) => (
                      <div key={om.id} className="match-detail-referto-row">
                        <div className="match-detail-referto-players" title={`${om.squadraCasa} vs ${om.squadraOspite}`}>
                          {om.squadraCasa} <span style={{ color: 'var(--text-muted)' }}>vs</span> {om.squadraOspite}
                        </div>
                        <div className="match-detail-referto-score">
                          {om.disputato && om.puntiCasa !== null && om.puntiOspite !== null
                            ? `${om.puntiCasa} - ${om.puntiOspite}`
                            : om.data || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Azioni Campionato: Apri Referto Completo */}
          {teamMatch?.incontroId && (
            <div className="match-detail-actions-row">
              <button
                type="button"
                className="match-detail-action-btn"
                onClick={() => setIsRefertoModalOpen(true)}
              >
                <i className="bi bi-file-earmark-text" />
                <span>Apri referto completo</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="match-detail-footer">
          <button type="button" className="match-detail-footer-close" onClick={requestClose}>
            Chiudi
          </button>
        </div>
      </div>

      {isRefertoModalOpen && teamMatch?.incontroId && (
        <RefertoModal
          incontroId={teamMatch.incontroId}
          camId={resolvedChampInfo.effectiveCamId ? String(resolvedChampInfo.effectiveCamId) : undefined}
          formulaId={teamMatch.formula ? String(teamMatch.formula) : undefined}
          squadraCasaNome={teamMatch.squadraCasa}
          squadraOspiteNome={teamMatch.squadraOspite}
          zIndex={(zIndex || 1205) + 400}
          onClose={() => setIsRefertoModalOpen(false)}
        />
      )}
    </div>,
    document.body
  );
};
