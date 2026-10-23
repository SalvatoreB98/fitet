import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite } from '../services/api';
import { RatingChart } from './RatingChart';
import { HeadToHeadModal } from './HeadToHeadModal';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { MarqueeText } from './MarqueeText';
import { recordAndGetAthleteViews } from '../utils/athleteViews';
import { useFavoriteAthletes, saveFavoriteAthlete } from '../utils/favorites';

interface AtletaModalProps {
  atletaId: string;
  athleteName?: string;
  returnLabel?: string;
  camId?: string | null;
  campionatoNome?: string | null;
  onClose: () => void;
  onSelectAthlete?: (id: string, name: string) => void;
  isTopModal?: boolean;
}

export const AtletaModal: React.FC<AtletaModalProps> = ({
  atletaId,
  athleteName,
  returnLabel,
  camId,
  campionatoNome,
  onClose,
  onSelectAthlete,
  isTopModal = true,
}) => {
  useBodyScrollLock(true);
  const { isFavorite, toggleFavorite } = useFavoriteAthletes();

  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const lastTrackedKeyRef = useRef<string | null>(null);

  const currentAtletaId = atleta?.id || atletaId;
  const currentAthleteName = atleta?.anagrafica?.nome || athleteName || 'Atleta';
  const isFav = isFavorite(currentAtletaId) || isFavorite(currentAthleteName);

  const handleToggleFavorite = () => {
    const storico = atleta?.storicoClassifica || [];
    const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

    toggleFavorite({
      id: currentAtletaId,
      name: currentAthleteName,
      squadra: atleta?.anagrafica?.societa || squadraCampionato || undefined,
      ranking: ultimoSnapshot?.posizione ?? undefined,
      punti: atleta?.anagrafica?.punti ?? ultimoSnapshot?.punti ?? undefined,
      categoria: atleta?.anagrafica?.categoria ?? ultimoSnapshot?.categoria ?? undefined,
      dataNascita: atleta?.anagrafica?.dataNascita ?? undefined,
      fotoUrl: atleta?.anagrafica?.fotoUrl ?? undefined,
    });
  };

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
  const [analyticsTab, setAnalyticsTab] = useState<'chart' | 'table'>('chart');
  const [h2hOpponent, setH2hOpponent] = useState<{ id?: string; name: string } | null>(null);

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
    setImgError(false);

    fetchAtleta(atletaId)
      .then((data) => {
        if (isMounted) {
          setAtleta(data);
          setLoading(false);

          // Se l'atleta è nei preferiti, mantieni sincronizzati ranking reale, punti e categoria
          if (isFavorite(data.id) || isFavorite(data.anagrafica.nome)) {
            const storico = data.storicoClassifica || [];
            const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
            saveFavoriteAthlete({
              id: data.id,
              name: data.anagrafica.nome,
              squadra: data.anagrafica.societa || undefined,
              ranking: ultimoSnapshot?.posizione ?? undefined,
              punti: data.anagrafica.punti ?? ultimoSnapshot?.punti ?? undefined,
              categoria: data.anagrafica.categoria ?? ultimoSnapshot?.categoria ?? undefined,
              dataNascita: data.anagrafica.dataNascita ?? undefined,
              fotoUrl: data.anagrafica.fotoUrl ?? undefined,
            });
          }

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
    if (!isTopModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isTopModal]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop-simple modal-athlete-backdrop" onClick={onClose}>
      <div className="modal-card-simple" onClick={(e) => e.stopPropagation()}>
        {/* Simple Blue Header */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Scheda Ranking FITeT
              </h3>
              <div style={{ fontSize: '11px', color: '#bfdbfe', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : 'In risoluzione...')} • Classifica Unica Nazionale
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className={`modal-favorite-toggle-btn ${isFav ? 'is-favorited' : ''}`}
              onClick={handleToggleFavorite}
              title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            >
              <i className={isFav ? 'bi bi-star-fill text-warning' : 'bi bi-star'}></i>
              <span className="modal-favorite-btn-text d-none d-sm-inline">
                {isFav ? 'Preferito' : 'Preferiti'}
              </span>
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
                  marginBottom: '16px',
                  borderBottom: '1px solid var(--border-light, #f1f5f9)',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: '74px',
                    height: '74px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'var(--bg-th)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {(() => {
                    const athletePhoto = atleta.anagrafica.fotoUrl || (atleta.id && /^\d+$/.test(atleta.id) ? `https://portale.fitet.org/images/atleti/${atleta.id}.jpg` : null);
                    return !imgError && athletePhoto ? (
                      <img
                        src={athletePhoto}
                        alt={atleta.anagrafica.nome}
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-muted)' }}>
                        {atleta.anagrafica.nome.slice(0, 2)}
                      </span>
                    );
                  })()}
                </div>

                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-dark)', fontFamily: 'var(--font-serif)' }}>
                    {atleta.anagrafica.nome}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <strong>Società:</strong> {atleta.anagrafica.societa || 'N.D.'} {atleta.anagrafica.regione && `(${atleta.anagrafica.regione})`}
                  </div>

                  {/* Secondary subtle metadata text: Birth date and Profile Views */}
                  {(atleta.anagrafica.dataNascita || viewsCount > 0) && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {atleta.anagrafica.dataNascita && (
                        <span>
                          <i className="bi bi-calendar3 me-1" style={{ fontSize: '11px' }}></i>
                          Nato/a il {atleta.anagrafica.dataNascita}
                        </span>
                      )}
                      {atleta.anagrafica.dataNascita && viewsCount > 0 && <span style={{ opacity: 0.5 }}>•</span>}
                      {viewsCount > 0 && (
                        <span title={`${viewsCount.toLocaleString('it-IT')} visualizzazioni reali del profilo`}>
                          <i className="bi bi-eye me-1" style={{ fontSize: '11px' }}></i>
                          {viewsCount.toLocaleString('it-IT')} {viewsCount === 1 ? 'visita' : 'visite'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status & Category Tags (Only essential tags in clean neutral badges) */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {atleta.anagrafica.categoria && (
                      <span className="badge badge-neutral">
                        {/^\d+$/.test(atleta.anagrafica.categoria.trim())
                          ? `${atleta.anagrafica.categoria}ª Categoria`
                          : atleta.anagrafica.categoria}
                      </span>
                    )}
                    {atleta.anagrafica.settore && (
                      <span className="badge badge-neutral">{atleta.anagrafica.settore}</span>
                    )}
                    {atleta.anagrafica.stato && atleta.anagrafica.stato !== 'Attivo' && (
                      <span className="badge badge-neutral">{atleta.anagrafica.stato}</span>
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

                // Fallback winrate & matches calculation if fragment-1 riepilogo has 0
                const allRankingMatches = [
                  ...(atleta.partiteRanking?.campionato || []),
                  ...(atleta.partiteRanking?.tornei || []),
                ];
                let partiteGiocate = atleta.riepilogo.partiteGiocate;
                let partiteVinte = atleta.riepilogo.partiteVinte;
                let partitePerse = atleta.riepilogo.partitePerse;
                let percPositiva = atleta.riepilogo.percentualePositiva;
                let puntiNetto = atleta.riepilogo.puntiTotali;

                if (partiteGiocate === 0 && allRankingMatches.length > 0) {
                  partiteGiocate = allRankingMatches.length;
                  partiteVinte = allRankingMatches.filter((m) => m.isVittoria).length;
                  partitePerse = partiteGiocate - partiteVinte;
                  percPositiva = Math.round((partiteVinte / partiteGiocate) * 100);
                } else if (partiteGiocate === 0 && campionatoPartite && campionatoPartite.length > 0) {
                  partiteGiocate = campionatoPartite.length;
                  partiteVinte = campionatoPartite.filter((m) => m.isVittoria).length;
                  partitePerse = partiteGiocate - partiteVinte;
                  percPositiva = Math.round((partiteVinte / partiteGiocate) * 100);
                } else if (percPositiva === 0 && partiteGiocate > 0 && partiteVinte > 0) {
                  percPositiva = Math.round((partiteVinte / partiteGiocate) * 100);
                }

                if (puntiNetto === 0 && atleta.partiteRanking?.dettaglioPunti) {
                  const diff = (atleta.partiteRanking.dettaglioPunti.campionato || 0) + (atleta.partiteRanking.dettaglioPunti.tornei || 0);
                  if (diff !== 0) puntiNetto = diff;
                }

                return (
                  <div className="overview-stats-section" style={{ paddingBottom: '18px', borderBottom: '1px solid var(--border-light, #f1f5f9)', marginBottom: '18px' }}>
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
                        <div className="overview-stat-col" title={`Partite vinte: ${partiteVinte}, giocate: ${partiteGiocate}, perse: ${partitePerse}`}>
                          <span className="overview-stat-label">Partite V/G</span>
                          <MarqueeText className="overview-stat-value">
                            {partiteVinte} <span className="overview-stat-slash">/</span> {partiteGiocate}
                          </MarqueeText>
                          <MarqueeText className="overview-stat-sub" text={`Perse: ${partitePerse}`} />
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 4. % Vittorie */}
                        <div className="overview-stat-col" title={`% Vittorie: ${percPositiva}%, Guadagno netto: ${puntiNetto} pt`}>
                          <span className="overview-stat-label">% Vittorie</span>
                          <MarqueeText className="overview-stat-value" text={`${percPositiva}%`} />
                          <MarqueeText
                            className="overview-stat-sub"
                            text={puntiNetto > 0 ? `+${puntiNetto} pt netti` : `${puntiNetto} pt`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Sezione Partite e Dettagli */}
              <div id="athlete-partite-details-section">
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
                      avversarioId?: string;
                      risultatoSet?: string;
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
                          avversarioId: m.avversarioId,
                          risultatoSet: m.risultatoSet,
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
                          avversarioId: m.avversarioId,
                          risultatoSet: m.risultatoSet,
                          fase: m.fase,
                          risultato: m.risultato,
                          isVittoria: m.isVittoria,
                          stato: m.stato,
                        });
                      });
                    }

                    unifiedRankingMatches.sort((a, b) => parseDateIT(b.data) - parseDateIT(a.data));

                    const activeTabResolved = (camId && hasGironeMatches) ? matchTab : 'ranking';

                    // Nessuna partita disponibile (né girone né ranking): nascondi l'intera sezione
                    if (!hasGironeMatches && totalRankingMatches === 0 && !loadingPartite) return null;

                    return (
                      <div className="modal-campionato-partite-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                        {/* Header Row: Title & Switcher */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

                          </div>

                          {/* Switcher visibile solo se esistono sia partite del girone sia partite ranking */}
                          {camId && hasGironeMatches && totalRankingMatches > 0 && (
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
                                  background: activeTabResolved === 'girone' ? 'var(--color-primary-600)' : 'transparent',
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
                                  background: activeTabResolved === 'ranking' ? 'var(--color-primary-600)' : 'transparent',
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
                        {activeTabResolved === 'ranking' && atleta.partiteRanking?.dettaglioPunti && atleta.partiteRanking.dettaglioPunti?.puntiIniziali && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              flexWrap: 'wrap',
                              padding: '7px 12px',
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
                              <span>Iniziali: <strong style={{ color: 'var(--text-dark)' }}>{atleta.partiteRanking.dettaglioPunti.puntiIniziali}</strong></span>
                            )}
                            {atleta.partiteRanking.dettaglioPunti.campionato !== undefined && (
                              <span>Campionato: <strong style={{ color: 'var(--text-dark)' }}>+{atleta.partiteRanking.dettaglioPunti.campionato}</strong></span>
                            )}
                            {atleta.partiteRanking.dettaglioPunti.tornei !== undefined && (
                              <span>Tornei: <strong style={{ color: 'var(--text-dark)' }}>+{atleta.partiteRanking.dettaglioPunti.tornei}</strong></span>
                            )}
                            {atleta.partiteRanking.dettaglioPunti.vittorieTornei !== undefined && (
                              <span>Vittorie Tornei: <strong style={{ color: 'var(--text-dark)' }}>+{atleta.partiteRanking.dettaglioPunti.vittorieTornei}</strong></span>
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
                                background: rankingFilter === 'tutti' ? 'var(--color-primary-600)' : 'var(--bg-th)',
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
                                background: rankingFilter === 'campionato' ? 'var(--color-primary-600)' : 'var(--bg-th)',
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
                                background: rankingFilter === 'tornei' ? 'var(--color-primary-600)' : 'var(--bg-th)',
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
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11.5px',
                                color: 'var(--text-muted)',
                                marginBottom: '10px',
                                lineHeight: '1.35',
                              }}
                            >
                              <i className="bi bi-info-circle text-primary" style={{ fontSize: '12px', flexShrink: 0 }}></i>
                              <span>
                                Le partite disputate nel campionato in corso potrebbero non essere ancora convalidate nei punti ranking ufficiali.
                              </span>
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
                            avversarioId?: string;
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
                            matchesToDisplay = campionatoPartite.map((m, idx) => {
                              const matchingRanking = unifiedRankingMatches.find(
                                (rm) => rm.avversario.toUpperCase().trim() === m.avversario.toUpperCase().trim()
                              );
                              return {
                                id: `girone-${idx}`,
                                tipo: 'girone',
                                data: `G${m.giornata}`,
                                titolo: campionatoNome || 'Campionato Girone',
                                sottotitolo: squadraCampionato || undefined,
                                avversario: m.avversario,
                                avversarioId: matchingRanking?.avversarioId,
                                giornata: m.giornata,
                                isVittoria: m.isVittoria,
                                risultatoSet: m.risultatoSet,
                                sets: m.sets,
                              };
                            });
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
                                avversarioId: m.avversarioId,
                                fase: m.fase,
                                isVittoria: m.isVittoria,
                                risultatoSet: m.risultatoSet || matchingGirone?.risultatoSet,
                                sets: matchingGirone?.sets,
                                punti: m.punti,
                                rawRisultato: m.risultato,
                              };
                            });
                          }

                          if (matchesToDisplay.length === 0) return null;

                          return (
                            <div style={{ marginTop: '8px', minHeight: '180px' }}>
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
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {/* Toggle Slider vs Elenco */}
                                  <div style={{ display: 'inline-flex', background: 'var(--bg-th)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                    <button
                                      type="button"
                                      onClick={() => setViewMode('slider')}
                                      title="Vista Slider"
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        border: 'none',
                                        borderRadius: '4px',
                                        background: viewMode === 'slider' ? 'var(--color-primary-600)' : 'transparent',
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
                                        background: viewMode === 'list' ? 'var(--color-primary-600)' : 'transparent',
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
                                      className="atleta-match-card"
                                      style={{
                                        flex: '0 0 min(280px, 82%)',
                                        scrollSnapAlign: 'start',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        padding: '11px 13px',
                                        minHeight: '130px',
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
                                            <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
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
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                          }}
                                        >
                                          {onSelectAthlete ? (
                                            <button
                                              type="button"
                                              className="atleta-opponent-link"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const oppId = m.avversarioId || m.avversario;
                                                onSelectAthlete(oppId, m.avversario);
                                              }}
                                              title={`Apri profilo di ${m.avversario}`}
                                            >
                                              <span className="atleta-opponent-text">vs {m.avversario}</span>
                                              <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                            </button>
                                          ) : (
                                            <span title={`Avversario: ${m.avversario}`}>vs {m.avversario}</span>
                                          )}

                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                            }}
                                            title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                              padding: '1px 6px',
                                              borderRadius: '4px',
                                              fontSize: '10px',
                                              fontWeight: 700,
                                              background: 'rgba(59, 130, 246, 0.1)',
                                              color: 'var(--color-primary-600, #2563eb)',
                                              border: '1px solid rgba(59, 130, 246, 0.25)',
                                              cursor: 'pointer',
                                              flexShrink: 0,
                                            }}
                                          >
                                            <i className="bi bi-arrow-left-right" style={{ fontSize: '9px' }}></i>
                                            H2H
                                          </button>
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
                                        {/* Left: Set partials as clean text without pill frames */}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          {m.sets && m.sets.length > 0 ? (
                                            <span
                                              style={{
                                                fontSize: '11px',
                                                color: 'var(--text-muted)',
                                                fontVariantNumeric: 'tabular-nums',
                                                letterSpacing: '0.02em',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                display: 'block',
                                              }}
                                              title={m.sets.join(', ')}
                                            >
                                              {m.sets.join(', ')}
                                            </span>
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
                                              {m.isVittoria ? 'V' : 'P'}
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
                                    minHeight: '146px',
                                    overflowY: 'auto',
                                    paddingRight: '4px',
                                    scrollbarWidth: 'thin',
                                  }}
                                >
                                  {matchesToDisplay.map((m, idx) => (
                                    <div
                                      key={m.id || idx}
                                      className="atleta-match-list-item"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 12px',
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
                                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                            G{m.giornata}
                                          </span>
                                        )}

                                        {m.fase && (
                                          <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                            {m.fase}
                                          </span>
                                        )}

                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {onSelectAthlete ? (
                                              <button
                                                type="button"
                                                className="atleta-opponent-link"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const oppId = m.avversarioId || m.avversario;
                                                  onSelectAthlete(oppId, m.avversario);
                                                }}
                                                title={`Apri profilo di ${m.avversario}`}
                                              >
                                                <span className="atleta-opponent-text">vs {m.avversario}</span>
                                                <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                              </button>
                                            ) : (
                                              <span>vs {m.avversario}</span>
                                            )}

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                              }}
                                              title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                                fontSize: '9.5px',
                                                fontWeight: 700,
                                                background: 'rgba(59, 130, 246, 0.1)',
                                                color: 'var(--color-primary-600, #2563eb)',
                                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                              }}
                                            >
                                              <i className="bi bi-arrow-left-right" style={{ fontSize: '8.5px' }}></i>
                                              H2H
                                            </button>
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
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              color: 'var(--text-muted)',
                                              fontVariantNumeric: 'tabular-nums',
                                              letterSpacing: '0.02em',
                                            }}
                                            title={m.sets.join(', ')}
                                          >
                                            {m.sets.join(', ')}
                                          </span>
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
                                              {m.isVittoria ? 'V' : 'P'}
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
                                    <strong>Dato Federale Ranking:</strong> La FITeT nei tabulati graduatoria registra l'esito (Vittoria/Sconfitta) e i punti; i set numerici sono registrati nei referti ufficiali di gara.
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Historical Analytics (Sub-Tabs: Grafico vs Tabella) */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      {atleta.storicoClassifica.length > 0 && (
                        <div style={{ display: 'inline-flex', background: 'var(--bg-th)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setAnalyticsTab('chart')}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderRadius: '4px',
                              background: analyticsTab === 'chart' ? 'var(--color-primary-600)' : 'transparent',
                              color: analyticsTab === 'chart' ? '#ffffff' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <i className="bi bi-graph-up me-1"></i>Grafico
                          </button>
                          <button
                            type="button"
                            onClick={() => setAnalyticsTab('table')}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderRadius: '4px',
                              background: analyticsTab === 'table' ? 'var(--color-primary-600)' : 'transparent',
                              color: analyticsTab === 'table' ? '#ffffff' : 'var(--text-muted)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <i className="bi bi-table me-1"></i>Tabella ({atleta.storicoClassifica.length})
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ minHeight: '260px' }}>
                      {analyticsTab === 'chart' ? (
                        <RatingChart data={atleta.storicoClassifica} athleteName={atleta.anagrafica.nome} hideTitle={true} />
                      ) : (
                        atleta.storicoClassifica.length > 0 && (
                          <div style={{ maxHeight: '250px', minHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', scrollbarWidth: 'thin' }}>
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
                                  <div className="grid-cell text-center">
                                    <span className="badge badge-neutral">{s.categoria ? `${s.categoria}ª` : '-'}</span>
                                  </div>
                                  <div className="grid-cell text-center" style={{ fontWeight: '700', color: 'var(--color-primary-600)' }}>{s.punti} pt</div>
                                  <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.posizione ? `#${s.posizione.toLocaleString('it-IT')}` : '-'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Testa a Testa con l'avversario selezionato */}
        {h2hOpponent && (
          <HeadToHeadModal
            isOpen={true}
            atleta1Id={currentAtletaId}
            atleta1Nome={currentAthleteName}
            atleta2Id={h2hOpponent.id}
            atleta2Nome={h2hOpponent.name}
            onClose={() => setH2hOpponent(null)}
            onSelectAthlete={onSelectAthlete}
          />
        )}
    </div>,
    document.body
  );
};
