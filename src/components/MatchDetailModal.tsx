import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CampionatoAttualeInfo, DettaglioAtleta, PartitaCalendario, RefertoIncontro } from '../types/fitet';
import { fetchAtleta, fetchDashboard, fetchReferto } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { useModalTransition } from '../utils/useModalTransition';
import { AthleteAvatar } from './AthleteAvatar';
import { TeamLogo } from './TeamLogo';
import { RefertoModal } from './RefertoModal';
import { SquadraModal } from './SquadraModal';
import { registerTeamLogos } from '../utils/teamLogos';
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
  onNavigateToGiornata?: (camId?: number, giornata?: number, tab?: 'classifica' | 'calendario') => void;
}

function parseSetScores(setStr: string): { a: number; b: number; wonByAthlete: boolean | null } | null {
  const m = setStr.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { a, b, wonByAthlete: a === b ? null : a > b };
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
  const [teamIdsByName, setTeamIdsByName] = useState<Record<string, string>>({});
  const [selectedTeamModal, setSelectedTeamModal] = useState<{ id: string; name: string } | null>(null);
  const [confirmNavTarget, setConfirmNavTarget] = useState<{
    camId: number;
    tab: 'classifica' | 'calendario';
    giornata?: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal && !isRefertoModalOpen && !selectedTeamModal) {
        e.stopPropagation();
        if (confirmNavTarget) {
          setConfirmNavTarget(null);
        } else {
          requestClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose, isTopModal, isRefertoModalOpen, selectedTeamModal, confirmNavTarget]);

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
    if (match.tipo === 'torneo') {
      return { effectiveCamId: undefined, clubHint: undefined, displayTitle: match.titolo };
    }
    const list = playedChampionships || [];
    const stripChamp = (s?: string) =>
      (s || '')
        .toUpperCase()
        .replace(/\b(SERIE|GIRONE|GIR|MASCHILE|FEMMINILE)\b/g, ' ')
        .replace(/[^A-Z0-9]/g, '');

    const titleNorm = normTeam(match.titolo);
    const titleStripped = stripChamp(match.titolo);

    let matched = list.find((c) => {
      const cn = normTeam(c.nome);
      const cs = stripChamp(c.nome);
      return (
        (cn && titleNorm && (cn.includes(titleNorm) || titleNorm.includes(cn))) ||
        (cs && titleStripped && (cs.includes(titleStripped) || titleStripped.includes(cs)))
      );
    });

    if (!matched && list.length === 1) {
      matched = list[0];
    }

    return {
      effectiveCamId: matched?.camId ?? list[0]?.camId ?? camId,
      clubHint: matched?.squadra || match.sottotitolo || athleteClub,
      displayTitle: matched?.nome || match.titolo,
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
        if (dash.classifica?.length) {
          registerTeamLogos(dash.classifica);
          const idMap: Record<string, string> = {};
          for (const t of dash.classifica) {
            if (t.nome && t.squadraId) {
              idMap[normTeam(t.nome)] = t.squadraId;
            }
          }
          if (active) setTeamIdsByName(idMap);
        }
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

  const effectiveSets = useMemo(() => {
    if (match.sets && match.sets.length > 0) return match.sets;
    if (!referto?.partite?.length) return [];
    const rp = referto.partite.find(
      (p) =>
        (playerNamesMatch(p.atletaCasa, athleteName) && playerNamesMatch(p.atletaOspite, match.avversario)) ||
        (playerNamesMatch(p.atletaCasa, match.avversario) && playerNamesMatch(p.atletaOspite, athleteName))
    );
    if (!rp?.sets?.length) return [];
    const athleteIsCasa = playerNamesMatch(rp.atletaCasa, athleteName);
    return rp.sets.map((s) =>
      athleteIsCasa ? `${s.puntiCasa}-${s.puntiOspite}` : `${s.puntiOspite}-${s.puntiCasa}`
    );
  }, [match.sets, referto, athleteName, match.avversario]);

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
              {(resolvedChampInfo.displayTitle || match.titolo) && (
                resolvedChampInfo.effectiveCamId && onNavigateToGiornata ? (
                  <button
                    type="button"
                    className="match-detail-meta-pill is-clickable"
                    onClick={() =>
                      setConfirmNavTarget({
                        camId: resolvedChampInfo.effectiveCamId!,
                        tab: 'classifica',
                        label: resolvedChampInfo.displayTitle || match.titolo,
                      })
                    }
                    title="Vai al campionato / classifica"
                  >
                    <i className="bi bi-trophy-fill" style={{ fontSize: '10px', opacity: 0.75 }} />
                    <span>{resolvedChampInfo.displayTitle || match.titolo}</span>
                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: '9px', opacity: 0.7 }} />
                  </button>
                ) : (
                  <span className="match-detail-meta-pill">
                    <i className="bi bi-trophy-fill" style={{ fontSize: '10px', opacity: 0.75 }} />
                    <span>{resolvedChampInfo.displayTitle || match.titolo}</span>
                  </span>
                )
              )}
              {match.giornata !== undefined && (
                resolvedChampInfo.effectiveCamId && onNavigateToGiornata ? (
                  <button
                    type="button"
                    className="match-detail-meta-pill is-clickable"
                    onClick={() =>
                      setConfirmNavTarget({
                        camId: resolvedChampInfo.effectiveCamId!,
                        tab: 'calendario',
                        giornata: match.giornata,
                        label: `${resolvedChampInfo.displayTitle || match.titolo} · Giornata ${match.giornata}`,
                      })
                    }
                    title={`Vai alla Giornata ${match.giornata} nel Calendario`}
                  >
                    <span>Giornata {match.giornata}</span>
                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: '9px', opacity: 0.7 }} />
                  </button>
                ) : (
                  <span className="match-detail-meta-pill">Giornata {match.giornata}</span>
                )
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

            {/* Tabella Set (Verticale) */}
            {effectiveSets.length > 0 && (() => {
              const parsedSets = effectiveSets.map((s) => parseSetScores(s));
              const setsWonA = parsedSets.filter((p) => p?.wonByAthlete === true).length;
              const setsWonB = parsedSets.filter((p) => p?.wonByAthlete === false).length;

              return (
                <div className="match-detail-sets-table-wrap">
                  <table className="match-detail-sets-table is-vertical" aria-label="Parziali dei set">
                    <thead>
                      <tr>
                        <th className="is-player-col" title={athleteName}>{athleteName}</th>
                        <th className="is-set-col">Set</th>
                        <th className="is-player-col" title={match.avversario}>{match.avversario}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedSets.map((p, i) => (
                        <tr key={`set-row-${i}`}>
                          <td className={p?.wonByAthlete === true ? 'is-won' : undefined}>
                            {p ? p.a : effectiveSets[i]}
                          </td>
                          <td className="is-set-col">{i + 1}°</td>
                          <td className={p?.wonByAthlete === false ? 'is-won' : undefined}>
                            {p ? p.b : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={setsWonA > setsWonB ? 'is-win' : undefined}>{setsWonA}</td>
                        <td className="is-set-col"> - </td>
                        <td className={setsWonB > setsWonA ? 'is-win' : undefined}>{setsWonB}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Sezione Incontro a Squadre */}
          {(teamMatch || loadingReferto) && (
            <div>
              <p className="match-detail-section-label">Incontro a Squadre • Risultato Generale</p>
              <div className="match-detail-card">
                {teamMatch ? (() => {
                  const casaId = teamIdsByName[normTeam(teamMatch.squadraCasa)];
                  const ospiteId = teamIdsByName[normTeam(teamMatch.squadraOspite)];
                  const canOpenTeams = Boolean(resolvedChampInfo.effectiveCamId);

                  return (
                    <div className="match-detail-team-grid">
                      <div className="match-detail-team-side">
                        {casaId && canOpenTeams ? (
                          <button
                            type="button"
                            className="match-detail-team-btn"
                            onClick={() => setSelectedTeamModal({ id: casaId, name: teamMatch.squadraCasa })}
                            title={`Apri scheda squadra ${teamMatch.squadraCasa}`}
                          >
                            <div className="match-detail-team-logo-wrap">
                              <TeamLogo
                                teamName={teamMatch.squadraCasa}
                                logoUrl={referto?.squadraCasa?.logoUrl}
                                size={40}
                              />
                            </div>
                            <div className="match-detail-team-name">{teamMatch.squadraCasa}</div>
                          </button>
                        ) : (
                          <>
                            <div className="match-detail-team-logo-wrap">
                              <TeamLogo
                                teamName={teamMatch.squadraCasa}
                                logoUrl={referto?.squadraCasa?.logoUrl}
                                size={40}
                              />
                            </div>
                            <div className="match-detail-team-name">{teamMatch.squadraCasa}</div>
                          </>
                        )}
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
                        {ospiteId && canOpenTeams ? (
                          <button
                            type="button"
                            className="match-detail-team-btn"
                            onClick={() => setSelectedTeamModal({ id: ospiteId, name: teamMatch.squadraOspite })}
                            title={`Apri scheda squadra ${teamMatch.squadraOspite}`}
                          >
                            <div className="match-detail-team-logo-wrap">
                              <TeamLogo
                                teamName={teamMatch.squadraOspite}
                                logoUrl={referto?.squadraOspite?.logoUrl}
                                size={40}
                              />
                            </div>
                            <div className="match-detail-team-name">{teamMatch.squadraOspite}</div>
                          </button>
                        ) : (
                          <>
                            <div className="match-detail-team-logo-wrap">
                              <TeamLogo
                                teamName={teamMatch.squadraOspite}
                                logoUrl={referto?.squadraOspite?.logoUrl}
                                size={40}
                              />
                            </div>
                            <div className="match-detail-team-name">{teamMatch.squadraOspite}</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })() : (
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
            <div className={`container-others ${showOtherDayMatches ? 'is-expanded' : ''}`}>
              <button
                type="button"
                className={`match-detail-day-toggle ${showOtherDayMatches ? 'is-expanded' : ''}`}
                onClick={() => setShowOtherDayMatches((prev) => !prev)}
                aria-expanded={showOtherDayMatches}
              >
                <span>Altre partite di questa giornata ({otherDayMatches.length})</span>
                <i className={`bi ${showOtherDayMatches ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
              </button>

              {showOtherDayMatches && (
                <div className="match-detail-card" style={{ padding: '6px 10px', marginTop: '8px' }}>
                  <div className="match-detail-referto-list">
                    {otherDayMatches.map((om) => {
                      const omCasaId = teamIdsByName[normTeam(om.squadraCasa)];
                      const omOspiteId = teamIdsByName[normTeam(om.squadraOspite)];
                      const canOpenTeams = Boolean(resolvedChampInfo.effectiveCamId);

                      return (
                        <div key={om.id} className="match-detail-referto-row">
                          <div className="match-detail-day-teams" title={`${om.squadraCasa} vs ${om.squadraOspite}`}>
                            {omCasaId && canOpenTeams ? (
                              <button
                                type="button"
                                className="match-detail-day-team match-detail-day-team-btn"
                                onClick={() => setSelectedTeamModal({ id: omCasaId, name: om.squadraCasa })}
                                title={`Apri scheda squadra ${om.squadraCasa}`}
                              >
                                <TeamLogo teamName={om.squadraCasa} size={18} />
                                <span className="match-detail-day-team-name">{om.squadraCasa}</span>
                              </button>
                            ) : (
                              <span className="match-detail-day-team">
                                <TeamLogo teamName={om.squadraCasa} size={18} />
                                <span className="match-detail-day-team-name">{om.squadraCasa}</span>
                              </span>
                            )}
                            <span className="match-detail-day-vs">vs</span>
                            {omOspiteId && canOpenTeams ? (
                              <button
                                type="button"
                                className="match-detail-day-team match-detail-day-team-btn"
                                onClick={() => setSelectedTeamModal({ id: omOspiteId, name: om.squadraOspite })}
                                title={`Apri scheda squadra ${om.squadraOspite}`}
                              >
                                <TeamLogo teamName={om.squadraOspite} size={18} />
                                <span className="match-detail-day-team-name">{om.squadraOspite}</span>
                              </button>
                            ) : (
                              <span className="match-detail-day-team">
                                <TeamLogo teamName={om.squadraOspite} size={18} />
                                <span className="match-detail-day-team-name">{om.squadraOspite}</span>
                              </span>
                            )}
                          </div>
                          <div className="match-detail-referto-score">
                            {om.disputato && om.puntiCasa !== null && om.puntiOspite !== null
                              ? `${om.puntiCasa} - ${om.puntiOspite}`
                              : om.data || '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="match-detail-footer">
          <button type="button" className="match-detail-footer-close" onClick={requestClose}>
            Chiudi
          </button>
        </div>

        {/* Modale di conferma abbandono scheda atleta */}
        {confirmNavTarget && (
          <div
            className="match-detail-confirm-overlay"
            onClick={() => setConfirmNavTarget(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Conferma navigazione campionato"
          >
            <div className="match-detail-confirm-box" onClick={(e) => e.stopPropagation()}>
              <h4 className="match-detail-confirm-title">Abbandonare la scheda atleta?</h4>
              <p className="match-detail-confirm-text">
                Sei sicuro di voler abbandonare la scheda atleta e andare a{' '}
                <strong>{confirmNavTarget.label}</strong>?
              </p>
              <div className="match-detail-confirm-actions">
                <button
                  type="button"
                  className="match-detail-confirm-btn"
                  onClick={() => setConfirmNavTarget(null)}
                >
                  No
                </button>
                <button
                  type="button"
                  className="match-detail-confirm-btn is-yes"
                  onClick={() => {
                    const target = confirmNavTarget;
                    setConfirmNavTarget(null);
                    onNavigateToGiornata?.(target.camId, target.giornata, target.tab);
                  }}
                >
                  Sì
                </button>
              </div>
            </div>
          </div>
        )}
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

      {selectedTeamModal && resolvedChampInfo.effectiveCamId && (
        <SquadraModal
          squadraId={selectedTeamModal.id}
          squadraNome={selectedTeamModal.name}
          camId={resolvedChampInfo.effectiveCamId}
          annoId={annoId}
          zIndex={(zIndex || 1205) + 400}
          onClose={() => setSelectedTeamModal(null)}
          onOpenAtletaModal={
            onOpenOpponentProfile
              ? (id, name) => {
                setSelectedTeamModal(null);
                onOpenOpponentProfile(id, name);
              }
              : undefined
          }
        />
      )}
    </div>,
    document.body
  );
};
