import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite, fetchHeadToHead } from '../services/api';
import { RatingChart } from './RatingChart';
import { HeadToHeadModal } from './HeadToHeadModal';
import { HalfAtletaModal } from './HalfAtletaModal';
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

const normDate = (d?: string): string => {
  if (!d) return '';
  const parts = d.trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [day, month, year] = parts;
    day = String(parseInt(day, 10));
    month = String(parseInt(month, 10));
    if (year.length === 2) year = `20${year}`;
    return `${day}/${month}/${year}`;
  }
  return d.trim();
};

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
  const [halfAtletaTarget, setHalfAtletaTarget] = useState<{ id?: string; name: string } | null>(null);
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
  const [h2hScores, setH2hScores] = useState<Record<string, { punteggio: string }>>({});
  const [loadingH2h, setLoadingH2h] = useState<Record<string, boolean>>({});

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

  // Recupera in automatico i risultati set tramite la chiamata head_to_head per tutti gli incontri privi di punteggio set
  useEffect(() => {
    if (!currentAtletaId) return;

    const allMatches = [
      ...(campionatoPartite || []),
      ...(atleta?.partiteRanking?.campionato || []),
      ...(atleta?.partiteRanking?.tornei || []),
    ];

    const missingOpponents = new Map<string, { id?: string; name: string }>();

    for (const m of allMatches) {
      if (!m.risultatoSet && m.avversario) {
        const oppName = m.avversario.toUpperCase().trim();
        const oppId = (m as any).avversarioId;
        const key = oppId || oppName;
        if (!h2hScores[key] && !loadingH2h[key] && !missingOpponents.has(key)) {
          missingOpponents.set(key, { id: oppId, name: m.avversario });
        }
      }
    }

    if (missingOpponents.size === 0) return;

    let isMounted = true;

    setLoadingH2h((prev) => {
      const next = { ...prev };
      missingOpponents.forEach((_, key) => {
        next[key] = true;
      });
      return next;
    });

    missingOpponents.forEach((opp, key) => {
      const oppParam = opp.id || opp.name;
      fetchHeadToHead(currentAtletaId, oppParam)
        .then((data) => {
          if (!isMounted) return;
          setH2hScores((prev) => {
            const next = { ...prev };
            if (data && data.incontri && data.incontri.length > 0) {
              const nameKey = (data.atleta2.nome || opp.name).toUpperCase().trim();
              const idKey = data.atleta2.id || opp.id;

              data.incontri.forEach((enc) => {
                const dateKey = normDate(enc.data);
                const scoreObj = { punteggio: enc.punteggio };
                if (idKey && dateKey) next[`${idKey}_${dateKey}`] = scoreObj;
                if (nameKey && dateKey) next[`${nameKey}_${dateKey}`] = scoreObj;
              });

              const firstEnc = { punteggio: data.incontri[0].punteggio };
              if (idKey && !next[idKey]) next[idKey] = firstEnc;
              if (nameKey && !next[nameKey]) next[nameKey] = firstEnc;
              next[key] = firstEnc;
            }
            return next;
          });
        })
        .catch(() => {
          // Ignorato per non bloccare la UI
        })
        .finally(() => {
          if (isMounted) {
            setLoadingH2h((prev) => ({ ...prev, [key]: false }));
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [currentAtletaId, campionatoPartite, atleta?.partiteRanking]);

  useEffect(() => {
    if (!isTopModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !h2hOpponent && !halfAtletaTarget) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isTopModal, h2hOpponent, halfAtletaTarget]);

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
              <div className="modal-header-subtext">
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
            <div className="modal-error-box">
              <strong>Errore:</strong> {error}
            </div>
          )}

          {atleta && !loading && (
            <div>
              {/* Profile Bar */}
              <div className="atleta-profile-bar">
                <div className="atleta-profile-photo-wrap">
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
                    <div className="atleta-profile-meta-sub">
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
                          <div className="pill-switcher-container">
                            <button
                              type="button"
                              onClick={() => setMatchTab('girone')}
                              className={`pill-switcher-btn ${activeTabResolved === 'girone' ? 'active' : ''}`}
                            >
                              Girone Corrente {campionatoPartite && campionatoPartite.length > 0 ? `(${campionatoPartite.length})` : ''}
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatchTab('ranking')}
                              className={`pill-switcher-btn ${activeTabResolved === 'ranking' ? 'active' : ''}`}
                            >
                              Tutte le Partite FITeT {totalRankingMatches > 0 ? `(${totalRankingMatches})` : ''}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Breakdown Pill for Ranking Points if viewing ranking matches */}
                      {activeTabResolved === 'ranking' && atleta.partiteRanking?.dettaglioPunti && atleta.partiteRanking.dettaglioPunti?.puntiIniziali && (
                        <div className="ranking-points-breakdown">
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
                            className={`badge-pill-filter ${rankingFilter === 'tutti' ? 'active' : ''}`}
                          >
                            Tutti ({totalRankingMatches})
                          </button>
                          <button
                            type="button"
                            onClick={() => setRankingFilter('campionato')}
                            className={`badge-pill-filter ${rankingFilter === 'campionato' ? 'active' : ''}`}
                          >
                            Campionato ({totalRankingCampionato})
                          </button>
                          <button
                            type="button"
                            onClick={() => setRankingFilter('tornei')}
                            className={`badge-pill-filter ${rankingFilter === 'tornei' ? 'active' : ''}`}
                          >
                            Tornei ({totalRankingTornei})
                          </button>
                        </div>
                      )}

                      {/* Active Tab View 1: Girone Corrente Header/Notice */}
                      {activeTabResolved === 'girone' && (
                        <>
                          <div className="atleta-tab-notice-line">
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
                            <div className="modal-empty-notice">
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
                        <div className="modal-empty-notice">
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
                                <div className="pill-switcher-container">
                                  <button
                                    type="button"
                                    onClick={() => setViewMode('slider')}
                                    title="Vista Slider"
                                    className={`pill-switcher-btn ${viewMode === 'slider' ? 'active' : ''}`}
                                  >
                                    <i className="bi bi-collection-play me-1"></i>Slider
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    title="Vista Elenco"
                                    className={`pill-switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
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
                                      className="slider-nav-btn"
                                    >
                                      <i className="bi bi-chevron-left" style={{ fontSize: '12px' }}></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => scrollSlider('next')}
                                      disabled={!canScrollRight}
                                      title="Partita successiva"
                                      className="slider-nav-btn"
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
                                className="atleta-match-slider-container"
                              >
                                {matchesToDisplay.map((m, idx) => {
                                  const matchDateNorm = normDate(m.data);
                                  const oppNameKey = (m.avversario || '').toUpperCase().trim();
                                  const oppIdKey = m.avversarioId || '';
                                  const h2hMatch =
                                    (oppIdKey && matchDateNorm ? h2hScores[`${oppIdKey}_${matchDateNorm}`] : null) ||
                                    (oppNameKey && matchDateNorm ? h2hScores[`${oppNameKey}_${matchDateNorm}`] : null) ||
                                    (oppIdKey ? h2hScores[oppIdKey] : null) ||
                                    (oppNameKey ? h2hScores[oppNameKey] : null);

                                  const exactScore = m.risultatoSet || h2hMatch?.punteggio;
                                  const isFetchingScore = !exactScore && Boolean((oppIdKey && loadingH2h[oppIdKey]) || (oppNameKey && loadingH2h[oppNameKey]));

                                  return (
                                    <div
                                      key={m.id || idx}
                                      className="atleta-match-card atleta-match-slider-card"
                                    >
                                      {/* Top Row: Outcome badge, Date, and Match type */}
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span className={`match-badge-outcome ${m.isVittoria ? 'is-win' : 'is-loss'}`}>
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
                                        <div className="atleta-opponent-wrap">
                                          <button
                                            type="button"
                                            className="atleta-opponent-link"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setHalfAtletaTarget({ id: m.avversarioId, name: m.avversario });
                                            }}
                                            title={`Visualizza scheda rapida di ${m.avversario}`}
                                          >
                                            <span className="atleta-opponent-text">vs {m.avversario}</span>
                                            <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                            }}
                                            title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                            className="btn-h2h-inline"
                                          >
                                            <i className="bi bi-arrow-left-right" style={{ fontSize: '9px' }}></i>
                                            Visualizza storico (testa a testa)
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
                                      <div className="match-card-footer">
                                        {/* Left: Set partials as clean text without pill frames */}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          {m.sets && m.sets.length > 0 ? (
                                            <span
                                              className="match-sets-text"
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
                                          {exactScore ? (
                                            <div
                                              className="match-score-big"
                                              style={{ color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                            >
                                              {exactScore}
                                            </div>
                                          ) : isFetchingScore ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                                              <span
                                                className="spinner-border spinner-border-sm"
                                                role="status"
                                                aria-hidden="true"
                                                style={{ width: '12px', height: '12px', borderWidth: '2px', color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                              />
                                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Set...</span>
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
                                                color: 'var(--text-muted)',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              -
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="atleta-match-list-container">
                                {matchesToDisplay.map((m, idx) => {
                                  const matchDateNorm = normDate(m.data);
                                  const oppNameKey = (m.avversario || '').toUpperCase().trim();
                                  const oppIdKey = m.avversarioId || '';
                                  const h2hMatch =
                                    (oppIdKey && matchDateNorm ? h2hScores[`${oppIdKey}_${matchDateNorm}`] : null) ||
                                    (oppNameKey && matchDateNorm ? h2hScores[`${oppNameKey}_${matchDateNorm}`] : null) ||
                                    (oppIdKey ? h2hScores[oppIdKey] : null) ||
                                    (oppNameKey ? h2hScores[oppNameKey] : null);

                                  const exactScore = m.risultatoSet || h2hMatch?.punteggio;
                                  const isFetchingScore = !exactScore && Boolean((oppIdKey && loadingH2h[oppIdKey]) || (oppNameKey && loadingH2h[oppNameKey]));

                                  return (
                                    <div
                                      key={m.id || idx}
                                      className="atleta-match-list-item atleta-match-list-row"
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 180px' }}>
                                        <span className={`match-badge-outcome ${m.isVittoria ? 'is-win' : 'is-loss'}`}>
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
                                          <div className="atleta-list-opponent-wrap">
                                            <button
                                              type="button"
                                              className="atleta-opponent-link"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setHalfAtletaTarget({ id: m.avversarioId, name: m.avversario });
                                              }}
                                              title={`Visualizza scheda rapida di ${m.avversario}`}
                                            >
                                              <span className="atleta-opponent-text">vs {m.avversario}</span>
                                              <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                              }}
                                              title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                              className="btn-h2h-inline"
                                            >
                                              <i className="bi bi-arrow-left-right" style={{ fontSize: '8.5px' }}></i>
                                              Storico Scontri
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
                                          {exactScore ? (
                                            <span style={{ fontSize: '14px', fontWeight: '800', color: m.isVittoria ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                                              {exactScore}
                                            </span>
                                          ) : isFetchingScore ? (
                                            <span
                                              className="spinner-border spinner-border-sm"
                                              role="status"
                                              aria-hidden="true"
                                              style={{ width: '11px', height: '11px', borderWidth: '2px', color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                            />
                                          ) : m.punti !== undefined ? (
                                            <span style={{ fontSize: '12.5px', fontWeight: '800', color: m.punti > 0 ? '#16a34a' : m.punti < 0 ? '#dc2626' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                              {m.punti > 0 ? `+${m.punti}` : m.punti} pt
                                            </span>
                                          ) : (
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-muted)' }}>
                                              -
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Subtle note about federale ranking data format */}
                            {activeTabResolved === 'ranking' && (
                              <div className="ranking-federale-note">
                                <i className="bi bi-info-circle text-primary" style={{ flexShrink: 0 }}></i>
                                <span>
                                  <strong>Nota:</strong> Alcuni match potrebbero non essere stati conteggiati ai fini del ranking.
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
                      <div className="pill-switcher-container">
                        <button
                          type="button"
                          onClick={() => setAnalyticsTab('chart')}
                          className={`pill-switcher-btn ${analyticsTab === 'chart' ? 'active' : ''}`}
                        >
                          <i className="bi bi-graph-up me-1"></i>Grafico
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsTab('table')}
                          className={`pill-switcher-btn ${analyticsTab === 'table' ? 'active' : ''}`}
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
                        <div className="atleta-rating-table-wrap">
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

      {/* Modal HalfAtleta (Riepilogo Rapido Avversario) */}
      {halfAtletaTarget && (
        <HalfAtletaModal
          atletaKey={halfAtletaTarget.id || halfAtletaTarget.name}
          athleteName={halfAtletaTarget.name}
          onClose={() => setHalfAtletaTarget(null)}
          onOpenFullModal={(resolvedId, name) => {
            setHalfAtletaTarget(null);
            if (onSelectAthlete) {
              onSelectAthlete(resolvedId, name);
            }
          }}
        />
      )}
    </div>,
    document.body
  );
};
