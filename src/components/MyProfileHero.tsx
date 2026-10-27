import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAtleta } from '../services/api';
import {
  buildMyProfileSnapshot,
  clearMyPlayer,
  getMyPlayerId,
  getMyPlayerName,
  getMyProfileSnapshot,
  saveMyProfileSnapshot,
  setMyPlayer,
  subscribeToMyProfile,
} from '../utils/myProfile';
import type { MyProfileSnapshot } from '../utils/myProfile';
import { SearchAtletaModal } from './SearchAtletaModal';
import './MyProfileHero.css';

export interface PlayerChampionshipStatus {
  playerId: string | null;
  hasChampionship: boolean;
  loading: boolean;
  athleteName?: string;
}

interface MyProfileHeroProps {
  onOpenAtletaModal: (id: string, name: string) => void;
  onChampionshipDetected?: (championshipId: number) => void;
  onProfileStatusChange?: (status: PlayerChampionshipStatus) => void;
}

const getInitialProfileState = (): {
  id: string | null;
  snapshot: MyProfileSnapshot | null;
} => {
  const id = getMyPlayerId();
  if (!id) return { id: null, snapshot: null };

  const cached = getMyProfileSnapshot(id);
  if (cached) return { id, snapshot: cached };

  const name = getMyPlayerName();
  return {
    id,
    snapshot: name ? { id, name, updatedAt: 0 } : null,
  };
};

const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'AT';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const formatItalianInteger = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const formatRanking = (ranking?: number | null): string => {
  if (typeof ranking !== 'number' || !Number.isFinite(ranking) || ranking <= 0) return '—';
  return `#${formatItalianInteger(ranking)}`;
};

const formatPoints = (points?: number | null): string => {
  if (typeof points !== 'number' || !Number.isFinite(points)) return '—';
  return formatItalianInteger(points);
};

export const MyProfileHero: React.FC<MyProfileHeroProps> = ({
  onOpenAtletaModal,
  onChampionshipDetected,
  onProfileStatusChange,
}) => {
  const [initialProfile] = useState(getInitialProfileState);
  const [playerId, setPlayerId] = useState<string | null>(initialProfile.id);
  const [snapshot, setSnapshot] = useState<MyProfileSnapshot | null>(initialProfile.snapshot);
  const [loading, setLoading] = useState<boolean>(Boolean(initialProfile.id));
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onChampionshipDetectedRef = useRef(onChampionshipDetected);
  const onProfileStatusChangeRef = useRef(onProfileStatusChange);

  useEffect(() => {
    onChampionshipDetectedRef.current = onChampionshipDetected;
  }, [onChampionshipDetected]);

  useEffect(() => {
    onProfileStatusChangeRef.current = onProfileStatusChange;
  }, [onProfileStatusChange]);

  // Initial status notification
  useEffect(() => {
    if (initialProfile.id) {
      onProfileStatusChangeRef.current?.({
        playerId: initialProfile.id,
        hasChampionship: initialProfile.snapshot?.hasChampionship ?? true,
        loading: initialProfile.snapshot?.hasChampionship === undefined,
        athleteName: initialProfile.snapshot?.name,
      });
    } else {
      onProfileStatusChangeRef.current?.({
        playerId: null,
        hasChampionship: false,
        loading: false,
      });
    }
  }, []);

  // Keep the hero in sync if another part of the app sets/removes the profile.
  useEffect(
    () =>
      subscribeToMyProfile(() => {
        const nextId = getMyPlayerId();
        setPlayerId(nextId);

        if (!nextId) {
          setSnapshot(null);
          setLoading(false);
          setError(null);
          onProfileStatusChangeRef.current?.({
            playerId: null,
            hasChampionship: false,
            loading: false,
          });
          return;
        }

        const cached = getMyProfileSnapshot(nextId);
        if (cached) {
          setSnapshot(cached);
          onProfileStatusChangeRef.current?.({
            playerId: nextId,
            hasChampionship: cached.hasChampionship ?? true,
            loading: cached.hasChampionship === undefined,
            athleteName: cached.name,
          });
          return;
        }

        const name = getMyPlayerName();
        if (name) {
          setSnapshot({ id: nextId, name, updatedAt: 0 });
          onProfileStatusChangeRef.current?.({
            playerId: nextId,
            hasChampionship: true,
            loading: true,
            athleteName: name,
          });
        }
      }),
    []
  );

  // Load the official FITeT profile data. The cached snapshot stays visible while refreshing.
  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setPhotoError(false);
    onProfileStatusChangeRef.current?.({
      playerId,
      hasChampionship: snapshot?.hasChampionship ?? true,
      loading: true,
      athleteName: snapshot?.name,
    });

    fetchAtleta(playerId)
      .then((data) => {
        if (!active) return;

        if (data.id && data.id !== playerId) {
          // Resolve aliases to the canonical athlete id, then fetch again with that id.
          setMyPlayer(data.id, data.anagrafica?.nome);
          setPlayerId(data.id);
          return;
        }

        const championshipId = data.campionatoAttuale?.camId;
        const hasChampionship = typeof championshipId === 'number' && championshipId > 0;
        if (hasChampionship) {
          onChampionshipDetectedRef.current?.(championshipId);
        }

        const freshSnapshot = buildMyProfileSnapshot(data);
        setSnapshot(freshSnapshot);
        saveMyProfileSnapshot(freshSnapshot);

        onProfileStatusChangeRef.current?.({
          playerId: data.id || playerId,
          hasChampionship,
          loading: false,
          athleteName: freshSnapshot.name,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : 'Impossibile caricare i dati del profilo.';
        setError(message);
        onProfileStatusChangeRef.current?.({
          playerId,
          hasChampionship: snapshot?.hasChampionship ?? false,
          loading: false,
          athleteName: snapshot?.name,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [playerId, retryNonce]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const photoUrl = useMemo(() => {
    if (!snapshot || photoError) return null;
    return (
      snapshot.fotoUrl ||
      `https://portale.fitet.org/images/atleti/${encodeURIComponent(snapshot.id)}.jpg`
    );
  }, [snapshot, photoError]);

  const initials = snapshot ? getInitials(snapshot.name) : 'AT';
  const rankingLabel = formatRanking(snapshot?.ranking);
  const pointsLabel = formatPoints(snapshot?.punti);
  const form = snapshot?.form || [];
  const wins = form.filter((match) => match.esito === 'V').length;
  const losses = form.length - wins;
  const hasPoints = Boolean(snapshot && snapshot.punti !== null && snapshot.punti !== undefined);
  const hasRanking = typeof snapshot?.ranking === 'number' && snapshot.ranking > 0;

  const handleOpenAthlete = () => {
    if (!snapshot || !playerId) return;
    onOpenAtletaModal(snapshot.id, snapshot.name);
  };

  const handleChangeProfile = () => {
    setIsMenuOpen(false);
    setIsSearchOpen(true);
  };

  const handleRemoveProfile = () => {
    setIsMenuOpen(false);
    clearMyPlayer();
    setSnapshot(null);
    setPlayerId(null);
    setLoading(false);
    setError(null);
  };

  const handleSelectProfile = (id: string, name: string) => {
    setMyPlayer(id, name);
    setPlayerId(id);
    setSnapshot(getMyProfileSnapshot(id) || { id, name, updatedAt: Date.now() });
    setLoading(true);
    setError(null);
    setPhotoError(false);
  };

  const handleRetry = () => {
    setRetryNonce((value) => value + 1);
  };

  return (
    <section className="my-profile-section" aria-label="Il mio profilo">
      {!playerId ? (
        <div className="my-profile-empty" aria-labelledby="my-profile-empty-title">
          <div className="my-profile-empty-main">
            <div className="my-profile-empty-copy">
              <span className="my-profile-empty-eyebrow">
                Il mio profilo
              </span>
              <h2 id="my-profile-empty-title" className="my-profile-empty-title">
                Sei un atleta tesserato?
              </h2>
              <p className="my-profile-empty-text">
                Fissa la tua scheda qui per accedere subito ai tuoi punti e campionati.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="my-profile-empty-btn"
            onClick={() => setIsSearchOpen(true)}
          >
            <i className="bi bi-search"></i>
            <span>Cerca e imposta il tuo profilo</span>
            <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      ) : error && !snapshot ? (
        <div className="my-profile-state" role="alert">
          <div className="my-profile-state-icon" aria-hidden="true">
            <i className="bi bi-cloud-slash"></i>
          </div>
          <div className="my-profile-state-copy">
            <span className="my-profile-state-eyebrow">Il mio profilo</span>
            <h2 className="my-profile-state-title">Profilo non disponibile</h2>
            <p className="my-profile-state-text">
              Non riusciamo a recuperare i dati FITeT in questo momento. Puoi riprovare o scegliere
              un altro atleta.
            </p>
          </div>
          <div className="my-profile-state-actions">
            <button type="button" className="my-profile-state-btn is-primary" onClick={handleRetry}>
              <i className="bi bi-arrow-clockwise"></i>
              Riprova
            </button>
            <button type="button" className="my-profile-state-btn" onClick={handleChangeProfile}>
              <i className="bi bi-pencil-square"></i>
              Cambia atleta
            </button>
          </div>
        </div>
      ) : !snapshot ? (
        <div
          className="my-profile-hero my-profile-hero--skeleton"
          aria-busy="true"
          aria-label="Caricamento del profilo"
        >
          <div className="my-profile-hero-bg" aria-hidden="true"></div>
          <div className="my-profile-hero-overlay" aria-hidden="true"></div>
          <div className="my-profile-hero-content">
            <div className="my-profile-hero-top">
              <span className="my-profile-skeleton my-profile-skeleton-pill"></span>
              <span className="my-profile-skeleton my-profile-skeleton-icon"></span>
            </div>
            <div className="my-profile-hero-identity">
              <span className="my-profile-skeleton my-profile-skeleton-name"></span>
              <span className="my-profile-skeleton my-profile-skeleton-sub"></span>
            </div>
            <div className="my-profile-hero-data">
              <span className="my-profile-skeleton my-profile-skeleton-metric"></span>
              <span className="my-profile-skeleton my-profile-skeleton-metric"></span>
              <span className="my-profile-skeleton my-profile-skeleton-metric"></span>
            </div>
          </div>
        </div>
      ) : (
        <article
          className={`my-profile-hero ${loading ? 'is-refreshing' : ''}`}
          onClick={handleOpenAthlete}
          aria-busy={loading}
        >
          <div className="my-profile-hero-bg" aria-hidden="true">
            {photoUrl ? (
              <>
                <img
                  className="my-profile-hero-photo-blur"
                  src={photoUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
                <div className="my-profile-hero-portrait">
                  <img
                    src={photoUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoError(true)}
                  />
                </div>
              </>
            ) : (
              <div className="my-profile-hero-fallback">
                <span className="my-profile-hero-fallback-initials">{initials}</span>
                <i className="bi bi-person-fill"></i>
              </div>
            )}
          </div>
          <div className="my-profile-hero-overlay" aria-hidden="true"></div>

          <button
            type="button"
            className="my-profile-hero-open-area"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenAthlete();
            }}
            aria-label={`Apri la scheda completa di ${snapshot.name}`}
          ></button>

          <div className="my-profile-hero-content">
            <div className="my-profile-hero-top">
              <span className="my-profile-hero-badge">
                <i className="bi bi-person-badge" aria-hidden="true"></i>
                <span>Il mio profilo</span>
              </span>

              <div
                className="my-profile-hero-actions"
                ref={menuRef}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="my-profile-hero-icon-btn"
                  onClick={() => setIsMenuOpen((open) => !open)}
                  aria-label="Opzioni del profilo"
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  aria-controls="my-profile-hero-menu"
                  title="Opzioni profilo"
                >
                  <i className="bi bi-three-dots"></i>
                </button>

                {isMenuOpen && (
                  <div
                    id="my-profile-hero-menu"
                    className="my-profile-hero-menu"
                    role="menu"
                  >
                    <span className="my-profile-hero-menu-label">Profilo atleta</span>
                    <button
                      type="button"
                      className="my-profile-hero-menu-item"
                      role="menuitem"
                      onClick={handleChangeProfile}
                    >
                      <i className="bi bi-pencil-square" aria-hidden="true"></i>
                      <span>Cambia atleta</span>
                    </button>
                    <button
                      type="button"
                      className="my-profile-hero-menu-item is-danger"
                      role="menuitem"
                      onClick={handleRemoveProfile}
                    >
                      <i className="bi bi-trash3" aria-hidden="true"></i>
                      <span>Rimuovi profilo</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="my-profile-hero-identity">
              <h2 className="my-profile-hero-name">{snapshot.name}</h2>
              <p className="my-profile-hero-club">
                <i className="bi bi-building" aria-hidden="true"></i>
                <span>{snapshot.squadra || `Tessera #${snapshot.id}`}</span>
              </p>
            </div>

            <div className="my-profile-hero-data">
              <div className="my-profile-hero-stats">
                <div className="my-profile-hero-metric">
                  <span className="my-profile-hero-metric-label">Ranking</span>
                  {hasRanking || !loading ? (
                    <strong className="my-profile-hero-metric-value">{rankingLabel}</strong>
                  ) : (
                    <span className="my-profile-skeleton my-profile-skeleton-value"></span>
                  )}
                </div>

                <div className="my-profile-hero-metric">
                  <span className="my-profile-hero-metric-label">Punti</span>
                  {hasPoints || !loading ? (
                    <strong className="my-profile-hero-metric-value">
                      {pointsLabel}
                      {hasPoints && <span className="my-profile-hero-metric-unit"> pt</span>}
                    </strong>
                  ) : (
                    <span className="my-profile-skeleton my-profile-skeleton-value"></span>
                  )}
                </div>

                <div className="my-profile-hero-metric">
                  <span className="my-profile-hero-metric-label">Categoria</span>
                  {snapshot.categoria || !loading ? (
                    <strong className="my-profile-hero-metric-value">
                      {snapshot.categoria || '—'}
                    </strong>
                  ) : (
                    <span className="my-profile-skeleton my-profile-skeleton-value"></span>
                  )}
                </div>
              </div>

              <div className="my-profile-hero-form">
                <span
                  className="my-profile-hero-metric-label"
                  title="Ultimi incontri, dal meno recente al più recente"
                >
                  Forma recente
                </span>
                {form.length > 0 ? (
                  <div
                    className="my-profile-hero-form-badges"
                    aria-label={`Forma recente: ${wins} ${
                      wins === 1 ? 'vittoria' : 'vittorie'
                    } e ${losses} ${losses === 1 ? 'sconfitta' : 'sconfitte'}`}
                  >
                    {form.map((match, index) => (
                      <span
                        key={`${match.data}-${match.avversario}-${index}`}
                        className={`my-profile-hero-form-badge ${
                          match.esito === 'V' ? 'is-win' : 'is-loss'
                        } ${index === form.length - 1 ? 'is-latest' : ''}`}
                        title={`${match.esito === 'V' ? 'Vittoria' : 'Sconfitta'} vs ${
                          match.avversario
                        }${match.data ? ` · ${match.data}` : ''}`}
                        aria-label={`${match.esito === 'V' ? 'Vittoria' : 'Sconfitta'} contro ${
                          match.avversario
                        }`}
                      >
                        {match.esito}
                      </span>
                    ))}
                  </div>
                ) : loading ? (
                  <div className="my-profile-hero-form-badges" aria-hidden="true">
                    <span className="my-profile-skeleton my-profile-skeleton-dot"></span>
                    <span className="my-profile-skeleton my-profile-skeleton-dot"></span>
                    <span className="my-profile-skeleton my-profile-skeleton-dot"></span>
                    <span className="my-profile-skeleton my-profile-skeleton-dot"></span>
                    <span className="my-profile-skeleton my-profile-skeleton-dot"></span>
                  </div>
                ) : (
                  <span className="my-profile-hero-form-empty">Nessun incontro recente</span>
                )}
              </div>
            </div>
          </div>
        </article>
      )}

      <SearchAtletaModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        title="Imposta il tuo profilo"
        subtitle="Cerca il tuo nome tra gli atleti tesserati FITeT"
        onSelectAthlete={handleSelectProfile}
      />
    </section>
  );
};
