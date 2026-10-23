import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta } from '../types/fitet';
import { fetchAtleta } from '../services/api';
import { MarqueeText } from './MarqueeText';
import { recordAndGetAthleteViews } from '../utils/athleteViews';
import { useFavoriteAthletes, saveFavoriteAthlete } from '../utils/favorites';

export interface HalfAtletaModalProps {
  atletaKey: string;
  athleteName?: string;
  onClose: () => void;
  onOpenFullModal: (resolvedId: string, name: string) => void;
}

export const HalfAtletaModal: React.FC<HalfAtletaModalProps> = ({
  atletaKey,
  athleteName,
  onClose,
  onOpenFullModal,
}) => {
  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const lastTrackedKeyRef = useRef<string | null>(null);

  const { isFavorite, toggleFavorite } = useFavoriteAthletes();

  const currentAtletaId = atleta?.id || atletaKey;
  const currentAthleteName = atleta?.anagrafica?.nome || athleteName || 'Atleta';
  const isFav = isFavorite(currentAtletaId) || isFavorite(currentAthleteName);

  // Load data
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setImgError(false);

    fetchAtleta(atletaKey)
      .then((data) => {
        if (isMounted) {
          setAtleta(data);
          setLoading(false);

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
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Impossibile recuperare i dati dell\'atleta');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [atletaKey]);

  // Track Views
  useEffect(() => {
    const key = (atletaKey || athleteName || '').toLowerCase().trim();
    if (!key) return;

    if (lastTrackedKeyRef.current === key) return;
    lastTrackedKeyRef.current = key;

    const v = recordAndGetAthleteViews(key, (serverViews) => {
      setViewsCount(serverViews);
    });
    setViewsCount(v);
  }, [atletaKey, athleteName]);

  // Keyboard navigation (Escape closes only this modal)
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

  const handleToggleFavorite = () => {
    const storico = atleta?.storicoClassifica || [];
    const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

    toggleFavorite({
      id: currentAtletaId,
      name: currentAthleteName,
      squadra: atleta?.anagrafica?.societa || undefined,
      ranking: ultimoSnapshot?.posizione ?? undefined,
      punti: atleta?.anagrafica?.punti ?? ultimoSnapshot?.punti ?? undefined,
      categoria: atleta?.anagrafica?.categoria ?? ultimoSnapshot?.categoria ?? undefined,
      dataNascita: atleta?.anagrafica?.dataNascita ?? undefined,
      fotoUrl: atleta?.anagrafica?.fotoUrl ?? undefined,
    });
  };

  const handleOpenFull = () => {
    if (atleta) {
      onOpenFullModal(atleta.id, atleta.anagrafica.nome);
    } else {
      onOpenFullModal(atletaKey, athleteName || atletaKey);
    }
  };

  if (typeof document === 'undefined') return null;

  // Stats calculation
  const storico = atleta?.storicoClassifica || [];
  const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

  let pts = atleta?.anagrafica.punti ?? 0;
  if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
    pts = ultimoSnapshot.punti;
  }
  let initPts = atleta?.riepilogo.puntiIniziali ?? 0;
  if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
    initPts = Math.round(initPts * 1000);
  }

  const pos = ultimoSnapshot?.posizione ?? null;
  const stato = atleta?.anagrafica.stato;
  const record = atleta?.anagrafica.recordClassifica;
  const hasRecord = record && !record.includes('n. il') && record.trim().length > 0;
  const dataAgg = ultimoSnapshot?.data
    ? (ultimoSnapshot.data.includes('-')
      ? ultimoSnapshot.data.split('-').reverse().join('/')
      : ultimoSnapshot.data)
    : null;

  const posText = pos ? `#${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro');
  const posSub = hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Nazionale');

  const allRankingMatches = [
    ...(atleta?.partiteRanking?.campionato || []),
    ...(atleta?.partiteRanking?.tornei || []),
  ];
  let partiteGiocate = atleta?.riepilogo.partiteGiocate ?? 0;
  let partiteVinte = atleta?.riepilogo.partiteVinte ?? 0;
  let partitePerse = atleta?.riepilogo.partitePerse ?? 0;
  let percPositiva = atleta?.riepilogo.percentualePositiva ?? 0;
  let puntiNetto = atleta?.riepilogo.puntiTotali ?? 0;

  if (partiteGiocate === 0 && allRankingMatches.length > 0) {
    partiteGiocate = allRankingMatches.length;
    partiteVinte = allRankingMatches.filter((m) => m.isVittoria).length;
    partitePerse = partiteGiocate - partiteVinte;
    percPositiva = Math.round((partiteVinte / partiteGiocate) * 100);
  } else if (percPositiva === 0 && partiteGiocate > 0 && partiteVinte > 0) {
    percPositiva = Math.round((partiteVinte / partiteGiocate) * 100);
  }

  if (puntiNetto === 0 && atleta?.partiteRanking?.dettaglioPunti) {
    const diff = (atleta.partiteRanking.dettaglioPunti.campionato || 0) + (atleta.partiteRanking.dettaglioPunti.tornei || 0);
    if (diff !== 0) puntiNetto = diff;
  }

  return createPortal(
    <div
      className="modal-backdrop-simple halfatleta-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card-simple halfatleta-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Scheda Ranking FITeT
              </h3>
              <div className="modal-header-subtext">
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaKey) ? atletaKey : 'In risoluzione...')} • Classifica Unica Nazionale
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
        <div className="modal-body-simple" style={{ padding: '18px 20px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-dark)' }}>
                Caricamento riepilogo anagrafico e punti...
              </div>
              <div style={{ fontSize: '12px' }}>Interrogazione in tempo reale di portale.fitet.org</div>
            </div>
          )}

          {error && (
            <div className="modal-error-box">
              <strong>Errore:</strong> {error}
              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    fetchAtleta(atletaKey)
                      .then((data) => {
                        setAtleta(data);
                        setLoading(false);
                      })
                      .catch((e) => {
                        setError(e.message);
                        setLoading(false);
                      });
                  }}
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  Riprova
                </button>
              </div>
            </div>
          )}

          {atleta && !loading && (
            <div>
              {/* Profile Bar */}
              <div className="atleta-profile-bar" style={{ marginBottom: '16px' }}>
                <div className="atleta-profile-photo-wrap">
                  {(() => {
                    const athletePhoto =
                      atleta.anagrafica.fotoUrl ||
                      (atleta.id && /^\d+$/.test(atleta.id)
                        ? `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`
                        : null);
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
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: 'var(--text-dark)',
                      fontFamily: 'var(--font-serif)',
                    }}
                  >
                    {atleta.anagrafica.nome}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <strong>Società:</strong> {atleta.anagrafica.societa || 'N.D.'}{' '}
                    {atleta.anagrafica.regione && `(${atleta.anagrafica.regione})`}
                  </div>

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

                  {/* Status & Category Tags */}
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
                    {atleta.anagrafica.stato && (
                      <span className="badge badge-neutral">{atleta.anagrafica.stato}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4-Column Overview Stats Card */}
              <div className="overview-stats-section" style={{ marginBottom: 0 }}>
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
            </div>
          )}
        </div>

        {/* Footer Bar with "Mostra altri dati" button */}
        <div className="halfatleta-footer-bar">
          <button
            type="button"
            className="btn-action"
            onClick={onClose}
            style={{ padding: '7px 14px', fontSize: '13px' }}
          >
            Chiudi
          </button>
          <button
            type="button"
            className="halfatleta-btn-full"
            onClick={handleOpenFull}
            disabled={loading && !atleta}
            title={`Carica la scheda completa di ${currentAthleteName}`}
          >
            <span>Mostra altri dati</span>
            <i className="bi bi-box-arrow-up-right"></i>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
