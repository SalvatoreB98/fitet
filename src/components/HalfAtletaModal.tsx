import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite } from '../services/api';
import { MarqueeText } from './MarqueeText';
import { TeamLogo } from './TeamLogo';
import { recordAndGetAthleteViews } from '../utils/athleteViews';
import { useFavoriteAthletes, saveFavoriteAthlete } from '../utils/favorites';
import { aggregateAthleteMatchStats } from '../utils/aggregateAthleteStats';
import { isValidAthleteHistoryName } from '../utils/history';
import { AthleteNotFoundState } from './AthleteNotFoundState';

export interface HalfAtletaModalProps {
  atletaKey: string;
  athleteName?: string;
  onClose: () => void;
  onOpenFullModal: (resolvedId: string, name: string) => void;
  onOpenSociety?: (societyName: string) => void;
}

export const HalfAtletaModal: React.FC<HalfAtletaModalProps> = ({
  atletaKey,
  athleteName,
  onClose,
  onOpenFullModal,
  onOpenSociety,
}) => {
  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [campionatoPartite, setCampionatoPartite] = useState<PartitaCampionatoAtleta[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [imgError, setImgError] = useState<boolean>(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const lastTrackedKeyRef = useRef<string | null>(null);

  // Actions state (Favorite, Copy Link, Share)
  const { isFavorite, toggleFavorite } = useFavoriteAthletes();
  const [copied, setCopied] = useState<boolean>(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const shareMenuRef = useRef<HTMLDivElement>(null);

  // Scroll reveal state for header (shows photo & name when hero is scrolled past)
  const [isScrolledPastHero, setIsScrolledPastHero] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const handleCardScroll = useCallback(() => {
    if (heroRef.current && headerRef.current) {
      const heroRect = heroRef.current.getBoundingClientRect();
      const headerRect = headerRef.current.getBoundingClientRect();
      const isPast = heroRect.bottom <= headerRect.bottom + 12;
      setIsScrolledPastHero(isPast);
    } else if (cardRef.current) {
      setIsScrolledPastHero(cardRef.current.scrollTop > 120);
    }
  }, []);

  useEffect(() => {
    setIsScrolledPastHero(false);
    if (cardRef.current) {
      cardRef.current.scrollTop = 0;
    }
  }, [atletaKey]);

  const currentAtletaId = atleta?.id || atletaKey;
  const currentAthleteName = atleta?.anagrafica?.nome || athleteName || 'Atleta';
  const isFav = isFavorite(currentAtletaId) || isFavorite(currentAthleteName);

  // Share URL & handler
  const sharePlayerId = atleta?.id || atletaKey;
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/player/${encodeURIComponent(sharePlayerId)}`
    : `/player/${encodeURIComponent(sharePlayerId)}`;

  // Close share popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setIsShareMenuOpen(false);
      }
    };
    if (isShareMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isShareMenuOpen]);

  // Load data
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setAtleta(null);
    setError(null);
    setNotFound(false);
    setImgError(false);
    setCampionatoPartite(null);

    fetchAtleta(atletaKey)
      .then((data) => {
        if (!isMounted) return;
        const isHollow = !data || !isValidAthleteHistoryName(data.anagrafica?.nome, data.id || atletaKey);
        if (isHollow) {
          setAtleta(null);
          setNotFound(true);
          setError(null);
          setLoading(false);
          return;
        }
        if (isMounted) {
          setAtleta(data);
          setNotFound(false);
          setLoading(false);

          const knownCamIds = Array.from(
            new Set([
              ...(data.campionatiGiocati || []).map((c) => String(c.camId)),
              ...(data.campionatoAttuale?.camId ? [String(data.campionatoAttuale.camId)] : []),
            ])
          ).filter(Boolean);

          if (knownCamIds.length > 0) {
            Promise.all(
              knownCamIds.map((cId) =>
                fetchAtletaCampionatoPartite(
                  data.id || atletaKey,
                  cId,
                  undefined,
                  data.anagrafica?.nome,
                  false,
                  data.anagrafica?.regione
                ).catch(() => null)
              )
            ).then((results) => {
              if (!isMounted) return;
              const merged: PartitaCampionatoAtleta[] = [];
              for (const res of results) {
                if (res && res.matches && res.matches.length > 0) {
                  merged.push(...res.matches);
                }
              }
              setCampionatoPartite(merged);
            });
          } else {
            fetchAtletaCampionatoPartite(
              data.id || atletaKey,
              'auto',
              undefined,
              data.anagrafica?.nome,
              false,
              data.anagrafica?.regione
            )
              .then((autoRes) => {
                if (!isMounted) return;
                if (autoRes && autoRes.matches && autoRes.matches.length > 0) {
                  setCampionatoPartite(autoRes.matches);
                }
              })
              .catch(() => { });
          }

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
          if (err?.notFound || err?.status === 404) {
            setAtleta(null);
            setNotFound(true);
            setError(null);
          } else {
            setError(err.message || 'Impossibile recuperare i dati dell\'atleta');
          }
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [atletaKey]);

  // Track Views only for existing athletes with a resolved name
  useEffect(() => {
    if (!atleta || notFound || !isValidAthleteHistoryName(atleta.anagrafica?.nome, atleta.id)) {
      return;
    }
    const key = (atleta.id || atletaKey || '').toLowerCase().trim();
    if (!key) return;

    if (lastTrackedKeyRef.current === key) return;
    lastTrackedKeyRef.current = key;

    const v = recordAndGetAthleteViews(key, (serverViews) => {
      setViewsCount(serverViews);
    });
    setViewsCount(v);
  }, [atleta, notFound, atletaKey]);

  const handleRetry = () => {
    setError(null);
    setNotFound(false);
    setRetrying(true);
    setLoading(true);
    fetchAtleta(atletaKey, true)
      .then((data) => {
        const isHollow = !data || !isValidAthleteHistoryName(data.anagrafica?.nome, data.id || atletaKey);
        if (isHollow) {
          setAtleta(null);
          setNotFound(true);
        } else {
          setAtleta(data);
          setNotFound(false);
        }
      })
      .catch((e) => {
        if (e?.notFound || e?.status === 404) {
          setAtleta(null);
          setNotFound(true);
          setError(null);
        } else {
          setError(e.message || 'Impossibile recuperare i dati dell\'atleta');
        }
      })
      .finally(() => {
        setRetrying(false);
        setLoading(false);
      });
  };

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

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setToastMessage('Link copiato negli appunti!');
      setShowToast(true);
      setTimeout(() => setCopied(false), 2400);
      setTimeout(() => setShowToast(false), 2400);
      setIsShareMenuOpen(false);
    } catch (err) {
      console.error('Errore copia link:', err);
    }
  };

  const handleShareWhatsApp = () => {
    const name = atleta?.anagrafica?.nome || athleteName || 'Atleta';
    const club = atleta?.anagrafica?.societa || '';
    const cat = atleta?.anagrafica?.categoria ? `${atleta.anagrafica.categoria}ª Categoria` : '';
    let msg = `🏓 *${name}*`;
    if (cat) msg += ` (${cat})`;
    if (club) msg += `\nSocietà: ${club}`;
    if (pts) msg += `\n⭐ Punti: ${pts.toLocaleString('it-IT')}`;
    msg += `\n\nVisualizza profilo:\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    setIsShareMenuOpen(false);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        const name = atleta?.anagrafica?.nome || athleteName || 'Atleta';
        await navigator.share({
          title: `${name} - Scheda FITeT`,
          text: `Scheda atleta di ${name}:`,
          url: shareUrl,
        });
        setIsShareMenuOpen(false);
      } catch {
        // User cancelled
      }
    } else {
      handleShareWhatsApp();
    }
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

  const aggregatedStats = aggregateAthleteMatchStats(
    atleta,
    campionatoPartite,
    atleta?.campionatoAttuale?.nome
  );
  const partiteGiocate = aggregatedStats.partiteGiocate;
  const partiteVinte = aggregatedStats.partiteVinte;
  const partitePerse = aggregatedStats.partitePerse;
  const percPositiva = aggregatedStats.percentualePositiva;
  let puntiNetto = atleta?.riepilogo.puntiTotali ?? 0;

  if (puntiNetto === 0 && atleta?.partiteRanking?.dettaglioPunti) {
    const diff = (atleta.partiteRanking.dettaglioPunti.campionato || 0) + (atleta.partiteRanking.dettaglioPunti.tornei || 0);
    if (diff !== 0) puntiNetto = diff;
  }

  // Format category badge: e.g. "6" or "6ª Categoria" -> "6^"
  const formatCategoryPill = (cat?: string) => {
    if (!cat) return null;
    const trimmed = cat.trim();
    const match = trimmed.match(/^(\d+)/);
    if (match) return `${match[1]}^`;
    return trimmed;
  };

  // Format match subtext: e.g. "Tornei: 3 - Camp: 6V-2P"
  const formatPartiteSub = () => {
    if (aggregatedStats.campionatoGiocate > 0 || aggregatedStats.torneiGiocate > 0) {
      const parts: string[] = [];
      if (aggregatedStats.torneiGiocate > 0) {
        parts.push(`Tornei: ${aggregatedStats.torneiGiocate}`);
      }
      if (aggregatedStats.campionatoGiocate > 0) {
        parts.push(`Camp: ${aggregatedStats.campionatoVinte}V-${aggregatedStats.campionatoPerse}P`);
      }
      return parts.join(' - ');
    }
    return `Perse: ${partitePerse}`;
  };

  const athletePhoto =
    atleta?.anagrafica?.fotoUrl ||
    (atleta?.id && /^\d+$/.test(atleta.id)
      ? `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`
      : null);

  return createPortal(
    <div
      className="modal-backdrop-simple halfatleta-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={cardRef}
        className="modal-card-simple halfatleta-modal-card"
        onClick={(e) => e.stopPropagation()}
        onScroll={handleCardScroll}
        style={{ position: 'relative' }}
      >
        {/* Toast Notification */}
        {showToast && (
          <div className="athlete-share-toast" role="status">
            <i className="bi bi-check-circle-fill me-2 text-success"></i>
            {toastMessage}
          </div>
        )}

        {/* Sticky Header revealed on scroll */}
        <div
          ref={headerRef}
          className={`modal-header-simple atleta-modal-header ${isScrolledPastHero ? 'is-scrolled' : 'is-dissolved'}`}
        >
          <div className="modal-header-athlete-identity">
            {athletePhoto && !imgError ? (
              <img
                src={athletePhoto}
                alt={atleta?.anagrafica?.nome || athleteName || 'Atleta'}
                className="modal-header-athlete-thumb"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="modal-header-athlete-initials" aria-hidden="true" />
            )}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {atleta?.anagrafica?.nome || athleteName || 'Scheda Ranking FITeT'}
              </h3>
              <div className="modal-header-subtext">
                {atleta?.anagrafica?.societa ? `${atleta.anagrafica.societa} • ` : ''}
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaKey) ? atletaKey : 'N.D.')}
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
        <div className="modal-body-simple" style={{ padding: '22px 24px' }}>
          {/* Top Action Bar (Star, Copy Link, Share, Close X) */}
          <div className="athlete-spotlight-top-bar">
            {atleta && !notFound && !error && (
              <>
                <div className="athlete-spotlight-top-actions">
                  {/* 1. Favorite / Star Button */}
                  <button
                    type="button"
                    className={`athlete-spotlight-action-btn btn-star ${isFav ? 'is-favorited' : ''}`}
                    onClick={handleToggleFavorite}
                    title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    disabled={loading && !atleta}
                  >
                    <i className={isFav ? 'bi bi-star-fill' : 'bi bi-star'}></i>
                  </button>

                  {/* 2. Copy Link Button */}
                  <button
                    type="button"
                    className={`athlete-spotlight-action-btn btn-copy ${copied ? 'is-copied' : ''}`}
                    onClick={handleCopyLink}
                    title={copied ? 'Link Copiato!' : 'Copia link profilo condivisibile'}
                    aria-label="Copia link profilo"
                    disabled={loading && !atleta}
                  >
                    <i className={copied ? 'bi bi-check2' : 'bi bi-link-45deg'}></i>
                  </button>

                  {/* 3. Share Button with Popover */}
                  <div className="position-relative" ref={shareMenuRef}>
                    <button
                      type="button"
                      className={`athlete-spotlight-action-btn btn-share ${isShareMenuOpen ? 'is-open' : ''}`}
                      onClick={() => setIsShareMenuOpen((prev) => !prev)}
                      title="Condividi scheda atleta"
                      aria-label="Condividi scheda atleta"
                      disabled={loading && !atleta}
                    >
                      <i className="bi bi-share-fill"></i>
                    </button>

                    {isShareMenuOpen && (
                      <div className="athlete-share-popover">
                        <div className="athlete-share-popover-header">
                          <span>Condividi Scheda</span>
                          <button
                            type="button"
                            className="btn-close-popover"
                            onClick={() => setIsShareMenuOpen(false)}
                            aria-label="Chiudi"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                        <div className="athlete-share-url-box">
                          <span className="athlete-share-url-text">{shareUrl}</span>
                        </div>
                        <div className="athlete-share-actions">
                          <button
                            type="button"
                            className="athlete-share-action-btn btn-whatsapp"
                            onClick={handleShareWhatsApp}
                          >
                            <i className="bi bi-whatsapp me-2" style={{ fontSize: '16px' }}></i>
                            <span>Invia su WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            className="athlete-share-action-btn btn-copy-link"
                            onClick={handleCopyLink}
                          >
                            <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-link-45deg'} me-2`} style={{ fontSize: '16px' }}></i>
                            <span>{copied ? 'Link Copiato!' : 'Copia Link Diretto'}</span>
                          </button>
                          {typeof navigator !== 'undefined' && 'share' in navigator && (
                            <button
                              type="button"
                              className="athlete-share-action-btn btn-native-share"
                              onClick={handleNativeShare}
                            >
                              <i className="bi bi-box-arrow-up me-2" style={{ fontSize: '14px' }}></i>
                              <span>Altre opzioni...</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <span className="athlete-spotlight-top-divider" aria-hidden="true" />
              </>
            )}

            {/* Close Button X */}
            <button
              type="button"
              className="athlete-spotlight-action-btn btn-close-modal"
              style={!atleta || notFound || error ? { marginLeft: 'auto' } : undefined}
              onClick={onClose}
              title="Chiudi finestra (ESC)"
              aria-label="Chiudi finestra"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-dark)' }}>
                Caricamento profilo atleta...
              </div>
              <div style={{ fontSize: '12px' }}>Interrogazione in tempo reale di portale.fitet.org</div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="modal-error-box">
              <strong>Errore:</strong> {error}
              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-action"
                  onClick={handleRetry}
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                >
                  Riprova
                </button>
              </div>
            </div>
          )}

          {/* Not Found State */}
          {notFound && !loading && (
            <AthleteNotFoundState
              atletaId={atletaKey}
              onClose={onClose}
              onRetry={handleRetry}
              retrying={retrying}
            />
          )}

          {/* Loaded Athlete Spotlight Card */}
          {atleta && !loading && (
            <div className="athlete-spotlight-layout">
              {/* Left Column (Desktop) / Top Centered (Mobile): Photo */}
              <div className="athlete-spotlight-photo-wrap">
                {!imgError && athletePhoto ? (
                  <img
                    src={athletePhoto}
                    alt={atleta.anagrafica.nome}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span className="athlete-spotlight-initials">
                    {atleta.anagrafica.nome.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Right Column (Desktop) / Centered Column (Mobile): Info + Stats */}
              <div className="athlete-spotlight-main-col">
                <div className="athlete-spotlight-info-block" ref={heroRef}>
                  {/* Athlete Name (Bold Uppercase) */}
                  <h2 className="athlete-spotlight-name">
                    {atleta.anagrafica.nome}
                  </h2>

                  {/* Society & Region */}
                  <div className="athlete-spotlight-club-wrap">
                    <div className="athlete-spotlight-club-row">
                      {atleta.anagrafica.societa && onOpenSociety ? (
                        <button
                          type="button"
                          className="athlete-spotlight-club-btn"
                          onClick={() => onOpenSociety(atleta.anagrafica.societa)}
                          title={`Apri scheda società ${atleta.anagrafica.societa}`}
                        >
                          <span>{atleta.anagrafica.societa}</span>
                          <TeamLogo
                            teamName={atleta.anagrafica.societa}
                            logoUrl={atleta.anagrafica.logoUrl}
                            className="athlete-spotlight-team-logo"
                          />
                        </button>
                      ) : (
                        <span className="athlete-spotlight-club-text">
                          {atleta.anagrafica.societa || 'N.D.'}
                          {atleta.anagrafica.societa && (
                            <TeamLogo
                              teamName={atleta.anagrafica.societa}
                              logoUrl={atleta.anagrafica.logoUrl}
                              className="athlete-spotlight-team-logo"
                            />
                          )}
                        </span>
                      )}
                    </div>
                    {atleta.anagrafica.regione && (
                      <div className="athlete-spotlight-region">
                        ({atleta.anagrafica.regione})
                      </div>
                    )}
                  </div>

                  {/* Badges & Meta Row */}
                  <div className="athlete-spotlight-meta-row">
                    {atleta.anagrafica.categoria && (
                      <span className="athlete-spotlight-pill">
                        {formatCategoryPill(atleta.anagrafica.categoria)}
                      </span>
                    )}
                    {atleta.anagrafica.settore && (
                      <span className="athlete-spotlight-pill">
                        {atleta.anagrafica.settore}
                      </span>
                    )}
                    {(atleta.anagrafica.categoria || atleta.anagrafica.settore) && (atleta.anagrafica.dataNascita || viewsCount > 0) && (
                      <span className="athlete-spotlight-divider" aria-hidden="true" />
                    )}
                    {atleta.anagrafica.dataNascita && (
                      <span className="athlete-spotlight-meta-item">
                        <i className="bi bi-calendar3 me-1"></i>
                        <span className="athlete-spotlight-born-prefix">Nato/a il&nbsp;</span>
                        {atleta.anagrafica.dataNascita}
                      </span>
                    )}
                    {atleta.anagrafica.dataNascita && viewsCount > 0 && (
                      <span className="athlete-spotlight-bullet athlete-spotlight-meta-sep" aria-hidden="true">•</span>
                    )}
                    {viewsCount > 0 && (
                      <span className="athlete-spotlight-meta-item" title={`${viewsCount.toLocaleString('it-IT')} visite reali del profilo`}>
                        <i className="bi bi-eye me-1"></i>
                        {viewsCount.toLocaleString('it-IT')} {viewsCount === 1 ? 'visita' : 'visite'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Column Overview Stats Card */}
                <div className="overview-stats-card athlete-spotlight-stats-card">
                  <div className="overview-stats-row">
                    {/* 1. Posizione */}
                    <div className="overview-stat-col" title={`Posizione attuale: ${posText} (${posSub})`}>
                      <span className="overview-stat-label">POSIZIONE</span>
                      <MarqueeText className="overview-stat-value" text={posText} />
                      <MarqueeText className="overview-stat-sub" text={posSub} />
                    </div>

                    <div className="overview-stat-divider" aria-hidden="true" />

                    {/* 2. Punti Rank */}
                    <div className="overview-stat-col" title={`Punti attuali: ${pts} pt (Iniziali: ${initPts} pt)`}>
                      <span className="overview-stat-label">PUNTI RANK</span>
                      <MarqueeText className="overview-stat-value" text={pts.toLocaleString('it-IT')} />
                      <MarqueeText className="overview-stat-sub" text={`Iniziali: ${initPts.toLocaleString('it-IT')}`} />
                    </div>

                    <div className="overview-stat-divider" aria-hidden="true" />

                    {/* 3. Partite V/G */}
                    <div className="overview-stat-col" title={`Partite vinte: ${partiteVinte}, giocate: ${partiteGiocate}, perse: ${partitePerse}`}>
                      <span className="overview-stat-label">PARTITE V/G</span>
                      <MarqueeText className="overview-stat-value">
                        {partiteVinte} <span className="overview-stat-slash">/</span> {partiteGiocate}
                      </MarqueeText>
                      <MarqueeText className="overview-stat-sub" text={formatPartiteSub()} />
                    </div>

                    <div className="overview-stat-divider" aria-hidden="true" />

                    {/* 4. % Vittorie */}
                    <div className="overview-stat-col" title={`% Vittorie: ${percPositiva}%, Guadagno netto: ${puntiNetto} pt`}>
                      <span className="overview-stat-label">% VITTORIE</span>
                      <MarqueeText className="overview-stat-value text-accent-green" text={`${percPositiva}%`} />
                      <MarqueeText
                        className="overview-stat-sub text-accent-green"
                        text={puntiNetto > 0 ? `+${puntiNetto} pt netti` : `${puntiNetto} pt netti`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar with "Mostra altri dati" button */}
        {!notFound && !error && (
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
        )}
      </div>
    </div>,
    document.body
  );
};
