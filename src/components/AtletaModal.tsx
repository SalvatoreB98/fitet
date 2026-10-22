import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite } from '../services/api';
import { RatingChart } from './RatingChart';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { MarqueeText } from './MarqueeText';
import { recordAndGetAthleteViews } from '../utils/athleteViews';

interface AtletaModalProps {
  atletaId: string;
  athleteName?: string;
  returnLabel?: string;
  camId?: string | null;
  campionatoNome?: string | null;
  onClose: () => void;
  onSelectAthlete?: (id: string, name: string) => void;
}

export const AtletaModal: React.FC<AtletaModalProps> = ({
  atletaId,
  athleteName,
  returnLabel,
  camId,
  campionatoNome,
  onClose,
  onSelectAthlete,
}) => {
  useBodyScrollLock(true);

  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const lastTrackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = (atletaId || athleteName || '').toLowerCase().trim();
    if (!key) return;

    if (lastTrackedKeyRef.current === key) return;
    lastTrackedKeyRef.current = key;

    const v = recordAndGetAthleteViews(key, (serverViews) => {
      setViewsCount(serverViews);
    });
    setViewsCount(v);
  }, [atletaId, athleteName]);

  // Partite nel campionato attualmente aperto
  const [campionatoPartite, setCampionatoPartite] = useState<PartitaCampionatoAtleta[] | null>(null);
  const [squadraCampionato, setSquadraCampionato] = useState<string | null>(null);
  const [loadingPartite, setLoadingPartite] = useState<boolean>(false);

  // Tab per la selezione del tipo di partite: girone corrente vs tutte le partite ufficiali ranking FITeT
  const [matchTab, setMatchTab] = useState<'girone' | 'ranking'>('girone');
  const [rankingFilter, setRankingFilter] = useState<'tutti' | 'campionato' | 'tornei'>('tutti');
  const [viewMode, setViewMode] = useState<'slider' | 'list'>('slider');

  // Slider navigation
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  const handleSliderScroll = () => {
    if (!sliderRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  const scrollSlider = (direction: 'prev' | 'next') => {
    if (!sliderRef.current) return;
    const cardWidth = sliderRef.current.firstElementChild?.clientWidth || 300;
    const scrollDelta = (cardWidth + 12) * (direction === 'next' ? 1 : -1);
    sliderRef.current.scrollBy({ left: scrollDelta, behavior: 'smooth' });
  };

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.scrollLeft = 0;
      setCanScrollLeft(false);
      setCanScrollRight(sliderRef.current.scrollWidth > sliderRef.current.clientWidth + 10);
    }
  }, [matchTab, rankingFilter, campionatoPartite, viewMode]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchAtleta(atletaId)
      .then((data) => {
        if (isMounted) {
          setAtleta(data);
          setLoading(false);

          // Se non c'è un campionato attivo aperto, mostra direttamente il tab del ranking
          if (!camId) {
            setMatchTab('ranking');
          }

          // Se camId è presente e non abbiamo ancora provato con il nome anagrafico risolto
          if (camId) {
            setLoadingPartite(true);
            fetchAtletaCampionatoPartite(atletaId, camId, undefined, athleteName || data.anagrafica.nome)
              .then((res) => {
                if (isMounted) {
                  const matches = res.matches || [];
                  setCampionatoPartite(matches);
                  setSquadraCampionato(res.squadra || null);
                  setLoadingPartite(false);

                  // Se non ci sono partite in questo girone ma ci sono partite di ranking, passa a ranking
                  if (matches.length === 0 && (data.partiteRanking?.campionato.length || data.partiteRanking?.tornei.length)) {
                    setMatchTab('ranking');
                  } else {
                    setMatchTab('girone');
                  }
                }
              })
              .catch(() => {
                if (isMounted) {
                  setCampionatoPartite([]);
                  setLoadingPartite(false);
                  setMatchTab('ranking');
                }
              });
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Impossibile caricare i dati atleta');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [atletaId, camId, athleteName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop-simple modal-athlete-backdrop" onClick={onClose}>
      <div className="modal-card-simple" onClick={(e) => e.stopPropagation()}>
        {/* Simple Blue Header */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Scheda Ranking FITeT — {atleta?.anagrafica?.nome || athleteName || 'Atleta'}
              </h3>
              <div style={{ fontSize: '11px', color: '#bfdbfe', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : 'In risoluzione...')} • Classifica Unica Nazionale
              </div>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn-red"
            onClick={onClose}
            title="Chiudi finestra (ESC)"
            aria-label="Chiudi finestra"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple">
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Caricamento dati dal portale FITeT in corso...
              </div>
              <div style={{ fontSize: '12px' }}>Lettura anagrafica e storico punti</div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#fee2e2',
                color: '#b91c1c',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              <strong>Errore:</strong> {error}
            </div>
          )}

          {atleta && !loading && (
            <div>
              {/* Profile Bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  paddingBottom: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: '74px',
                    height: '74px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: 'var(--bg-th)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {!imgError && atleta.anagrafica.fotoUrl ? (
                    <img
                      src={atleta.anagrafica.fotoUrl}
                      alt={atleta.anagrafica.nome}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-muted)' }}>
                      {atleta.anagrafica.nome.slice(0, 2)}
                    </span>
                  )}
                </div>

                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-dark)', fontFamily: 'var(--font-serif)' }}>
                    {atleta.anagrafica.nome}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <strong>Società:</strong> {atleta.anagrafica.societa || 'N.D.'} {atleta.anagrafica.regione && `(${atleta.anagrafica.regione})`}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span className="badge pct-high">Cat: {atleta.anagrafica.categoria || 'N.D.'}</span>
                    <span className="badge pct-mid">Stato: {atleta.anagrafica.stato || 'Attivo'}</span>
                    {atleta.anagrafica.settore && (
                      <span className="badge pct-zero">{atleta.anagrafica.settore}</span>
                    )}
                    {atleta.anagrafica.dataNascita && (
                      <span className="badge pct-zero">Nascita: {atleta.anagrafica.dataNascita}</span>
                    )}
                    {viewsCount > 0 && (
                      <span
                        className="athlete-yt-views"
                        title={`${viewsCount.toLocaleString('it-IT')} ${viewsCount === 1 ? 'visualizzazione' : 'visualizzazioni'} reali del profilo`}
                      >
                        <i className="bi bi-eye" style={{ fontSize: '12px' }}></i>
                        {viewsCount.toLocaleString('it-IT')}{' '}
                        {viewsCount === 1 ? 'visualizzazione' : 'visualizzazioni'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overview Stats (Broadcast Sports Style) */}
              {(() => {
                const storico = atleta.storicoClassifica || [];
                const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

                // Points calculation
                let pts = atleta.anagrafica.punti;
                if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                  pts = ultimoSnapshot.punti;
                }
                let initPts = atleta.riepilogo.puntiIniziali;
                if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                  initPts = Math.round(initPts * 1000);
                }

                // Position calculation
                const pos = ultimoSnapshot?.posizione ?? null;
                const stato = atleta.anagrafica.stato;
                const record = atleta.anagrafica.recordClassifica;
                const hasRecord = record && !record.includes('n. il') && record.trim().length > 0;
                const dataAgg = ultimoSnapshot?.data
                  ? (ultimoSnapshot.data.includes('-')
                    ? ultimoSnapshot.data.split('-').reverse().join('/')
                    : ultimoSnapshot.data)
                  : null;

                const posText = pos ? `#${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro');
                const posSub = hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Nazionale');

                return (
                  <div className="overview-stats-section">
                    <div className="overview-stats-card">
                      <div className="overview-stats-row">
                        {/* 1. Posizione */}
                        <div className="overview-stat-col" title={`Posizione attuale: ${posText} (${posSub})`}>
                          <span className="overview-stat-label">Posizione</span>
                          <MarqueeText className="overview-stat-value" text={posText} />
                          <MarqueeText className="overview-stat-sub" text={posSub} />
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 2. Punti Rank */}
                        <div className="overview-stat-col" title={`Punti attuali: ${pts} pt (Iniziali: ${initPts} pt)`}>
                          <span className="overview-stat-label">Punti Rank</span>
                          <MarqueeText className="overview-stat-value" text={pts.toLocaleString('it-IT')} />
                          <MarqueeText className="overview-stat-sub" text={`Iniziali: ${initPts.toLocaleString('it-IT')}`} />
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 3. Partite V/G */}
                        <div className="overview-stat-col" title={`Partite vinte: ${atleta.riepilogo.partiteVinte}, giocate: ${atleta.riepilogo.partiteGiocate}, perse: ${atleta.riepilogo.partitePerse}`}>
                          <span className="overview-stat-label">Partite V/G</span>
                          <MarqueeText className="overview-stat-value">
                            {atleta.riepilogo.partiteVinte} <span className="overview-stat-slash">/</span> {atleta.riepilogo.partiteGiocate}
                          </MarqueeText>
                          <MarqueeText className="overview-stat-sub" text={`Perse: ${atleta.riepilogo.partitePerse}`} />
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 4. % Vittorie */}
                        <div className="overview-stat-col" title={`% Vittorie: ${atleta.riepilogo.percentualePositiva}%, Guadagno netto: ${atleta.riepilogo.puntiTotali} pt`}>
                          <span className="overview-stat-label">% Vittorie</span>
                          <MarqueeText className="overview-stat-value" text={`${atleta.riepilogo.percentualePositiva}%`} />
                          <MarqueeText
                            className="overview-stat-sub"
                            text={atleta.riepilogo.puntiTotali > 0 ? `+${atleta.riepilogo.puntiTotali} pt netti` : `${atleta.riepilogo.puntiTotali} pt`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Sezione Partite: Girone Attivo / Incontri Ufficiali Ranking FITeT */}
              {(() => {
                const parseDateIT = (str: string): number => {
                  if (!str) return 0;
                  const parts = str.split('/');
                  if (parts.length === 3) {
                    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
                  }
                  return 0;
                };

                const rankingCampionato = atleta.partiteRanking?.campionato || [];
                const rankingTornei = atleta.partiteRanking?.tornei || [];
                const totalRankingCampionato = rankingCampionato.length;
                const totalRankingTornei = rankingTornei.length;
                const totalRankingMatches = totalRankingCampionato + totalRankingTornei;
                const hasGironeMatches = Boolean(campionatoPartite && campionatoPartite.length > 0);

                // Build unified ranking matches array
                const unifiedRankingMatches: Array<{
                  tipo: 'campionato' | 'torneo';
                  data: string;
                  titolo: string;
                  sottotitolo?: string;
                  avversario: string;
                  fase?: string;
                  risultato: string;
                  isVittoria: boolean;
                  punti?: number;
                  stato?: string;
                }> = [];

                if (rankingFilter === 'tutti' || rankingFilter === 'campionato') {
                  rankingCampionato.forEach((m) => {
                    unifiedRankingMatches.push({
                      tipo: 'campionato',
                      data: m.data,
                      titolo: m.campionato,
                      avversario: m.avversario,
                      risultato: m.risultato,
                      isVittoria: m.isVittoria,
                      punti: m.punti,
                      stato: m.stato,
                    });
                  });
                }

                if (rankingFilter === 'tutti' || rankingFilter === 'tornei') {
                  rankingTornei.forEach((m) => {
                    unifiedRankingMatches.push({
                      tipo: 'torneo',
                      data: m.data,
                      titolo: m.torneo,
                      sottotitolo: m.gara,
                      avversario: m.avversario,
                      fase: m.fase,
                      risultato: m.risultato,
                      isVittoria: m.isVittoria,
                      stato: m.stato,
                    });
                  });
                }

                unifiedRankingMatches.sort((a, b) => parseDateIT(b.data) - parseDateIT(a.data));

                const activeTabResolved = (camId && hasGironeMatches) ? matchTab : 'ranking';

                return (
                  <div className="modal-campionato-partite-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                    {/* Header Row: Title & Switcher */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-primary-600)', letterSpacing: '0.04em' }}>
                          <i className="bi bi-trophy-fill me-1 text-warning"></i>
                          {activeTabResolved === 'girone'
                            ? `Partite nel Campionato ${campionatoNome ? `(${campionatoNome})` : ''}`
                            : 'Incontri Ufficiali FITeT (Ranking)'}
                        </div>
                        {activeTabResolved === 'girone' && squadraCampionato && (
                          <span className="badge pct-high" style={{ fontSize: '11px' }}>
                            {squadraCampionato}
                          </span>
                        )}
                      </div>

                      {/* Segmented Switcher if both girone & ranking exist */}
                      {camId && (
                        <div style={{ display: 'inline-flex', background: 'var(--bg-th)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setMatchTab('girone')}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderRadius: '6px',
                              background: activeTabResolved === 'girone' ? 'var(--color-primary-500)' : 'transparent',
                              color: activeTabResolved === 'girone' ? '#ffffff' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Girone Corrente {campionatoPartite && campionatoPartite.length > 0 ? `(${campionatoPartite.length})` : ''}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatchTab('ranking')}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderRadius: '6px',
                              background: activeTabResolved === 'ranking' ? 'var(--color-primary-500)' : 'transparent',
                              color: activeTabResolved === 'ranking' ? '#ffffff' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Tutte le Partite FITeT {totalRankingMatches > 0 ? `(${totalRankingMatches})` : ''}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Breakdown Pill for Ranking Points if viewing ranking matches */}
                    {activeTabResolved === 'ranking' && atleta.partiteRanking?.dettaglioPunti && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flexWrap: 'wrap',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'var(--bg-th)',
                          border: '1px solid var(--border-color)',
                          fontSize: '11.5px',
                          color: 'var(--text-muted)',
                          marginBottom: '10px',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: 'var(--text-dark)' }}>
                          <i className="bi bi-pie-chart-fill me-1 text-primary"></i>
                          Punti Ranking:
                        </span>
                        {atleta.partiteRanking.dettaglioPunti.puntiIniziali !== undefined && (
                          <span>Iniziali: <strong>{atleta.partiteRanking.dettaglioPunti.puntiIniziali}</strong></span>
                        )}
                        {atleta.partiteRanking.dettaglioPunti.campionato !== undefined && (
                          <span>Campionato: <strong style={{ color: '#16a34a' }}>+{atleta.partiteRanking.dettaglioPunti.campionato}</strong></span>
                        )}
                        {atleta.partiteRanking.dettaglioPunti.tornei !== undefined && (
                          <span>Tornei: <strong style={{ color: '#2563eb' }}>+{atleta.partiteRanking.dettaglioPunti.tornei}</strong></span>
                        )}
                        {atleta.partiteRanking.dettaglioPunti.vittorieTornei !== undefined && (
                          <span>Vittorie Tornei: <strong style={{ color: '#d97706' }}>+{atleta.partiteRanking.dettaglioPunti.vittorieTornei}</strong></span>
                        )}
                        {atleta.partiteRanking.dettaglioPunti.finali !== undefined && (
                          <span>Totale: <strong style={{ color: 'var(--color-primary-600)' }}>{atleta.partiteRanking.dettaglioPunti.finali} pt</strong></span>
                        )}
                      </div>
                    )}

                    {/* Ranking Sub-Filter Buttons (Tutti / Campionato / Tornei) */}
                    {activeTabResolved === 'ranking' && totalRankingCampionato > 0 && totalRankingTornei > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setRankingFilter('tutti')}
                          style={{
                            padding: '3px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: rankingFilter === 'tutti' ? 'var(--color-primary-500)' : 'var(--bg-th)',
                            color: rankingFilter === 'tutti' ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Tutti ({totalRankingMatches})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRankingFilter('campionato')}
                          style={{
                            padding: '3px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: rankingFilter === 'campionato' ? 'var(--color-primary-500)' : 'var(--bg-th)',
                            color: rankingFilter === 'campionato' ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Campionato ({totalRankingCampionato})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRankingFilter('tornei')}
                          style={{
                            padding: '3px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '999px',
                            border: '1px solid var(--border-color)',
                            background: rankingFilter === 'tornei' ? 'var(--color-primary-500)' : 'var(--bg-th)',
                            color: rankingFilter === 'tornei' ? '#ffffff' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Tornei ({totalRankingTornei})
                        </button>
                      </div>
                    )}

                    {/* Active Tab View 1: Girone Corrente Header/Notice */}
                    {activeTabResolved === 'girone' && (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: 'rgba(234, 179, 8, 0.1)',
                            border: '1px solid rgba(234, 179, 8, 0.25)',
                            color: '#ca8a04',
                            fontSize: '11.5px',
                            lineHeight: '1.4',
                            marginBottom: '12px',
                          }}
                        >
                          <i className="bi bi-info-circle-fill" style={{ fontSize: '13px', marginTop: '1px', flexShrink: 0 }}></i>
                          <div>
                            <strong>Nota federale:</strong> Le partite disputate nel campionato in corso potrebbero non essere ancora state conteggiate dalla Federazione nel ranking e nei punti ufficiali del profilo.
                          </div>
                        </div>

                        {loadingPartite && (
                          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                            Caricamento partite del girone...
                          </div>
                        )}

                        {!loadingPartite && (!campionatoPartite || campionatoPartite.length === 0) && (
                          <div style={{ padding: '14px', textAlign: 'center', background: 'var(--bg-th)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                            <i className="bi bi-shield-slash me-1"></i>
                            Nessuna partita disputata registrata in questo girone per questo atleta.
                            {totalRankingMatches > 0 && (
                              <div style={{ marginTop: '8px' }}>
                                <button
                                  type="button"
                                  className="btn-action"
                                  onClick={() => setMatchTab('ranking')}
                                  style={{ padding: '4px 12px', fontSize: '11.5px', borderRadius: '6px' }}
                                >
                                  Visualizza tutti gli incontri ufficiali FITeT ({totalRankingMatches})
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Active Tab View 2: Official FITeT Ranking Matches empty state */}
                    {activeTabResolved === 'ranking' && unifiedRankingMatches.length === 0 && (
                      <div style={{ padding: '16px', textAlign: 'center', background: 'var(--bg-th)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                        <i className="bi bi-clock-history me-1"></i>
                        Incontri al momento non disponibili
                      </div>
                    )}

                    {/* Render matches slider / list whenever there are matches in the active tab */}
                    {(() => {
                      interface MatchCardItem {
                        id: string;
                        tipo: 'girone' | 'campionato' | 'torneo';
                        data: string;
                        titolo: string;
                        sottotitolo?: string;
                        avversario: string;
                        giornata?: number;
                        fase?: string;
                        isVittoria: boolean;
                        risultatoSet?: string;
                        sets?: string[];
                        punti?: number;
                        rawRisultato?: string;
                      }

                      let matchesToDisplay: MatchCardItem[] = [];

                      if (activeTabResolved === 'girone' && campionatoPartite && campionatoPartite.length > 0) {
                        matchesToDisplay = campionatoPartite.map((m, idx) => ({
                          id: `girone-${idx}`,
                          tipo: 'girone',
                          data: `G${m.giornata}`,
                          titolo: campionatoNome || 'Campionato Girone',
                          sottotitolo: squadraCampionato || undefined,
                          avversario: m.avversario,
                          giornata: m.giornata,
                          isVittoria: m.isVittoria,
                          risultatoSet: m.risultatoSet,
                          sets: m.sets,
                        }));
                      } else if (activeTabResolved === 'ranking' && unifiedRankingMatches.length > 0) {
                        matchesToDisplay = unifiedRankingMatches.map((m, idx) => {
                          const matchingGirone = campionatoPartite?.find(
                            (gp) => gp.avversario.toUpperCase().trim() === m.avversario.toUpperCase().trim()
                          );

                          return {
                            id: `ranking-${idx}`,
                            tipo: m.tipo,
                            data: m.data,
                            titolo: m.titolo,
                            sottotitolo: m.sottotitolo,
                            avversario: m.avversario,
                            fase: m.fase,
                            isVittoria: m.isVittoria,
                            risultatoSet: matchingGirone?.risultatoSet,
                            sets: matchingGirone?.sets,
                            punti: m.punti,
                            rawRisultato: m.risultato,
                          };
                        });
                      }

                      if (matchesToDisplay.length === 0) return null;

                      return (
                        <div style={{ marginTop: '8px' }}>
                          {/* Slider Navigation Bar */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '8px',
                              flexWrap: 'wrap',
                              gap: '8px',
                            }}
                          >
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-dark)' }}>
                                {matchesToDisplay.length} {matchesToDisplay.length === 1 ? 'partita' : 'partite'}
                              </span>
                              {matchesToDisplay.length > 2 && viewMode === 'slider' && (
                                <span style={{ opacity: 0.8 }} className="d-none d-sm-inline">
                                  • Scorri in orizzontale o usa le frecce
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Toggle Slider vs Elenco */}
                              <div style={{ display: 'inline-flex', background: 'var(--bg-th)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                <button
                                  type="button"
                                  onClick={() => setViewMode('slider')}
                                  title="Vista Slider (compatta)"
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: viewMode === 'slider' ? 'var(--color-primary-500)' : 'transparent',
                                    color: viewMode === 'slider' ? '#ffffff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <i className="bi bi-collection-play me-1"></i>Slider
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setViewMode('list')}
                                  title="Vista Elenco"
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: viewMode === 'list' ? 'var(--color-primary-500)' : 'transparent',
                                    color: viewMode === 'list' ? '#ffffff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <i className="bi bi-list-ul me-1"></i>Elenco
                                </button>
                              </div>

                              {/* Navigation Arrows for Slider */}
                              {viewMode === 'slider' && matchesToDisplay.length > 1 && (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={() => scrollSlider('prev')}
                                    disabled={!canScrollLeft}
                                    title="Partita precedente"
                                    style={{
                                      width: '28px',
                                      height: '28px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-card, #ffffff)',
                                      color: canScrollLeft ? 'var(--text-dark)' : 'var(--text-muted)',
                                      cursor: canScrollLeft ? 'pointer' : 'default',
                                      opacity: canScrollLeft ? 1 : 0.35,
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <i className="bi bi-chevron-left" style={{ fontSize: '12px' }}></i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => scrollSlider('next')}
                                    disabled={!canScrollRight}
                                    title="Partita successiva"
                                    style={{
                                      width: '28px',
                                      height: '28px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-card, #ffffff)',
                                      color: canScrollRight ? 'var(--text-dark)' : 'var(--text-muted)',
                                      cursor: canScrollRight ? 'pointer' : 'default',
                                      opacity: canScrollRight ? 1 : 0.35,
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <i className="bi bi-chevron-right" style={{ fontSize: '12px' }}></i>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Match Cards Display: Slider track or List */}
                          {viewMode === 'slider' ? (
                            <div
                              ref={sliderRef}
                              onScroll={handleSliderScroll}
                              style={{
                                display: 'flex',
                                gap: '10px',
                                overflowX: 'auto',
                                scrollSnapType: 'x mandatory',
                                paddingBottom: '6px',
                                scrollbarWidth: 'thin',
                                WebkitOverflowScrolling: 'touch',
                              }}
                            >
                              {matchesToDisplay.map((m, idx) => (
                                <div
                                  key={m.id || idx}
                                  style={{
                                    flex: '0 0 min(290px, 85%)',
                                    scrollSnapAlign: 'start',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    padding: '11px 13px',
                                    background: 'var(--bg-card, #ffffff)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                    minHeight: '135px',
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  {/* Top Row: Outcome badge, Date, and Match type */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span
                                        style={{
                                          padding: '2px 7px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          background: m.isVittoria ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                          color: m.isVittoria ? '#16a34a' : '#dc2626',
                                          border: `1px solid ${m.isVittoria ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {m.isVittoria ? 'VINTA' : 'PERSA'}
                                      </span>

                                      {m.fase && (
                                        <span className="badge pct-zero" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                          {m.fase}
                                        </span>
                                      )}
                                    </div>

                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                      {m.data}
                                    </span>
                                  </div>

                                  {/* Middle Row: Opponent Name & Event Details */}
                                  <div style={{ marginBottom: '8px' }}>
                                    <div
                                      style={{
                                        fontWeight: '700',
                                        fontSize: '13.5px',
                                        color: 'var(--text-dark)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {onSelectAthlete ? (
                                        <button
                                          type="button"
                                          className="atleta-opponent-link"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectAthlete(m.avversario, m.avversario);
                                          }}
                                          title={`Apri profilo di ${m.avversario}`}
                                        >
                                          <span className="atleta-opponent-text">vs {m.avversario}</span>
                                          <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                        </button>
                                      ) : (
                                        <span title={`Avversario: ${m.avversario}`}>vs {m.avversario}</span>
                                      )}
                                    </div>

                                    <MarqueeText
                                      className="match-event-title-scroll"
                                      style={{
                                        fontSize: '11px',
                                        color: 'var(--text-muted)',
                                        marginTop: '3px',
                                      }}
                                      title={`${m.titolo}${m.sottotitolo ? ` • ${m.sottotitolo}` : ''}`}
                                    >
                                      <i className={`bi ${m.tipo === 'torneo' ? 'bi-award' : 'bi-trophy'} me-1`}></i>
                                      {m.titolo}
                                      {m.sottotitolo && ` • ${m.sottotitolo}`}
                                    </MarqueeText>
                                  </div>

                                  {/* Bottom Row: Set Details and Prominent Numeric Score */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      paddingTop: '8px',
                                      borderTop: '1px solid var(--border-light, #f1f5f9)',
                                      gap: '8px',
                                      marginTop: 'auto',
                                    }}
                                  >
                                    {/* Left: Set partials or Phase */}
                                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                                      {m.sets && m.sets.length > 0 ? (
                                        m.sets.map((s, sIdx) => (
                                          <span
                                            key={sIdx}
                                            style={{
                                              fontSize: '10px',
                                              padding: '1px 4px',
                                              borderRadius: '3px',
                                              background: 'var(--bg-th)',
                                              color: 'var(--text-main)',
                                              border: '1px solid var(--border-color)',
                                              fontVariantNumeric: 'tabular-nums',
                                            }}
                                          >
                                            {s}
                                          </span>
                                        ))
                                      ) : m.fase ? (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                          Fase: <strong style={{ color: 'var(--text-main)' }}>{m.fase}</strong>
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                          {m.tipo === 'campionato' ? 'Incontro Campionato' : 'Gara Ufficiale'}
                                        </span>
                                      )}
                                    </div>

                                    {/* Right: The big numeric outcome */}
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
                                      {m.risultatoSet ? (
                                        <div
                                          style={{
                                            fontSize: '16px',
                                            fontWeight: '800',
                                            color: m.isVittoria ? '#16a34a' : '#dc2626',
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {m.risultatoSet}
                                        </div>
                                      ) : m.punti !== undefined ? (
                                        <div
                                          style={{
                                            fontSize: '13.5px',
                                            fontWeight: '800',
                                            color: m.punti > 0 ? '#16a34a' : m.punti < 0 ? '#dc2626' : 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {m.punti > 0 ? `+${m.punti}` : m.punti} pt
                                        </div>
                                      ) : (
                                        <div
                                          style={{
                                            fontSize: '14px',
                                            fontWeight: '800',
                                            color: m.isVittoria ? '#16a34a' : '#dc2626',
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {m.isVittoria ? '1 - 0' : '0 - 1'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                maxHeight: '340px',
                                overflowY: 'auto',
                                paddingRight: '4px',
                                scrollbarWidth: 'thin',
                              }}
                            >
                              {matchesToDisplay.map((m, idx) => (
                                <div
                                  key={m.id || idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '9px 12px',
                                    background: 'var(--bg-card, #ffffff)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    gap: '10px',
                                    flexWrap: 'wrap',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 180px' }}>
                                    <span
                                      style={{
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        background: m.isVittoria ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                        color: m.isVittoria ? '#16a34a' : '#dc2626',
                                        border: `1px solid ${m.isVittoria ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {m.isVittoria ? 'VINTA' : 'PERSA'}
                                    </span>

                                    {m.giornata !== undefined && (
                                      <span className="badge pct-zero" style={{ fontSize: '10px' }}>
                                        G{m.giornata}
                                      </span>
                                    )}

                                    {m.fase && (
                                      <span className="badge pct-zero" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                        {m.fase}
                                      </span>
                                    )}

                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {onSelectAthlete ? (
                                          <button
                                            type="button"
                                            className="atleta-opponent-link"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onSelectAthlete(m.avversario, m.avversario);
                                            }}
                                            title={`Apri profilo di ${m.avversario}`}
                                          >
                                            <span className="atleta-opponent-text">vs {m.avversario}</span>
                                            <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                          </button>
                                        ) : (
                                          <span>vs {m.avversario}</span>
                                        )}
                                      </div>
                                      <div
                                        className="match-event-title-scroll"
                                        style={{ maxWidth: '260px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}
                                        title={`${m.titolo}${m.sottotitolo ? ` • ${m.sottotitolo}` : ''}`}
                                      >
                                        <i className={`bi ${m.tipo === 'torneo' ? 'bi-award' : 'bi-trophy'} me-1`}></i>
                                        {m.titolo}
                                        {m.sottotitolo && ` • ${m.sottotitolo}`}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {m.sets && m.sets.length > 0 && (
                                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                        {m.sets.map((s, sIdx) => (
                                          <span
                                            key={sIdx}
                                            style={{
                                              fontSize: '10.5px',
                                              padding: '1px 5px',
                                              borderRadius: '4px',
                                              background: 'var(--bg-th)',
                                              color: 'var(--text-main)',
                                              border: '1px solid var(--border-color)',
                                              fontVariantNumeric: 'tabular-nums',
                                            }}
                                          >
                                            {s}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                      {m.data}
                                    </span>

                                    {/* Numeric Result */}
                                    <div style={{ minWidth: '40px', textAlign: 'right' }}>
                                      {m.risultatoSet ? (
                                        <span style={{ fontSize: '14px', fontWeight: '800', color: m.isVittoria ? '#16a34a' : '#dc2626' }}>
                                          {m.risultatoSet}
                                        </span>
                                      ) : m.punti !== undefined ? (
                                        <span style={{ fontSize: '12.5px', fontWeight: '800', color: m.punti > 0 ? '#16a34a' : m.punti < 0 ? '#dc2626' : 'var(--text-muted)' }}>
                                          {m.punti > 0 ? `+${m.punti}` : m.punti} pt
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '13px', fontWeight: '800', color: m.isVittoria ? '#16a34a' : '#dc2626' }}>
                                          {m.isVittoria ? '1 - 0' : '0 - 1'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Subtle note about federale ranking data format */}
                          {activeTabResolved === 'ranking' && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <i className="bi bi-info-circle text-primary" style={{ flexShrink: 0 }}></i>
                              <span>
                                <strong>Dato Federale Ranking:</strong> La FITeT nei tabulati graduatoria registra l'esito (Vittoria/Sconfitta) e i punti; i set numerici (es. 3-1, 11-9) sono registrati nei referti ufficiali di gara.
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Historical Charts */}
              <div style={{ marginBottom: '16px' }}>
                <RatingChart data={atleta.storicoClassifica} athleteName={atleta.anagrafica.nome} />
              </div>

              {/* Historical Ranking Table */}
              {atleta.storicoClassifica.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Storico Classifica Ufficiale
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                    <div className="modal-ranking-grid">
                      <div className="grid-header-row">
                        <div className="grid-th text-center">Data Rilevazione</div>
                        <div className="grid-th text-center">Categoria</div>
                        <div className="grid-th text-center">Punti Classifica</div>
                        <div className="grid-th text-center">Posizione</div>
                      </div>
                      {[...atleta.storicoClassifica].reverse().map((s, idx) => (
                        <div key={idx} className="grid-data-row">
                          <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.data}</div>
                          <div className="grid-cell text-center"><span className="badge pct-zero">{s.categoria}^</span></div>
                          <div className="grid-cell text-center" style={{ fontWeight: '700', color: 'var(--color-primary-600)' }}>{s.punti} pt</div>
                          <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.posizione ? `#${s.posizione}` : '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
