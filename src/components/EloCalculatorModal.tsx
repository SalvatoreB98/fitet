import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AthleteSearchResult, CampionatoAttualeInfo } from '../types/fitet';
import { fetchAtleta, searchAtletiScelta } from '../services/api';
import { getMyPlayerId, getMyPlayerName, getMyProfileSnapshot } from '../utils/myProfile';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { AthleteAvatar } from './AthleteAvatar';
import {
  SERIE_CAMPIONATO,
  SERIE_SETTORI_ORDER,
  MATCH_EVENT_OPTIONS,
  PLACEMENT_BRACKETS,
  PlacementBracketKey,
  TournamentBonusType,
  TournamentCategoryLevel,
  calculateSingleMatchElo,
  calculateBonusAndMalus,
  applySafeguardRating,
  detectAthleteGender,
  detectAthleteSerieCampionato,
  extractAthleteCurrentPoints,
} from '../utils/eloCalculator';
import './HeadToHeadPickerModal.css';
import './EloCalculatorModal.css';

interface EloCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SimulatedMatchItem {
  id: string;
  opponentName: string;
  opponentId?: string;
  opponentGender: 'M' | 'F';
  ratingB: string;
  isWin: boolean;
  isMixedGender: boolean;
  femalePlayer: 'A' | 'B';
}

interface MinimalPlayerSearchProps {
  placeholder: string;
  selectedName: string;
  excludeId?: string;
  onSelect: (item: AthleteSearchResult) => void;
  onClear: () => void;
}

const MinimalPlayerSearch: React.FC<MinimalPlayerSearchProps> = ({
  placeholder,
  selectedName,
  excludeId,
  onSelect,
  onClear,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await searchAtletiScelta(term, excludeId);
        setResults(res.slice(0, 10));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query, excludeId]);

  if (selectedName) {
    return (
      <div className="h2h-picker-search" style={{ marginTop: 0 }}>
        <input
          type="text"
          className="h2h-picker-input"
          value={selectedName}
          readOnly
          style={{ paddingLeft: '12px', fontWeight: 600 }}
        />
        <button
          type="button"
          className="h2h-picker-clear"
          onClick={onClear}
          title="Rimuovi atleta"
          aria-label="Rimuovi atleta"
        >
          <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div className="h2h-picker-search" style={{ marginTop: 0 }}>
        <i className="bi bi-search h2h-picker-search-icon" aria-hidden="true"></i>
        <input
          type="search"
          className="h2h-picker-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {loading ? (
          <span className="h2h-picker-inline-spinner">
            <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
          </span>
        ) : (
          query && (
            <button
              type="button"
              className="h2h-picker-clear"
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
              aria-label="Cancella"
            >
              <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
            </button>
          )
        )}
      </div>

      {results.length > 0 && (
        <div
          className="h2h-picker-results-wrap"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: 0,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
          }}
        >
          <div className="h2h-picker-results">
            {results.map((athlete) => (
              <button
                key={athlete.id}
                type="button"
                className="h2h-picker-result"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  onSelect(athlete);
                }}
              >
                <AthleteAvatar atletaId={athlete.id} nome={athlete.value} size={28} />
                <span className="h2h-picker-result-copy">
                  <span className="h2h-picker-result-name">{athlete.value}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const EloCalculatorModal: React.FC<EloCalculatorModalProps> = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  // Atleta A (inizializzato subito col proprio atleta salvato se presente)
  const [playerAId, setPlayerAId] = useState<string | undefined>(() => getMyPlayerId() || undefined);
  const [playerAName, setPlayerAName] = useState<string>(() => {
    const id = getMyPlayerId();
    const snap = getMyProfileSnapshot(id);
    return snap?.name || getMyPlayerName() || '';
  });
  const [playerAGender, setPlayerAGender] = useState<'M' | 'F'>('M');
  const [ratingAInput, setRatingAInput] = useState<string>(() => {
    const id = getMyPlayerId();
    const snap = getMyProfileSnapshot(id);
    return snap?.punti && snap.punti > 0 ? String(Math.round(snap.punti)) : '5000';
  });

  // Serie Campionato o Tipologia Manifestazione
  const [eventKey, setEventKey] = useState<string>(() => {
    const id = getMyPlayerId();
    const snap = getMyProfileSnapshot(id);
    if (snap?.campionatiGiocati && snap.campionatiGiocati.length > 0) {
      const detected = detectAthleteSerieCampionato(null, snap.campionatiGiocati);
      if (detected) return detected;
    }
    return 'D1_M';
  });

  // Partite
  const [matches, setMatches] = useState<SimulatedMatchItem[]>([
    {
      id: 'm-1',
      opponentName: '',
      opponentGender: 'M',
      ratingB: '5000',
      isWin: true,
      isMixedGender: false,
      femalePlayer: 'B',
    },
  ]);
  const counterRef = useRef(1);

  // Bonus / Malus opzionali
  const [showBonus, setShowBonus] = useState<boolean>(false);
  const [tournamentType, setTournamentType] = useState<TournamentBonusType>('none');
  const [categoryLevel, setCategoryLevel] = useState<TournamentCategoryLevel>(4);
  const [placement, setPlacement] = useState<PlacementBracketKey>('none');
  const [weightFactor, setWeightFactor] = useState<number>(1.0);
  const [forfeitsCount, setForfeitsCount] = useState<number>(0);

  const loadPlayerA = useCallback(
    async (
      id: string,
      name: string,
      fallbackPts?: number | null,
      fallbackCampionati?: CampionatoAttualeInfo[] | null
    ) => {
      setPlayerAId(id);
      if (name) setPlayerAName(name);
      if (fallbackPts && fallbackPts > 0) {
        setRatingAInput(String(Math.round(fallbackPts)));
      }
      if (fallbackCampionati && fallbackCampionati.length > 0) {
        const earlySerie = detectAthleteSerieCampionato(null, fallbackCampionati);
        if (earlySerie) setEventKey(earlySerie);
      }
      try {
        const detail = await fetchAtleta(id);
        if (detail?.anagrafica?.nome) {
          setPlayerAName(detail.anagrafica.nome);
        }
        const pts = extractAthleteCurrentPoints(detail);
        if (pts > 0) setRatingAInput(String(pts));
        const gender = detectAthleteGender(detail) || 'M';
        setPlayerAGender(gender);

        // Auto-rilevamento della serie dal profilo dell'atleta
        const detectedSerie = detectAthleteSerieCampionato(detail, fallbackCampionati);
        if (detectedSerie) {
          setEventKey(detectedSerie);
        }

        setMatches((prev) =>
          prev.map((m) =>
            m.opponentId
              ? {
                  ...m,
                  isMixedGender: gender !== m.opponentGender,
                  femalePlayer: gender === 'F' ? 'A' : 'B',
                }
              : m
          )
        );
      } catch {
        // ignore
      }
    },
    []
  );

  // All'apertura della modale, auto-seleziona l'atleta salvato nel profilo (Atleta A)
  useEffect(() => {
    if (!isOpen) return;
    const myId = getMyPlayerId();
    if (!myId) return;
    const snap = getMyProfileSnapshot(myId);
    const myName = snap?.name || getMyPlayerName() || `Atleta #${myId}`;
    void loadPlayerA(myId, myName, snap?.punti, snap?.campionatiGiocati);
  }, [isOpen, loadPlayerA]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSelectOpponent = async (matchId: string, item: AthleteSearchResult) => {
    const name = item.value || item.label;
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, opponentId: item.id, opponentName: name } : m))
    );
    try {
      const detail = await fetchAtleta(item.id);
      const pts = extractAthleteCurrentPoints(detail);
      const oppGender = detectAthleteGender(detail) || 'M';
      const isMixed = playerAGender !== oppGender;
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? {
              ...m,
              ratingB: pts > 0 ? String(pts) : m.ratingB,
              opponentGender: oppGender,
              isMixedGender: isMixed,
              femalePlayer: playerAGender === 'F' ? 'A' : 'B',
            }
            : m
        )
      );
    } catch {
      // ignore
    }
  };

  const updateMatch = (id: string, patch: Partial<SimulatedMatchItem>) => {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const addMatch = () => {
    counterRef.current += 1;
    setMatches((prev) => [
      ...prev,
      {
        id: `m-${counterRef.current}`,
        opponentName: '',
        opponentGender: 'M',
        ratingB: prev[prev.length - 1]?.ratingB || ratingAInput || '5000',
        isWin: true,
        isMixedGender: false,
        femalePlayer: playerAGender === 'F' ? 'A' : 'B',
      },
    ]);
  };

  const numericRatingA = Math.max(0, Number(ratingAInput) || 0);

  const matchResults = useMemo(() => {
    return matches.map((m) => ({
      match: m,
      calc: calculateSingleMatchElo({
        ratingA: numericRatingA,
        ratingB: Math.max(0, Number(m.ratingB) || 0),
        isWin: m.isWin,
        eventKey,
        isMixedGender: m.isMixedGender,
        femalePlayer: m.femalePlayer,
      }),
    }));
  }, [matches, numericRatingA, eventKey]);

  const matchesDelta = useMemo(
    () => matchResults.reduce((sum, r) => sum + r.calc.effectiveDelta, 0),
    [matchResults]
  );

  // Scomposizione Punti Base + Bonus Inatteso per partite di campionato
  const championshipSummary = useMemo(() => {
    const first = matchResults[0]?.calc;
    if (!first?.isChampionshipSerie) return null;
    const totalBase = matchResults.reduce((sum, r) => sum + r.calc.puntiBaseCampionato, 0);
    const totalBonus = matchResults.reduce((sum, r) => sum + r.calc.bonusInattesoCampionato, 0);
    return {
      totalBase,
      totalBonus,
      totalMatches: matchesDelta,
    };
  }, [matchResults, matchesDelta]);

  const bonusResult = useMemo(
    () =>
      calculateBonusAndMalus({
        tournamentType,
        categoryLevel,
        placement,
        weightFactor,
        forfeitsCount,
      }),
    [tournamentType, categoryLevel, placement, weightFactor, forfeitsCount]
  );

  const totalDelta = matchesDelta + bonusResult.netBonusMalus;
  const finalRating = useMemo(
    () => applySafeguardRating(numericRatingA, totalDelta),
    [numericRatingA, totalDelta]
  );

  const fmtSigned = (n: number) => (n > 0 ? `+${n.toLocaleString('it-IT')}` : n.toLocaleString('it-IT'));

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-backdrop-simple modal-h2h-backdrop h2h-picker-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="elo-calc-title"
    >
      <div
        className="modal-card-simple h2h-picker-card elo-minimal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header semplice */}
        <div className="modal-header-simple h2h-picker-header">
          <div className="h2h-picker-header-main">
            <div className="modal-header-icon-box is-white" aria-hidden="true">
              <i className="bi bi-calculator"></i>
            </div>
            <div className="h2h-picker-header-copy">
              <h3 id="elo-calc-title" className="modal-header-title-serif">
                Calcolatore Punti
              </h3>
              <div className="modal-header-subtext">Simulazione classifica FITeT</div>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        {/* Corpo minimale */}
        <div className="h2h-picker-body elo-minimal-body">
          {/* 1. Risultato in tempo reale */}
          <div className="elo-result-bar">
            <div className="elo-result-main">
              <span className="elo-result-label">Nuovo Rating Stimato</span>
              <span className="elo-result-rating">
                {finalRating.finalRating.toLocaleString('it-IT')} pt
              </span>
              {championshipSummary ? (
                <span className="elo-result-sub">
                  {/* Base ({championshipSummary.totalBase} pt) + Bonus Inatteso (+
                  {championshipSummary.totalBonus} pt) = Totale (
                  {fmtSigned(championshipSummary.totalMatches)} pt)
                  {bonusResult.netBonusMalus !== 0 &&
                    ` • Bonus/Malus: ${fmtSigned(bonusResult.netBonusMalus)}`} */}
                </span>
              ) : (
                (bonusResult.netBonusMalus !== 0 ||
                  matches.length > 1 ||
                  finalRating.safeguardApplied) && (
                  <span className="elo-result-sub">
                    Partite: {fmtSigned(matchesDelta)}
                    {bonusResult.netBonusMalus !== 0 &&
                      ` • Bonus/Malus: ${fmtSigned(bonusResult.netBonusMalus)}`}
                    {finalRating.safeguardApplied && ' • Min 100 pt'}
                  </span>
                )
              )}
            </div>

            <span
              className={`elo-delta-tag ${totalDelta > 0 ? 'is-pos' : totalDelta < 0 ? 'is-neg' : 'is-zero'
                }`}
            >
              {fmtSigned(totalDelta)} pt
            </span>
          </div>

          {/* 2. Atleta A (prima della Select per auto-selezionare la serie) */}
          <div className="h2h-picker-slot is-p1">
            <div className="h2h-picker-slot-head" style={{ marginBottom: '6px' }}>
              <span className="h2h-picker-slot-label">
                <span className="h2h-picker-slot-dot" aria-hidden="true"></span>
                Atleta A (Tuo Punteggio)
              </span>
            </div>

            <div className="elo-compact-row">
              <div className="elo-pts-input-wrap">
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="elo-pts-input"
                  value={ratingAInput}
                  onChange={(e) => setRatingAInput(e.target.value)}
                  aria-label="Punti Atleta A"
                />
                <span className="elo-pts-unit">pt</span>
              </div>

              <MinimalPlayerSearch
                placeholder="Oppure cerca atleta..."
                selectedName={playerAName}
                onSelect={(item) => loadPlayerA(item.id, item.value || item.label)}
                onClear={() => {
                  setPlayerAId(undefined);
                  setPlayerAName('');
                }}
              />
            </div>
          </div>

          {/* 3. Select Serie Campionato (raggruppata per settore) */}
          <div>
            <span className="h2h-picker-slot-label" style={{ marginBottom: '6px', display: 'block' }}>
              Serie Campionato
            </span>
            <select
              className="elo-select"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
            >
              {SERIE_SETTORI_ORDER.map((settore) => {
                const items = SERIE_CAMPIONATO.filter((s) => s.settore === settore);
                return (
                  <optgroup key={settore} label={`Campionato — ${settore}`}>
                    {items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.puntiBase} pt base)
                      </option>
                    ))}
                  </optgroup>
                );
              })}

            </select>
          </div>

          {/* 4. Avversari / Partite */}
          {matchResults.map(({ match, calc }, idx) => (
            <div key={match.id} className="h2h-picker-slot is-p2">
              <div className="h2h-picker-slot-head" style={{ marginBottom: '6px' }}>
                <span className="h2h-picker-slot-label">
                  <span className="h2h-picker-slot-dot" aria-hidden="true"></span>
                  {matches.length > 1 ? `Avversario #${idx + 1}` : 'Atleta B (Avversario)'}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      color: calc.effectiveDelta >= 0 ? '#16a34a' : '#dc2626',
                    }}
                  >
                  </span>
                  {matches.length > 1 && (
                    <button
                      type="button"
                      className="h2h-picker-change"
                      onClick={() => setMatches((prev) => prev.filter((m) => m.id !== match.id))}
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
              </div>

              <div className="elo-compact-row">
                <div className="elo-pts-input-wrap">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    className="elo-pts-input"
                    value={match.ratingB}
                    onChange={(e) => updateMatch(match.id, { ratingB: e.target.value })}
                    aria-label="Punti Avversario"
                  />
                  <span className="elo-pts-unit">pt</span>
                </div>

                <MinimalPlayerSearch
                  placeholder="Oppure cerca avversario..."
                  selectedName={match.opponentName}
                  excludeId={playerAId}
                  onSelect={(item) => handleSelectOpponent(match.id, item)}
                  onClear={() =>
                    updateMatch(match.id, { opponentId: undefined, opponentName: '' })
                  }
                />
              </div>

              {/* Esito Vittoria / Sconfitta */}
              <div className="elo-vs-actions">
                <button
                  type="button"
                  className={`elo-vs-btn ${match.isWin ? 'is-win' : ''}`}
                  onClick={() => updateMatch(match.id, { isWin: true })}
                >
                  Vittoria
                </button>
                <button
                  type="button"
                  className={`elo-vs-btn ${!match.isWin ? 'is-loss' : ''}`}
                  onClick={() => updateMatch(match.id, { isWin: false })}
                >
                  Sconfitta
                </button>
              </div>

              {/* Checkbox sesso diverso */}
              <div className="elo-mixed-inline">
                <label className="elo-mixed-check">
                  <input
                    type="checkbox"
                    checked={match.isMixedGender}
                    onChange={(e) =>
                      updateMatch(match.id, { isMixedGender: e.target.checked })
                    }
                  />
                  <span>Incontro tra sessi diversi</span>
                </label>

                {match.isMixedGender && (
                  <select
                    className="elo-select"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                    value={match.femalePlayer}
                    onChange={(e) =>
                      updateMatch(match.id, { femalePlayer: e.target.value as 'A' | 'B' })
                    }
                  >
                    <option value="B">Donna: Avversario</option>
                    <option value="A">Donna: Atleta A</option>
                  </select>
                )}
              </div>
            </div>
          ))}

          {/* Azioni secondarie: Aggiungi partita + Bonus/Malus */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <button type="button" className="h2h-picker-btn is-secondary" onClick={addMatch}>
              <i className="bi bi-plus-lg"></i> Aggiungi partita
            </button>

            <button
              type="button"
              className="h2h-picker-btn is-secondary"
              onClick={() => setShowBonus((v) => !v)}
            >
              {showBonus ? 'Nascondi Bonus/Malus' : 'Bonus Piazzamento / Malus'}
            </button>
          </div>

          {/* 5. Sezione opzionale Bonus Piazzamento / Malus */}
          {showBonus && (
            <div className="h2h-picker-slot">
              <span className="h2h-picker-slot-label">Bonus Piazzamento &amp; Malus</span>

              <div className="elo-bonus-grid-minimal">
                <select
                  className="elo-select"
                  value={tournamentType}
                  onChange={(e) => {
                    const next = e.target.value as TournamentBonusType;
                    setTournamentType(next);
                    if (next === 'nazionale_open' && categoryLevel < 4) setCategoryLevel(4);
                    if (next !== 'none' && placement === 'none') setPlacement('1');
                  }}
                >
                  <option value="none">Nessun bonus</option>
                  <option value="nazionale_categoria">Torneo Nazionale Categoria</option>
                  <option value="campionati_italiani">Campionati Italiani Cat.</option>
                  <option value="nazionale_open">Torneo Nazionale Open (4ª-6ª)</option>
                </select>

                {tournamentType !== 'none' && (
                  <>
                    <select
                      className="elo-select"
                      value={categoryLevel}
                      onChange={(e) =>
                        setCategoryLevel(Number(e.target.value) as TournamentCategoryLevel)
                      }
                    >
                      {tournamentType !== 'nazionale_open' && (
                        <>
                          <option value={1}>Assoluti / 1ª Cat.</option>
                          <option value={2}>2ª Categoria</option>
                          <option value={3}>3ª Categoria</option>
                        </>
                      )}
                      <option value={4}>4ª Categoria</option>
                      <option value={5}>5ª Categoria</option>
                      <option value={6}>6ª Categoria</option>
                    </select>

                    <select
                      className="elo-select"
                      value={placement}
                      onChange={(e) => setPlacement(e.target.value as PlacementBracketKey)}
                    >
                      {PLACEMENT_BRACKETS.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>

                    {tournamentType === 'nazionale_categoria' && (
                      <select
                        className="elo-select"
                        value={weightFactor}
                        onChange={(e) => setWeightFactor(Number(e.target.value))}
                      >
                        {[1.0, 0.9, 0.8, 0.75, 0.7, 0.6, 0.5].map((w) => (
                          <option key={w} value={w}>
                            Peso gara: {w}×
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}

                <select
                  className="elo-select"
                  value={forfeitsCount}
                  onChange={(e) => setForfeitsCount(Number(e.target.value))}
                >
                  <option value={0}>Rinunce / Espulsioni: 0</option>
                  <option value={1}>1 Rinuncia (-80 pt)</option>
                  <option value={2}>2 Rinunce (-160 pt)</option>
                  <option value={3}>3 Rinunce (-240 pt)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EloCalculatorModal;
