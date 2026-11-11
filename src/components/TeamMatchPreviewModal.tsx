import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, RefreshCw, AlertCircle, Quote, Users, Trophy, BarChart3 } from 'lucide-react';
import {
  DettaglioSquadra,
  GiornataCalendario,
  PartitaCalendario,
  SquadraClassifica,
  TeamMatchPrediction,
} from '../types/fitet';
import { fetchSquadra } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import { HeadToHeadModal } from './HeadToHeadModal';
import {
  EvaluatedPlayer,
  computeEvaluatedRoster,
  findDirectPrecedent,
  findStandingForTeam,
  findTeamRecentMatches,
  inferChampionshipFormula,
  selectLikelyStarters,
} from '../utils/teamMatchPreview';
import './TeamMatchPreviewModal.css';

export interface TeamMatchPreviewModalProps {
  isOpen: boolean;
  match: PartitaCalendario;
  camId?: number;
  annoId?: number;
  championshipName?: string;
  calendario: GiornataCalendario[];
  classifica?: SquadraClassifica[];
  isSubmodalOpen?: boolean;
  onClose: () => void;
  onOpenSquadraModal?: (teamName: string) => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
}

const shortenName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
    const lastName = parts[0];
    const firstInitial = parts[1]?.[0] ? `${parts[1][0]}.` : '';
    return `${firstInitial} ${lastName}`.trim();
  }
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

export const TeamMatchPreviewModal: React.FC<TeamMatchPreviewModalProps> = ({
  isOpen,
  match,
  camId = 0,
  annoId = 41,
  championshipName,
  calendario,
  classifica,
  isSubmodalOpen = false,
  onClose,
  onOpenSquadraModal,
  onOpenAtletaModal,
}) => {
  useBodyScrollLock(isOpen);

  const [homeRosterRaw, setHomeRosterRaw] = useState<DettaglioSquadra | null>(null);
  const [awayRosterRaw, setAwayRosterRaw] = useState<DettaglioSquadra | null>(null);
  const [loadingRosters, setLoadingRosters] = useState<boolean>(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [selectedHomeKeys, setSelectedHomeKeys] = useState<string[]>([]);
  const [selectedAwayKeys, setSelectedAwayKeys] = useState<string[]>([]);

  const [prediction, setPrediction] = useState<TeamMatchPrediction | null>(null);
  const [predictLoading, setPredictLoading] = useState<boolean>(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const [rosterViewTab, setRosterViewTab] = useState<'casa' | 'ospite' | 'confronto'>('confronto');
  const [showTeamComparison, setShowTeamComparison] = useState<boolean>(true);

  const [h2hPair, setH2hPair] = useState<{
    p1Id: string;
    p1Name: string;
    p2Id: string;
    p2Name: string;
  } | null>(null);

  const homeStanding = useMemo(
    () => findStandingForTeam(classifica, match.squadraCasa),
    [classifica, match.squadraCasa]
  );
  const awayStanding = useMemo(
    () => findStandingForTeam(classifica, match.squadraOspite),
    [classifica, match.squadraOspite]
  );

  const formulaInfo = useMemo(
    () => inferChampionshipFormula(calendario, match.formula),
    [calendario, match.formula]
  );

  const directPrecedent = useMemo(
    () => findDirectPrecedent(calendario, match.squadraCasa, match.squadraOspite, match.id),
    [calendario, match.squadraCasa, match.squadraOspite, match.id]
  );

  const homeRecent = useMemo(
    () => findTeamRecentMatches(calendario, match.squadraCasa, 5),
    [calendario, match.squadraCasa]
  );
  const awayRecent = useMemo(
    () => findTeamRecentMatches(calendario, match.squadraOspite, 5),
    [calendario, match.squadraOspite]
  );

  // Fetch both teams' rosters when modal opens
  useEffect(() => {
    if (!isOpen || !camId) {
      setLoadingRosters(false);
      return;
    }

    let isMounted = true;
    setLoadingRosters(true);
    setRosterError(null);
    setHomeRosterRaw(null);
    setAwayRosterRaw(null);
    setPrediction(null);
    setPredictError(null);

    const homeKey = homeStanding?.squadraId || match.squadraCasa;
    const awayKey = awayStanding?.squadraId || match.squadraOspite;

    Promise.allSettled([
      fetchSquadra(homeKey, camId, annoId, false),
      fetchSquadra(awayKey, camId, annoId, false),
    ])
      .then(([homeRes, awayRes]) => {
        if (!isMounted) return;
        if (homeRes.status === 'fulfilled') setHomeRosterRaw(homeRes.value);
        if (awayRes.status === 'fulfilled') setAwayRosterRaw(awayRes.value);
        if (homeRes.status === 'rejected' && awayRes.status === 'rejected') {
          setRosterError('Impossibile recuperare i roster delle squadre dal portale FITeT.');
        }
      })
      .finally(() => {
        if (isMounted) setLoadingRosters(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, match.id, match.squadraCasa, match.squadraOspite, camId, annoId, homeStanding?.squadraId, awayStanding?.squadraId]);

  // Compute reference max FITeT points across both teams for fair comparative evaluation
  const maxReferencePoints = useMemo(() => {
    const allPts = [
      ...(homeRosterRaw?.atleti || []).map((a) => a.rankPunti || 0),
      ...(awayRosterRaw?.atleti || []).map((a) => a.rankPunti || 0),
    ];
    return Math.max(...allPts, 1000);
  }, [homeRosterRaw, awayRosterRaw]);

  const homeEvaluated = useMemo(
    () => computeEvaluatedRoster(homeRosterRaw?.atleti || [], maxReferencePoints),
    [homeRosterRaw, maxReferencePoints]
  );
  const awayEvaluated = useMemo(
    () => computeEvaluatedRoster(awayRosterRaw?.atleti || [], maxReferencePoints),
    [awayRosterRaw, maxReferencePoints]
  );

  // Auto-select likely 3 starters per team whenever rosters load
  useEffect(() => {
    if (homeEvaluated.length > 0) {
      setSelectedHomeKeys(selectLikelyStarters(homeEvaluated, 3));
    } else {
      setSelectedHomeKeys([]);
    }
  }, [homeEvaluated]);

  useEffect(() => {
    if (awayEvaluated.length > 0) {
      setSelectedAwayKeys(selectLikelyStarters(awayEvaluated, 3));
    } else {
      setSelectedAwayKeys([]);
    }
  }, [awayEvaluated]);

  const homeStarters = useMemo(() => {
    const selected = homeEvaluated.filter((p) => selectedHomeKeys.includes(p.atletaId || p.nome));
    return selected.length > 0 ? selected : homeEvaluated.slice(0, 3);
  }, [homeEvaluated, selectedHomeKeys]);

  const awayStarters = useMemo(() => {
    const selected = awayEvaluated.filter((p) => selectedAwayKeys.includes(p.atletaId || p.nome));
    return selected.length > 0 ? selected : awayEvaluated.slice(0, 3);
  }, [awayEvaluated, selectedAwayKeys]);

  // Cache key includes selected starters so changing lineup updates prediction cleanly
  const cacheKey = useMemo(() => {
    const hLineup = [...selectedHomeKeys].sort().join(',');
    const aLineup = [...selectedAwayKeys].sort().join(',');
    return `team_match_pred_${camId}_${match.id}_${hLineup}_${aLineup}`;
  }, [camId, match.id, selectedHomeKeys, selectedAwayKeys]);

  useEffect(() => {
    if (!isOpen) return;
    setPredictError(null);
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data && typeof parsed.data.probCasa === 'number') {
          setPrediction(parsed.data);
          return;
        }
      }
    } catch {
      // ignore localStorage read errors
    }
    setPrediction(null);
  }, [isOpen, cacheKey]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || isSubmodalOpen || Boolean(h2hPair)) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isSubmodalOpen, h2hPair, onClose]);

  const toggleStarter = (side: 'home' | 'away', playerKey: string) => {
    const setter = side === 'home' ? setSelectedHomeKeys : setSelectedAwayKeys;
    setter((prev) => {
      if (prev.includes(playerKey)) {
        if (prev.length <= 1) return prev; // Keep at least 1 starter
        return prev.filter((k) => k !== playerKey);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), playerKey];
      }
      return [...prev, playerKey];
    });
  };

  const generatePrediction = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        try {
          localStorage.removeItem(cacheKey);
        } catch {
          // ignore
        }
      }

      setPredictLoading(true);
      setPredictError(null);

      try {
        const res = await fetch('/api/predict-team-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            camId,
            championshipName,
            giornata: match.giornata,
            fase: match.tipo,
            matchDate: `${match.data}${match.ora ? ` ore ${match.ora}` : ''}`,
            formulaInfo,
            homeTeam: {
              nome: match.squadraCasa,
              posizione: homeStanding?.posizione ?? null,
              puntiClassifica: homeStanding?.punti ?? null,
              incontriDisputati: homeStanding?.incontriDisputati ?? 0,
              incontriVinti: homeStanding?.incontriVinti ?? 0,
              incontriPareggiati: homeStanding?.incontriPareggiati ?? 0,
              incontriPersi: homeStanding?.incontriPersi ?? 0,
              partiteVinte: homeStanding?.partiteVinte ?? 0,
              partitePerse: homeStanding?.partitePerse ?? 0,
              setVinti: homeStanding?.setVinti ?? 0,
              setPersi: homeStanding?.setPersi ?? 0,
              puntiVinti: homeStanding?.puntiVinti ?? 0,
              puntiPersi: homeStanding?.puntiPersi ?? 0,
              forma: homeStanding?.forma ?? homeRecent.map((r) => r.outcome),
              players: homeStarters,
            },
            awayTeam: {
              nome: match.squadraOspite,
              posizione: awayStanding?.posizione ?? null,
              puntiClassifica: awayStanding?.punti ?? null,
              incontriDisputati: awayStanding?.incontriDisputati ?? 0,
              incontriVinti: awayStanding?.incontriVinti ?? 0,
              incontriPareggiati: awayStanding?.incontriPareggiati ?? 0,
              incontriPersi: awayStanding?.incontriPersi ?? 0,
              partiteVinte: awayStanding?.partiteVinte ?? 0,
              partitePerse: awayStanding?.partitePerse ?? 0,
              setVinti: awayStanding?.setVinti ?? 0,
              setPersi: awayStanding?.setPersi ?? 0,
              puntiVinti: awayStanding?.puntiVinti ?? 0,
              puntiPersi: awayStanding?.puntiPersi ?? 0,
              forma: awayStanding?.forma ?? awayRecent.map((r) => r.outcome),
              players: awayStarters,
            },
            reverseFixture: directPrecedent
              ? {
                  giornata: directPrecedent.giornata,
                  fase: directPrecedent.tipo,
                  data: directPrecedent.data,
                  risultato: directPrecedent.risultato,
                  puntiCasa: directPrecedent.puntiCasa,
                  puntiOspite: directPrecedent.puntiOspite,
                  casaNome: directPrecedent.squadraCasa,
                  ospiteNome: directPrecedent.squadraOspite,
                }
              : null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Errore del server (${res.status})`);
        }

        setPrediction(data as TeamMatchPrediction);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
        } catch {
          // ignore storage quota errors
        }
      } catch (err: any) {
        setPredictError(err?.message || 'Impossibile generare il pronostico con IA al momento.');
      } finally {
        setPredictLoading(false);
      }
    },
    [
      cacheKey,
      camId,
      championshipName,
      match,
      formulaInfo,
      homeStanding,
      awayStanding,
      homeRecent,
      awayRecent,
      homeStarters,
      awayStarters,
      directPrecedent,
    ]
  );

  // Pairwise fascia comparisons between the selected starters (#1 vs #1, #2 vs #2, #3 vs #3)
  const fasciaComparisons = useMemo(() => {
    const maxLen = Math.max(homeStarters.length, awayStarters.length);
    const pairs: Array<{
      fascia: number;
      home?: EvaluatedPlayer;
      away?: EvaluatedPlayer;
      diffEval: number;
      diffPts: number | null;
    }> = [];
    for (let i = 0; i < maxLen; i++) {
      const h = homeStarters[i];
      const a = awayStarters[i];
      pairs.push({
        fascia: i + 1,
        home: h,
        away: a,
        diffEval: (h?.evaluationScore || 0) - (a?.evaluationScore || 0),
        diffPts:
          h?.rankPunti !== null && h?.rankPunti !== undefined && a?.rankPunti !== null && a?.rankPunti !== undefined
            ? h.rankPunti - a.rankPunti
            : null,
      });
    }
    return pairs;
  }, [homeStarters, awayStarters]);

  const homeAvgEval = useMemo(() => {
    if (homeStarters.length === 0) return 0;
    return Math.round(homeStarters.reduce((s, p) => s + p.evaluationScore, 0) / homeStarters.length);
  }, [homeStarters]);

  const awayAvgEval = useMemo(() => {
    if (awayStarters.length === 0) return 0;
    return Math.round(awayStarters.reduce((s, p) => s + p.evaluationScore, 0) / awayStarters.length);
  }, [awayStarters]);

  const homeAvgRankPts = useMemo(() => {
    const withPts = homeStarters.filter((p) => p.rankPunti !== null);
    if (withPts.length === 0) return null;
    return Math.round(withPts.reduce((s, p) => s + (p.rankPunti || 0), 0) / withPts.length);
  }, [homeStarters]);

  const awayAvgRankPts = useMemo(() => {
    const withPts = awayStarters.filter((p) => p.rankPunti !== null);
    if (withPts.length === 0) return null;
    return Math.round(withPts.reduce((s, p) => s + (p.rankPunti || 0), 0) / withPts.length);
  }, [awayStarters]);

  if (!isOpen || typeof document === 'undefined') return null;

  const findAthleteIdByName = (name: string, list: EvaluatedPlayer[]): string | undefined => {
    const norm = name.trim().toUpperCase();
    const matchPlayer = list.find(
      (p) =>
        p.nome.trim().toUpperCase() === norm ||
        p.nome.trim().toUpperCase().includes(norm) ||
        norm.includes(p.nome.trim().toUpperCase())
    );
    return matchPlayer?.atletaId || undefined;
  };

  const renderRosterTable = (players: EvaluatedPlayer[], side: 'home' | 'away', selectedKeys: string[]) => {
    if (players.length === 0) {
      return (
        <div className="h2h-empty-box">
          Nessun atleta disponibile in rosa per questa squadra.
        </div>
      );
    }

    return (
      <div className="tmp-table-wrap">
        <table className="tmp-eval-table">
          <thead>
            <tr>
              <th style={{ width: '34px', textAlign: 'center' }} title="Includi tra i titolari per il pronostico IA">
                Tit.
              </th>
              <th>Atleta</th>
              <th style={{ textAlign: 'center' }}>Rank / Pt</th>
              <th style={{ textAlign: 'center' }} title="Partite Disputate (Vinte - Perse)">
                PD (V-P)
              </th>
              <th style={{ textAlign: 'center' }}>Set</th>
              <th style={{ textAlign: 'center' }}>Punti</th>
              <th style={{ textAlign: 'center' }}>% Vitt.</th>
              <th style={{ textAlign: 'right' }}>Valutazione</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const pKey = p.atletaId || p.nome;
              const isStarter = selectedKeys.includes(pKey);
              const winColor =
                p.percentualeVittorie >= 65
                  ? '#16a34a'
                  : p.percentualeVittorie >= 40
                    ? '#d97706'
                    : '#dc2626';
              const clickableAthlete = Boolean(p.atletaId && onOpenAtletaModal);

              return (
                <tr key={pKey} className={isStarter ? 'is-starter' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className={`tmp-starter-toggle ${isStarter ? 'is-selected' : ''}`}
                      onClick={() => toggleStarter(side, pKey)}
                      title={isStarter ? 'Rimuovi dai titolari' : 'Seleziona come titolare'}
                      aria-pressed={isStarter}
                    >
                      <i className={`bi ${isStarter ? 'bi-check-lg' : 'bi-plus'}`}></i>
                    </button>
                  </td>
                  <td>
                    <div
                      className={`tmp-player-cell ${clickableAthlete ? 'is-clickable' : ''}`}
                      onClick={() => {
                        if (clickableAthlete && onOpenAtletaModal) {
                          onOpenAtletaModal(p.atletaId, p.nome);
                        }
                      }}
                    >
                      <AthleteAvatar atletaId={p.atletaId} nome={p.nome} size={26} />
                      <div className="tmp-player-meta">
                        <span className="tmp-player-name">{p.nome}</span>
                        <span className={`tmp-tier-badge is-${p.tierTone}`}>{p.tierLabel}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {p.rankPosizione || p.rankPunti ? (
                      <div className="tmp-rank-col">
                        {p.rankPosizione && <span className="tmp-rank-pos">#{p.rankPosizione}</span>}
                        {p.rankPunti !== null && (
                          <span className="tmp-rank-pts">{p.rankPunti.toLocaleString('it-IT')}</span>
                        )}
                      </div>
                    ) : (
                      <span className="tmp-muted">N.C.</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <strong>{p.partiteDisputate}</strong>{' '}
                    <span className="tmp-muted">
                      ({p.partiteVinte}-{p.partitePerse})
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span className="text-success fw-semibold">{p.setVinti}</span>
                    <span className="tmp-muted">:</span>
                    <span className="text-danger fw-semibold">{p.setPersi}</span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '11px' }}>
                    <span>{p.puntiVinti}</span>
                    <span className="tmp-muted">-</span>
                    <span className="tmp-muted">{p.puntiPersi}</span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: winColor }}>
                    {p.percentualeVittorie}%
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="tmp-eval-cell">
                      <span className="tmp-eval-score">{p.evaluationScore}</span>
                      <div className="tmp-eval-track">
                        <div
                          className={`tmp-eval-fill is-${p.tierTone}`}
                          style={{ width: `${p.evaluationScore}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return createPortal(
    <div
      className="modal-backdrop-simple modal-referto-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card-simple h2h-modal-card tmp-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header stile HeadToHeadModal */}
        <div className="h2h-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span className="h2h-header-icon tmp-header-icon" aria-hidden="true">
              <Sparkles style={{ width: '16px', height: '16px' }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 className="tmp-header-title">Anteprima Incontro &amp; Pronostico IA</h3>
              <p className="tmp-header-sub">
                {match.giornata}ª Giornata ({match.tipo === 'andata' ? 'Andata' : 'Ritorno'}) • {match.data}
                {match.ora ? ` ore ${match.ora}` : ''}
                {championshipName ? ` • ${championshipName}` : ''}
              </p>
            </div>
          </div>

          <button type="button" onClick={onClose} aria-label="Chiudi" className="modal-close-btn">
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        {/* Body */}
        <div className="tmp-modal-body">
          {/* Versus Banner */}
          <div className="h2h-versus-banner tmp-versus-banner">
            <div className="tmp-versus-row">
              {/* Casa */}
              <div className="h2h-player-column">
                <button
                  type="button"
                  className="h2h-player-change-trigger"
                  onClick={() => onOpenSquadraModal && onOpenSquadraModal(match.squadraCasa)}
                  title={`Apri scheda ${match.squadraCasa}`}
                  disabled={!onOpenSquadraModal}
                >
                  <TeamLogo
                    teamName={match.squadraCasa}
                    logoUrl={homeRosterRaw?.logoUrl || homeStanding?.logoUrl}
                    size={54}
                    className="tmp-team-logo-box is-home"
                  />
                  <span className="tmp-side-pill is-home">CASA</span>
                  <div className="tmp-team-name-text" title={match.squadraCasa}>
                    {match.squadraCasa}
                  </div>
                  <div className="tmp-team-standing-sub">
                    {homeStanding
                      ? `#${homeStanding.posizione} in classifica · ${homeStanding.punti} pt`
                      : 'Squadra di casa'}
                  </div>
                  {(homeStanding?.forma?.length || homeRecent.length) > 0 && (
                    <div className="tmp-form-dots">
                      {(homeStanding?.forma?.length
                        ? homeStanding.forma.slice(-5)
                        : homeRecent.map((r) => r.outcome).reverse()
                      ).map((f, idx) => (
                        <span key={idx} className={`tmp-form-dot is-${f}`}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </div>

              {/* Center Score / VS */}
              <div className="tmp-center-score-col">
                {prediction ? (
                  <>
                    <div className="h2h-central-score tmp-predicted-score">
                      <span
                        style={{
                          color:
                            prediction.puntiIncontroCasa > prediction.puntiIncontroOspite
                              ? '#16a34a'
                              : 'var(--text-dark)',
                        }}
                      >
                        {prediction.puntiIncontroCasa}
                      </span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: '20px' }}>-</span>
                      <span
                        style={{
                          color:
                            prediction.puntiIncontroOspite > prediction.puntiIncontroCasa
                              ? '#16a34a'
                              : 'var(--text-dark)',
                        }}
                      >
                        {prediction.puntiIncontroOspite}
                      </span>
                    </div>
                    <div className="h2h-matches-label">Risultato Stimato IA</div>
                    <div className="tmp-center-mini-stats">
                      <span>
                        Set{' '}
                        <strong>
                          {prediction.setStimatiCasa}:{prediction.setStimatiOspite}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Pt{' '}
                        <strong>
                          {prediction.puntiStimatiCasa}-{prediction.puntiStimatiOspite}
                        </strong>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tmp-vs-badge">VS</div>
                    <div className="h2h-matches-label">Giornata {match.giornata}</div>
                    <div className="tmp-formula-hint">{formulaInfo.expectedTotalMatches} incontri max</div>
                  </>
                )}
              </div>

              {/* Ospite */}
              <div className="h2h-player-column">
                <button
                  type="button"
                  className="h2h-player-change-trigger"
                  onClick={() => onOpenSquadraModal && onOpenSquadraModal(match.squadraOspite)}
                  title={`Apri scheda ${match.squadraOspite}`}
                  disabled={!onOpenSquadraModal}
                >
                  <TeamLogo
                    teamName={match.squadraOspite}
                    logoUrl={awayRosterRaw?.logoUrl || awayStanding?.logoUrl}
                    size={54}
                    className="tmp-team-logo-box is-away"
                  />
                  <span className="tmp-side-pill is-away">OSPITE</span>
                  <div className="tmp-team-name-text" title={match.squadraOspite}>
                    {match.squadraOspite}
                  </div>
                  <div className="tmp-team-standing-sub">
                    {awayStanding
                      ? `#${awayStanding.posizione} in classifica · ${awayStanding.punti} pt`
                      : 'Squadra ospite'}
                  </div>
                  {(awayStanding?.forma?.length || awayRecent.length) > 0 && (
                    <div className="tmp-form-dots">
                      {(awayStanding?.forma?.length
                        ? awayStanding.forma.slice(-5)
                        : awayRecent.map((r) => r.outcome).reverse()
                      ).map((f, idx) => (
                        <span key={idx} className={`tmp-form-dot is-${f}`}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Probability Bar */}
            {prediction && (
              <div className="tmp-prob-block">
                <div className="tmp-prob-labels">
                  <span className="is-home">
                    {match.squadraCasa} <strong>{prediction.probCasa}%</strong>
                  </span>
                  {prediction.probPareggio > 0 && (
                    <span className="is-draw">
                      Pareggio <strong>{prediction.probPareggio}%</strong>
                    </span>
                  )}
                  <span className="is-away">
                    <strong>{prediction.probOspite}%</strong> {match.squadraOspite}
                  </span>
                </div>
                <div className="h2h-progress-track tmp-progress-track">
                  <div
                    style={{ width: `${prediction.probCasa}%`, background: '#16a34a' }}
                    title={`${match.squadraCasa}: ${prediction.probCasa}%`}
                  />
                  {prediction.probPareggio > 0 && (
                    <div
                      style={{ width: `${prediction.probPareggio}%`, background: '#94a3b8' }}
                      title={`Pareggio: ${prediction.probPareggio}%`}
                    />
                  )}
                  <div
                    style={{ width: `${prediction.probOspite}%`, background: '#f59e0b' }}
                    title={`${match.squadraOspite}: ${prediction.probOspite}%`}
                  />
                </div>
              </div>
            )}
          </div>

          {loadingRosters && (
            <div className="tmp-loading-box">
              <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />
              Caricamento rose, ranking e statistiche giocatori da FITeT...
            </div>
          )}

          {rosterError && !loadingRosters && (
            <div className="h2h-error-banner mb-3">
              <i className="bi bi-exclamation-triangle me-1"></i>
              {rosterError}
            </div>
          )}

          {/* Sezione Pronostico IA */}
          {!loadingRosters && (
            <section className="tmp-section-card tmp-ai-card">
              <div className="tmp-section-head">
                <div className="tmp-section-title-wrap">
                  <span className="tmp-section-icon is-ai">
                    <Sparkles style={{ width: '15px', height: '15px' }} />
                  </span>
                  <div>
                    <h4 className="tmp-section-title">Pronostico Incontro con IA</h4>
                    <p className="tmp-section-sub">
                      Simulazione basata su {homeStarters.length} titolari casa vs {awayStarters.length} ospiti •{' '}
                      {formulaInfo.label}
                    </p>
                  </div>
                </div>
                {prediction && !predictLoading && (
                  <button
                    type="button"
                    className="tmp-refresh-ai-btn"
                    onClick={() => generatePrediction(true)}
                    title="Rigenera pronostico IA con i titolari selezionati"
                  >
                    <RefreshCw style={{ width: '13px', height: '13px' }} />
                    <span>Rigenera</span>
                  </button>
                )}
              </div>

              {predictLoading && (
                <div className="tmp-ai-loading">
                  <span className="spinner-border spinner-border-sm text-primary" role="status" />
                  <div>
                    <div className="fw-semibold small">Simulazione IA dei singoli incontri in corso...</div>
                    <div className="tmp-muted" style={{ fontSize: '11.5px' }}>
                      Valutazione incroci, set stimati, punti e stato di forma
                    </div>
                  </div>
                </div>
              )}

              {!predictLoading && predictError && (
                <div className="alert alert-danger d-flex align-items-start gap-2 mb-0 p-3" role="alert">
                  <AlertCircle className="flex-shrink-0 mt-1 text-danger" style={{ width: '1rem', height: '1rem' }} />
                  <div className="flex-grow-1 small">
                    <p className="fw-semibold mb-1">{predictError}</p>
                    <button
                      type="button"
                      onClick={() => generatePrediction(false)}
                      className="btn btn-danger btn-sm d-inline-flex align-items-center gap-1 py-1 px-2"
                    >
                      <RefreshCw style={{ width: '0.75rem', height: '0.75rem' }} />
                      <span>Riprova</span>
                    </button>
                  </div>
                </div>
              )}

              {!predictLoading && !predictError && !prediction && (
                <div className="tmp-ai-cta-box">
                  <p className="small mb-2" style={{ color: 'var(--text-muted)' }}>
                    Genera una simulazione completa dell&apos;incontro con <strong>risultato potenziale</strong>,{' '}
                    <strong>set vinti</strong>, <strong>punti stimati</strong> e dettaglio partita per partita. Puoi
                    personalizzare i titolari nella tabella sotto.
                  </p>
                  <div className="tmp-lineup-preview-pills">
                    <span className="tmp-lineup-pill is-home">
                      Casa: {homeStarters.map((p) => shortenName(p.nome)).join(', ') || match.squadraCasa}
                    </span>
                    <span className="tmp-lineup-pill is-away">
                      Ospite: {awayStarters.map((p) => shortenName(p.nome)).join(', ') || match.squadraOspite}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 fw-semibold"
                    onClick={() => generatePrediction(false)}
                  >
                    <Sparkles style={{ width: '0.9rem', height: '0.9rem' }} />
                    <span>Genera Pronostico IA Incontro</span>
                  </button>
                </div>
              )}

              {!predictLoading && !predictError && prediction && (
                <div className="tmp-ai-result">
                  {/* KPI Potenziale Risultato */}
                  <div className="tmp-kpi-grid">
                    <div className="tmp-kpi-box">
                      <span className="tmp-kpi-label">Risultato Stimato</span>
                      <span className="tmp-kpi-value">
                        {prediction.puntiIncontroCasa} - {prediction.puntiIncontroOspite}
                      </span>
                      <span className="tmp-kpi-sub">
                        {prediction.puntiIncontroCasa > prediction.puntiIncontroOspite
                          ? `Vittoria ${match.squadraCasa}`
                          : prediction.puntiIncontroOspite > prediction.puntiIncontroCasa
                            ? `Vittoria ${match.squadraOspite}`
                            : 'Pareggio'}
                      </span>
                    </div>
                    <div className="tmp-kpi-box">
                      <span className="tmp-kpi-label">Set Vinti Stimati</span>
                      <span className="tmp-kpi-value">
                        {prediction.setStimatiCasa} : {prediction.setStimatiOspite}
                      </span>
                      <span className="tmp-kpi-sub">
                        Diff. {prediction.setStimatiCasa - prediction.setStimatiOspite > 0 ? '+' : ''}
                        {prediction.setStimatiCasa - prediction.setStimatiOspite} set
                      </span>
                    </div>
                    <div className="tmp-kpi-box">
                      <span className="tmp-kpi-label">Punti Totali Stimati</span>
                      <span className="tmp-kpi-value">
                        {prediction.puntiStimatiCasa} - {prediction.puntiStimatiOspite}
                      </span>
                      <span className="tmp-kpi-sub">
                        Diff. {prediction.puntiStimatiCasa - prediction.puntiStimatiOspite > 0 ? '+' : ''}
                        {prediction.puntiStimatiCasa - prediction.puntiStimatiOspite} pt
                      </span>
                    </div>
                  </div>

                  {/* Fattore chiave & Analisi tattica */}
                  <div className="tmp-analysis-box">
                    <div className="tmp-keyfactor-line">
                      <i className="bi bi-lightning-charge-fill text-warning"></i>
                      <span>
                        <strong>Fattore chiave:</strong> {prediction.keyFactor}
                      </span>
                    </div>
                    <div className="d-flex align-items-start gap-2 mt-2">
                      <Quote className="flex-shrink-0 mt-1" style={{ width: '14px', height: '14px', opacity: 0.7 }} />
                      <p className="fst-italic mb-0 small lh-base">{prediction.analysis}</p>
                    </div>
                  </div>

                  {/* Tabella Incontri Individuali Simulati */}
                  {prediction.incontriSimulati.length > 0 && (
                    <div className="tmp-sim-matches-block">
                      <div className="tmp-sim-matches-head">
                        <span>
                          <i className="bi bi-table me-1 text-primary"></i>
                          Simulazione Incontri Individuali ({prediction.incontriSimulati.length})
                        </span>
                        <span className="tmp-muted" style={{ fontSize: '11px' }}>
                          Clicca H2H per il testa a testa storico diretto
                        </span>
                      </div>
                      <div className="tmp-table-wrap">
                        <table className="tmp-sim-table">
                          <thead>
                            <tr>
                              <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                              <th>Casa</th>
                              <th>Ospite</th>
                              <th style={{ textAlign: 'center' }}>Set</th>
                              <th style={{ textAlign: 'center' }}>Punti</th>
                              <th style={{ textAlign: 'center' }}>Prob.</th>
                              <th style={{ width: '48px', textAlign: 'center' }}>H2H</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prediction.incontriSimulati.map((sim, idx) => {
                              const homeId = sim.atletaCasaId || findAthleteIdByName(sim.atletaCasa, homeEvaluated);
                              const awayId = sim.atletaOspiteId || findAthleteIdByName(sim.atletaOspite, awayEvaluated);
                              const canH2H = Boolean(homeId && awayId);
                              const probWinner =
                                sim.vincitore === 'casa' ? sim.probCasa : Math.max(1, 100 - sim.probCasa);

                              return (
                                <tr key={`${sim.numero}_${idx}`}>
                                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>
                                    {sim.numero}
                                  </td>
                                  <td>
                                    <div
                                      className={`tmp-sim-player ${sim.vincitore === 'casa' ? 'is-winner' : 'is-loser'} ${
                                        homeId && onOpenAtletaModal ? 'is-clickable' : ''
                                      }`}
                                      onClick={() => {
                                        if (homeId && onOpenAtletaModal) onOpenAtletaModal(homeId, sim.atletaCasa);
                                      }}
                                      title={sim.nota || sim.atletaCasa}
                                    >
                                      {sim.atletaCasa}
                                    </div>
                                    {sim.nota && <div className="tmp-sim-note">{sim.nota}</div>}
                                  </td>
                                  <td>
                                    <div
                                      className={`tmp-sim-player ${sim.vincitore === 'ospite' ? 'is-winner' : 'is-loser'} ${
                                        awayId && onOpenAtletaModal ? 'is-clickable' : ''
                                      }`}
                                      onClick={() => {
                                        if (awayId && onOpenAtletaModal) onOpenAtletaModal(awayId, sim.atletaOspite);
                                      }}
                                    >
                                      {sim.atletaOspite}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <span
                                      className={`tmp-set-pill ${
                                        sim.vincitore === 'casa' ? 'is-home-win' : 'is-away-win'
                                      }`}
                                    >
                                      {sim.setCasa} - {sim.setOspite}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '11.5px' }}>
                                    {sim.puntiCasa}-{sim.puntiOspite}
                                  </td>
                                  <td style={{ textAlign: 'center', fontSize: '11.5px', fontWeight: 600 }}>
                                    {probWinner}%
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {canH2H ? (
                                      <button
                                        type="button"
                                        className="tmp-h2h-mini-btn"
                                        title={`Testa a Testa: ${sim.atletaCasa} vs ${sim.atletaOspite}`}
                                        onClick={() =>
                                          setH2hPair({
                                            p1Id: homeId!,
                                            p1Name: sim.atletaCasa,
                                            p2Id: awayId!,
                                            p2Name: sim.atletaOspite,
                                          })
                                        }
                                      >
                                        <i className="bi bi-arrow-left-right"></i>
                                      </button>
                                    ) : (
                                      <span className="tmp-muted">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={3} style={{ fontWeight: 700, textAlign: 'right' }}>
                                Totali Stimati:
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 800 }}>
                                {prediction.setStimatiCasa}:{prediction.setStimatiOspite}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                {prediction.puntiStimatiCasa}-{prediction.puntiStimatiOspite}
                              </td>
                              <td colSpan={2} style={{ textAlign: 'center', fontWeight: 800 }}>
                                {prediction.puntiIncontroCasa}-{prediction.puntiIncontroOspite}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Valutazione Giocatore per Giocatore */}
          {!loadingRosters && (homeEvaluated.length > 0 || awayEvaluated.length > 0) && (
            <section className="tmp-section-card">
              <div className="tmp-section-head">
                <div className="tmp-section-title-wrap">
                  <span className="tmp-section-icon">
                    <Users style={{ width: '15px', height: '15px' }} />
                  </span>
                  <div>
                    <h4 className="tmp-section-title">Valutazione Giocatore per Giocatore</h4>
                    <p className="tmp-section-sub">
                      Seleziona i titolari (max 4 per squadra) e confronta ranking, set, punti e indice forma
                    </p>
                  </div>
                </div>
              </div>

              <div className="tmp-roster-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rosterViewTab === 'confronto'}
                  className={`tmp-roster-tab ${rosterViewTab === 'confronto' ? 'is-active' : ''}`}
                  onClick={() => setRosterViewTab('confronto')}
                >
                  Confronto Fasce ({fasciaComparisons.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rosterViewTab === 'casa'}
                  className={`tmp-roster-tab ${rosterViewTab === 'casa' ? 'is-active' : ''}`}
                  onClick={() => setRosterViewTab('casa')}
                >
                  {shortenName(match.squadraCasa)} ({homeEvaluated.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rosterViewTab === 'ospite'}
                  className={`tmp-roster-tab ${rosterViewTab === 'ospite' ? 'is-active' : ''}`}
                  onClick={() => setRosterViewTab('ospite')}
                >
                  {shortenName(match.squadraOspite)} ({awayEvaluated.length})
                </button>
              </div>

              {rosterViewTab === 'confronto' && (
                <>
                  <div className="tmp-table-wrap mb-3">
                    <table className="tmp-eval-table tmp-fascia-table">
                      <thead>
                        <tr>
                          <th style={{ width: '52px', textAlign: 'center' }}>Fascia</th>
                          <th>Titolare Casa ({match.squadraCasa})</th>
                          <th style={{ textAlign: 'center' }}>Val. / Pt</th>
                          <th style={{ textAlign: 'center', width: '50px' }}>H2H</th>
                          <th style={{ textAlign: 'center' }}>Val. / Pt</th>
                          <th style={{ textAlign: 'right' }}>Titolare Ospite ({match.squadraOspite})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fasciaComparisons.map((row) => {
                          const canH2H = Boolean(row.home?.atletaId && row.away?.atletaId);
                          return (
                            <tr key={row.fascia}>
                              <td style={{ textAlign: 'center' }}>
                                <span className="tmp-fascia-badge">#{row.fascia}</span>
                              </td>
                              <td>
                                {row.home ? (
                                  <div
                                    className={`tmp-player-cell ${row.home.atletaId && onOpenAtletaModal ? 'is-clickable' : ''}`}
                                    onClick={() => {
                                      if (row.home?.atletaId && onOpenAtletaModal) {
                                        onOpenAtletaModal(row.home.atletaId, row.home.nome);
                                      }
                                    }}
                                  >
                                    <AthleteAvatar atletaId={row.home.atletaId} nome={row.home.nome} size={26} />
                                    <div className="tmp-player-meta">
                                      <span className="tmp-player-name">{row.home.nome}</span>
                                      <span className="tmp-muted" style={{ fontSize: '10.5px' }}>
                                        {row.home.partiteVinte}V-{row.home.partitePerse}P ({row.home.percentualeVittorie}%) • Set{' '}
                                        {row.home.setVinti}:{row.home.setPersi}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="tmp-muted">-</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {row.home ? (
                                  <div className="tmp-fascia-score">
                                    <span className={`tmp-score-chip ${row.diffEval > 3 ? 'is-edge' : ''}`}>
                                      {row.home.evaluationScore}/100
                                    </span>
                                    <span className="tmp-muted" style={{ fontSize: '10.5px' }}>
                                      {row.home.rankPunti !== null ? `${row.home.rankPunti} pt` : 'N.C.'}
                                    </span>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {canH2H ? (
                                  <button
                                    type="button"
                                    className="tmp-h2h-mini-btn"
                                    title={`Testa a Testa: ${row.home!.nome} vs ${row.away!.nome}`}
                                    onClick={() =>
                                      setH2hPair({
                                        p1Id: row.home!.atletaId,
                                        p1Name: row.home!.nome,
                                        p2Id: row.away!.atletaId,
                                        p2Name: row.away!.nome,
                                      })
                                    }
                                  >
                                    <i className="bi bi-arrow-left-right"></i>
                                  </button>
                                ) : (
                                  <span className="tmp-muted">vs</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {row.away ? (
                                  <div className="tmp-fascia-score">
                                    <span className={`tmp-score-chip ${row.diffEval < -3 ? 'is-edge' : ''}`}>
                                      {row.away.evaluationScore}/100
                                    </span>
                                    <span className="tmp-muted" style={{ fontSize: '10.5px' }}>
                                      {row.away.rankPunti !== null ? `${row.away.rankPunti} pt` : 'N.C.'}
                                    </span>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td>
                                {row.away ? (
                                  <div
                                    className={`tmp-player-cell is-right ${
                                      row.away.atletaId && onOpenAtletaModal ? 'is-clickable' : ''
                                    }`}
                                    onClick={() => {
                                      if (row.away?.atletaId && onOpenAtletaModal) {
                                        onOpenAtletaModal(row.away.atletaId, row.away.nome);
                                      }
                                    }}
                                  >
                                    <div className="tmp-player-meta is-right">
                                      <span className="tmp-player-name">{row.away.nome}</span>
                                      <span className="tmp-muted" style={{ fontSize: '10.5px' }}>
                                        {row.away.partiteVinte}V-{row.away.partitePerse}P ({row.away.percentualeVittorie}%) • Set{' '}
                                        {row.away.setVinti}:{row.away.setPersi}
                                      </span>
                                    </div>
                                    <AthleteAvatar atletaId={row.away.atletaId} nome={row.away.nome} size={26} />
                                  </div>
                                ) : (
                                  <span className="tmp-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="tmp-roster-hint">
                    <i className="bi bi-info-circle me-1"></i>
                    Passa alle schede <strong>{shortenName(match.squadraCasa)}</strong> o{' '}
                    <strong>{shortenName(match.squadraOspite)}</strong> per modificare i titolari e vedere l&apos;intero
                    roster.
                  </div>
                </>
              )}

              {rosterViewTab === 'casa' && renderRosterTable(homeEvaluated, 'home', selectedHomeKeys)}
              {rosterViewTab === 'ospite' && renderRosterTable(awayEvaluated, 'away', selectedAwayKeys)}
            </section>
          )}

          {/* Confronto Squadre, Statistiche & Precedenti */}
          <section className="tmp-section-card">
            <button
              type="button"
              className="tmp-accordion-btn"
              onClick={() => setShowTeamComparison((v) => !v)}
              aria-expanded={showTeamComparison}
            >
              <div className="tmp-section-title-wrap">
                <span className="tmp-section-icon">
                  <BarChart3 style={{ width: '15px', height: '15px' }} />
                </span>
                <div>
                  <h4 className="tmp-section-title">Confronto Squadre &amp; Precedenti</h4>
                  <p className="tmp-section-sub">
                    Classifica, set, punti totali, media ranking titolari e gara di andata
                  </p>
                </div>
              </div>
              <i className={`bi bi-chevron-${showTeamComparison ? 'up' : 'down'}`} />
            </button>

            {showTeamComparison && (
              <div className="tmp-cmp-body">
                {directPrecedent && (
                  <div className="tmp-precedent-banner">
                    <div className="tmp-precedent-kicker">
                      <Trophy style={{ width: '13px', height: '13px' }} />
                      <span>
                        Precedente in Campionato ({directPrecedent.tipo === 'andata' ? 'Andata' : 'Ritorno'} •{' '}
                        {directPrecedent.giornata}ª Giornata, {directPrecedent.data})
                      </span>
                    </div>
                    <div className="tmp-precedent-score-line">
                      <span>{directPrecedent.squadraCasa}</span>
                      <span className="tmp-precedent-pill">{directPrecedent.risultato}</span>
                      <span>{directPrecedent.squadraOspite}</span>
                    </div>
                  </div>
                )}

                <div className="tmp-cmp-grid">
                  {[
                    {
                      label: 'Posizione Classifica',
                      home: homeStanding ? `#${homeStanding.posizione}` : 'N/D',
                      away: awayStanding ? `#${awayStanding.posizione}` : 'N/D',
                      edge:
                        homeStanding && awayStanding
                          ? homeStanding.posizione < awayStanding.posizione
                            ? 'home'
                            : awayStanding.posizione < homeStanding.posizione
                              ? 'away'
                              : null
                          : null,
                    },
                    {
                      label: 'Punti Classifica',
                      home: homeStanding ? `${homeStanding.punti} pt` : 'N/D',
                      away: awayStanding ? `${awayStanding.punti} pt` : 'N/D',
                      edge:
                        homeStanding && awayStanding
                          ? homeStanding.punti > awayStanding.punti
                            ? 'home'
                            : awayStanding.punti > homeStanding.punti
                              ? 'away'
                              : null
                          : null,
                    },
                    {
                      label: 'Incontri (V-N-P)',
                      home: homeStanding
                        ? `${homeStanding.incontriVinti}-${homeStanding.incontriPareggiati}-${homeStanding.incontriPersi}`
                        : 'N/D',
                      away: awayStanding
                        ? `${awayStanding.incontriVinti}-${awayStanding.incontriPareggiati}-${awayStanding.incontriPersi}`
                        : 'N/D',
                      edge: null,
                    },
                    {
                      label: 'Partite Individuali (V/P)',
                      home: homeStanding ? `${homeStanding.partiteVinte} / ${homeStanding.partitePerse}` : 'N/D',
                      away: awayStanding ? `${awayStanding.partiteVinte} / ${awayStanding.partitePerse}` : 'N/D',
                      edge:
                        homeStanding && awayStanding
                          ? homeStanding.diffPartite > awayStanding.diffPartite
                            ? 'home'
                            : awayStanding.diffPartite > homeStanding.diffPartite
                              ? 'away'
                              : null
                          : null,
                    },
                    {
                      label: 'Set Totali (V:P)',
                      home: homeStanding ? `${homeStanding.setVinti}:${homeStanding.setPersi}` : 'N/D',
                      away: awayStanding ? `${awayStanding.setVinti}:${awayStanding.setPersi}` : 'N/D',
                      edge:
                        homeStanding && awayStanding
                          ? homeStanding.diffSet > awayStanding.diffSet
                            ? 'home'
                            : awayStanding.diffSet > homeStanding.diffSet
                              ? 'away'
                              : null
                          : null,
                    },
                    {
                      label: 'Media Valutazione Titolari',
                      home: homeAvgEval ? `${homeAvgEval}/100` : 'N/D',
                      away: awayAvgEval ? `${awayAvgEval}/100` : 'N/D',
                      edge:
                        homeAvgEval && awayAvgEval
                          ? homeAvgEval > awayAvgEval
                            ? 'home'
                            : awayAvgEval > homeAvgEval
                              ? 'away'
                              : null
                          : null,
                    },
                    {
                      label: 'Media Punti FITeT Titolari',
                      home: homeAvgRankPts !== null ? `${homeAvgRankPts.toLocaleString('it-IT')} pt` : 'N/D',
                      away: awayAvgRankPts !== null ? `${awayAvgRankPts.toLocaleString('it-IT')} pt` : 'N/D',
                      edge:
                        homeAvgRankPts !== null && awayAvgRankPts !== null
                          ? homeAvgRankPts > awayAvgRankPts
                            ? 'home'
                            : awayAvgRankPts > homeAvgRankPts
                              ? 'away'
                              : null
                          : null,
                    },
                  ].map((item) => (
                    <div key={item.label} className="tmp-cmp-row">
                      <span className={`tmp-cmp-val is-home ${item.edge === 'home' ? 'is-better' : ''}`}>
                        {item.home}
                      </span>
                      <span className="tmp-cmp-label">{item.label}</span>
                      <span className={`tmp-cmp-val is-away ${item.edge === 'away' ? 'is-better' : ''}`}>
                        {item.away}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Submodal Testa a Testa diretto tra due giocatori */}
        {h2hPair && (
          <HeadToHeadModal
            isOpen={true}
            atleta1Id={h2hPair.p1Id}
            atleta1Nome={h2hPair.p1Name}
            atleta2Id={h2hPair.p2Id}
            atleta2Nome={h2hPair.p2Name}
            onClose={() => setH2hPair(null)}
            onSelectAthlete={onOpenAtletaModal}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

