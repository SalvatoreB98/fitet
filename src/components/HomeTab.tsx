import React, { useMemo, useEffect, useRef, useState } from 'react';
import { ChampionshipItem, DashboardData } from '../types/fitet';
import {
  useFavoriteAthletes,
  useFavoriteChampionships,
  saveFavoriteAthlete,
  FavoriteAthlete,
} from '../utils/favorites';
import { useRecentHistory } from '../utils/history';
import { fetchAtleta } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { SearchAtletaModal } from './SearchAtletaModal';
import { HeadToHeadModal } from './HeadToHeadModal';
import { HeadToHeadPickerModal } from './HeadToHeadPickerModal';
import type { HeadToHeadPlayer } from './HeadToHeadPickerModal';
import { MyProfileHero } from './MyProfileHero';
import type { PlayerChampionshipStatus } from './MyProfileHero';
import { getMyPlayerId, getMyProfileSnapshot } from '../utils/myProfile';
import { MarqueeText } from './MarqueeText';
import {
  SERIE_CONFIGS,
  getChampionshipSerieKey,
  cleanChampionshipCardName,
} from '../utils/championshipUtils';
import './HomeTab.css';

interface HomeTabProps {
  currentCamId: number | null;
  annoId: number;
  currentChampionship?: {
    nome: string;
    regione: string;
    categoria?: string;
  };
  campionati: ChampionshipItem[];
  isLoadingCampionati?: boolean;
  onSelectChampionship: (camId: number, annoId?: number) => void;
  onAutoSelectProfileChampionship: (camId: number) => void;
  onNavigateTab: (tab: 'home' | 'classifica' | 'calendario' | 'statistiche' | 'cercaAtleta') => void;
  onOpenChampionshipModal: () => void;
  onOpenAtletaModal: (id: string, name: string) => void;
  dashboardData?: DashboardData | null;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  currentCamId,
  annoId,
  currentChampionship,
  campionati,
  onSelectChampionship,
  onAutoSelectProfileChampionship,
  onNavigateTab,
  onOpenChampionshipModal,
  onOpenAtletaModal,
}) => {
  const {
    favorites: favoriteAthletes,
    favoritesCount: athletesCount,
    removeFavorite: removeAthleteFavorite,
    isFavorite: isFavoriteAthlete,
    toggleFavorite: toggleAthleteFavorite,
  } = useFavoriteAthletes();

  const {
    favoriteIds: favoriteChampIds,
    favoritesCount: champCount,
    cachedMeta,
    isFavorite: isFavoriteChamp,
    toggleFavorite: toggleChampFavorite,
    removeFavorite: removeChampFavorite,
  } = useFavoriteChampionships();

  const {
    recentAthletes,
    recentChampionships,
    clearAthletes,
    clearChampionships,
    removeAthlete,
    removeChampionship,
  } = useRecentHistory();

  // Stato campionato atleta configurato nel profilo
  const [profileStatus, setProfileStatus] = useState<PlayerChampionshipStatus>(() => {
    const id = getMyPlayerId();
    if (!id) return { playerId: null, hasChampionship: false, loading: false };
    const snap = getMyProfileSnapshot(id);
    return {
      playerId: id,
      hasChampionship: snap?.hasChampionship ?? true,
      loading: !snap || snap.hasChampionship === undefined,
      athleteName: snap?.name,
    };
  });

  // Modale Cerca Atleta
  const [isSearchAtletaModalOpen, setIsSearchAtletaModalOpen] = useState(false);

  // Modale Testa a Testa (selezione due atleti + storico FITeT)
  const [isH2hPickerOpen, setIsH2hPickerOpen] = useState(false);
  const [h2hPlayers, setH2hPlayers] = useState<{
    player1: HeadToHeadPlayer;
    player2: HeadToHeadPlayer;
  } | null>(null);

  const handleOpenH2hPicker = () => {
    setH2hPlayers(null);
    setIsH2hPickerOpen(true);
  };

  // Sincronizza in background i dati dei preferiti con l'ultimo snapshot ufficiale
  const syncedRef = useRef<boolean>(false);
  useEffect(() => {
    if (favoriteAthletes.length === 0 || syncedRef.current) return;
    syncedRef.current = true;

    favoriteAthletes.forEach((fav) => {
      if (!fav.id || !/^\d+$/.test(fav.id)) return;
      fetchAtleta(fav.id)
        .then((data) => {
          const storico = data.storicoClassifica || [];
          const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
          const rankingReale = ultimoSnapshot?.posizione ?? undefined;
          const puntiReali = data.anagrafica.punti || ultimoSnapshot?.punti || undefined;
          const catReale = data.anagrafica.categoria || ultimoSnapshot?.categoria || undefined;

          if (
            (rankingReale !== undefined && rankingReale !== fav.ranking) ||
            (puntiReali !== undefined && puntiReali !== fav.punti) ||
            (catReale !== undefined && catReale !== fav.categoria) ||
            (!fav.squadra && data.anagrafica.societa)
          ) {
            saveFavoriteAthlete({
              id: data.id,
              name: data.anagrafica.nome,
              squadra: data.anagrafica.societa || fav.squadra,
              ranking: rankingReale ?? fav.ranking,
              punti: puntiReali ?? fav.punti,
              categoria: catReale ?? fav.categoria,
              dataNascita: data.anagrafica.dataNascita || fav.dataNascita,
              fotoUrl: data.anagrafica.fotoUrl || fav.fotoUrl,
            });
          }
        })
        .catch(() => { });
    });
  }, [favoriteAthletes]);

  // Campionati preferiti risolti con metadata
  const resolvedFavoriteChampionships = useMemo(() => {
    return favoriteChampIds
      .map((id) => {
        const foundInCatalog = campionati.find((c) => c.id === id);
        if (foundInCatalog) return foundInCatalog;
        const cached = cachedMeta[id];
        if (cached) {
          return {
            id,
            nome: cached.nome,
            regione: cached.regione,
            categoria: cached.categoria,
            anno: cached.anno || 41,
          } as ChampionshipItem;
        }
        return null;
      })
      .filter((c): c is ChampionshipItem => c !== null);
  }, [favoriteChampIds, campionati, cachedMeta]);

  // Campionato attualmente attivo (selezionato)
  const activeChampionship = useMemo(() => {
    if (currentChampionship && currentCamId) {
      return {
        id: currentCamId,
        nome: currentChampionship.nome,
        regione: currentChampionship.regione,
        categoria: currentChampionship.categoria,
        anno: annoId,
      } as ChampionshipItem;
    }
    if (currentCamId) {
      const found = campionati.find((c) => c.id === currentCamId);
      if (found) return found;
    }
    return null;
  }, [currentChampionship, currentCamId, campionati, annoId]);

  const activeSerieConfig = useMemo(() => {
    if (!activeChampionship) return null;
    const key = getChampionshipSerieKey(activeChampionship);
    return SERIE_CONFIGS[key];
  }, [activeChampionship]);

  const activeCleanTitle = useMemo(() => {
    if (!activeChampionship) return '';
    return cleanChampionshipCardName(activeChampionship.nome, activeChampionship.categoria);
  }, [activeChampionship]);

  const handleProfileChampionshipDetected = (championshipId: number) => {
    onAutoSelectProfileChampionship(championshipId);
  };

  // Evita ripetizioni tra preferiti e cronologia:
  // Mostra nella cronologia solo gli atleti che NON sono già nei preferiti
  const filteredRecentAthletes = useMemo(() => {
    const favIds = new Set(favoriteAthletes.map((a) => a.id));
    return recentAthletes.filter((a) => !favIds.has(a.id));
  }, [recentAthletes, favoriteAthletes]);

  // Mostra nella cronologia solo i campionati che NON sono già nei preferiti e NON sono il campionato attivo in hero
  const filteredRecentChampionships = useMemo(() => {
    const favIds = new Set(favoriteChampIds);
    return recentChampionships.filter(
      (c) => !favIds.has(c.id) && (!activeChampionship || c.id !== activeChampionship.id)
    );
  }, [recentChampionships, favoriteChampIds, activeChampionship]);
  const formatCategoria = (cat?: string): string | null => {
    if (!cat) return null;
    const trimmed = cat.trim();
    const num = trimmed.replace(/\D/g, '');
    if (num) {
      return `${num}ª Cat.`;
    }
    return trimmed;
  };

  const formatTimestamp = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Poco fa';
    if (minutes < 60) return `${minutes} min fa`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ore fa`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Ieri';
    return `${days} gg fa`;
  };

  const handleOpenChampionship = (
    champId: number,
    champAnno = 41,
    targetTab: 'classifica' | 'calendario' = 'classifica'
  ) => {
    onSelectChampionship(champId, champAnno);
    onNavigateTab(targetTab);
  };

  return (
    <div className="home-container">
      {/* ───────────────────────────────────────────────────────────
          IL MIO PROFILO (Scheda personale o invito alla configurazione)
         ─────────────────────────────────────────────────────────── */}
      <MyProfileHero
        onOpenAtletaModal={onOpenAtletaModal}
        onChampionshipDetected={handleProfileChampionshipDetected}
        onProfileStatusChange={setProfileStatus}
      />

      {/* ───────────────────────────────────────────────────────────
          AVVISO GIOCATORE SENZA CAMPIONATO
         ─────────────────────────────────────────────────────────── */}
      {profileStatus.playerId && !profileStatus.loading && !profileStatus.hasChampionship && (
        <div className="home-player-warning-banner" role="alert">
          <div className="warning-banner-icon-box">
            <i className="bi bi-exclamation-triangle-fill"></i>
          </div>
          <div className="warning-banner-content">
            <div className="warning-banner-title">
              {profileStatus.athleteName ? (
                <span><strong>{profileStatus.athleteName}</strong>: nessun campionato trovato per il momento</span>
              ) : (
                <span>Nessun campionato trovato per il momento</span>
              )}
            </div>
            <p className="warning-banner-desc">
              L&apos;atleta non risulta iscritto ad alcun campionato attivo della stagione. Puoi selezionare comunque un campionato dal catalogo generale per consultarne le classifiche e calendario.
            </p>
          </div>
          <button
            type="button"
            className="warning-banner-btn"
            onClick={onOpenChampionshipModal}
            title="Sfoglia catalogo campionati"
          >
            <i className="bi bi-trophy me-1"></i> Sfoglia campionati
          </button>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────
          HERO MINIMAL SENZA BORDI (Campionato Corrente o Navigazione Rapida)
         ─────────────────────────────────────────────────────────── */}
      <section className="home-hero" aria-label="Panoramica Campionato">
        {activeChampionship ? (
          <>
            <div className="home-hero-content">
              <div className="home-hero-badge-row">
                <span className="home-hero-pill" style={{ color: '#047857', backgroundColor: '#ecfdf5' }}>
                  <span className="home-hero-pulse-dot"></span>
                  <span>In corso</span>
                </span>
                {activeSerieConfig && (
                  <span
                    className="home-hero-pill"
                    style={{
                      color: activeSerieConfig.accent,
                      backgroundColor: `${activeSerieConfig.accent}14`,
                    }}
                  >
                    <i className={`bi ${activeSerieConfig.icon}`}></i>
                    {activeChampionship.categoria || activeSerieConfig.title}
                  </span>
                )}
                <span className="home-hero-region">
                  <i className="bi bi-geo-alt"></i>
                  {activeChampionship.regione || 'Nazionale'}
                </span>
              </div>

              <h2 className="home-hero-title" title={activeChampionship.nome}>
                {activeCleanTitle}
              </h2>
              {activeCleanTitle !== activeChampionship.nome && (
                <p className="home-hero-subtitle">{activeChampionship.nome}</p>
              )}
            </div>

            <div className="home-hero-actions">
              <button
                type="button"
                className="home-hero-btn home-hero-btn-secondary"
                onClick={() =>
                  handleOpenChampionship(
                    activeChampionship.id,
                    activeChampionship.anno || annoId,
                    'classifica'
                  )
                }
                title="Visualizza Classifica"
              >
                <i className="bi bi-trophy"></i>
                <span>Classifica</span>
              </button>
              <button
                type="button"
                className="home-hero-btn home-hero-btn-secondary"
                onClick={() =>
                  handleOpenChampionship(
                    activeChampionship.id,
                    activeChampionship.anno || annoId,
                    'calendario'
                  )
                }
                title="Visualizza Calendario"
              >
                <i className="bi bi-calendar3"></i>
                <span>Calendario</span>
              </button>
              <button
                type="button"
                className="home-hero-btn home-hero-btn-secondary"
                onClick={onOpenChampionshipModal}
                title="Sfoglia altri campionati"
                style={{ minWidth: '166px' }}
              >
                <i className="bi bi-grid-fill"></i>
                <span>Cambia campionato</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="home-hero-content">
              <div className="home-hero-badge-row">
                <span
                  className="home-hero-pill"
                  style={{
                    color: 'var(--color-primary-600, #2563eb)',
                    backgroundColor: 'var(--color-primary-light, #eff6ff)',
                  }}
                >
                  <i className="bi bi-trophy"></i>
                  <span>Campionati FITeT </span>
                </span>
              </div>
              <h2 className="home-hero-title">Esplora i Campionati</h2>
              <p className="home-hero-subtitle">
                Scegli un campionato per consultare classifiche, calendari, referti e statistiche.
              </p>
            </div>

            <div className="home-hero-actions">
              <button
                type="button"
                className="home-hero-btn home-hero-btn-primary"
                onClick={onOpenChampionshipModal}
                title="Sfoglia campionati"
              >
                <i className="bi bi-grid-fill"></i>
                <span>Campionati</span>
              </button>
              <button
                type="button"
                className="home-hero-btn home-hero-btn-secondary"
                onClick={() => setIsSearchAtletaModalOpen(true)}
                title="Cerca atleti e giocatori"
              >
                <i className="bi bi-search"></i>
                <span>Cerca Giocatori</span>
              </button>
            </div>
          </>
        )}
      </section>
      <section
        className="home-hero home-hero-sub"
        aria-label="Archivio e Strumenti"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div className="home-hero-content w-100">
          <div className="my-profile-empty-eyebrow">
            Consulta storico e compara atleti

          </div>
          <h3 className="home-hero-title" style={{ margin: 0 }}>
            Archivio e comparatore
          </h3>
        </div>

        <div className="home-hero-actions">
          <button
            type="button"
            className="home-hero-btn home-hero-btn-secondary"
            onClick={handleOpenH2hPicker}
            title="Confronta due atleti"
          >
            <i className="bi bi-arrow-left-right"></i>
            <span>Testa a Testa</span>
          </button>
        </div>
      </section>
      {/* ───────────────────────────────────────────────────────────
          SEZIONE 1: CAMPIONATI PREFERITI (mostrata solo se presenti)
         ─────────────────────────────────────────────────────────── */}
      {resolvedFavoriteChampionships.length > 0 && (
        <section className="home-section" aria-labelledby="heading-fav-championships">
          <div className="home-section-header">
            <div className="home-section-title-wrap">
              <h3 id="heading-fav-championships" className="home-section-title">
                Campionati Preferiti
                <span className="home-section-count">
                  {champCount} {champCount === 1 ? 'salvato' : 'salvati'}
                </span>
              </h3>
            </div>

            <button
              type="button"
              className="home-section-btn"
              onClick={onOpenChampionshipModal}
              title="Aggiungi altri campionati"
            >
              <i className="bi bi-plus-lg"></i>
              <span>Sfoglia Campionati</span>
            </button>
          </div>

          <div className="home-cards-grid home-cards-grid--compact">
            {resolvedFavoriteChampionships.map((champ) => {
              const serieKey = getChampionshipSerieKey(champ);
              const serieConfig = SERIE_CONFIGS[serieKey];
              const isActive = currentCamId === champ.id;
              const cleanTitle = cleanChampionshipCardName(champ.nome, champ.categoria);

              return (
                <div
                  key={`fav-champ-${champ.id}`}
                  className={`home-borderless-card ${isActive ? 'is-active-champ' : ''}`}
                >
                  <div className="home-card-top">
                    <div className="home-card-badges">
                      <span
                        className="home-soft-pill"
                        style={{
                          backgroundColor: `${serieConfig.accent}16`,
                          color: serieConfig.accent,
                        }}
                      >
                        <i className={`bi ${serieConfig.icon}`}></i>
                        {champ.categoria || serieConfig.title}
                      </span>
                      <span className="home-soft-region">
                        <i className="bi bi-geo-alt"></i>
                        {champ.regione || 'Nazionale'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="home-card-fav-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeChampFavorite(champ.id);
                      }}
                      title="Rimuovi dai preferiti"
                      aria-label="Rimuovi campionato dai preferiti"
                    >
                      <i className="bi bi-star-fill text-warning"></i>
                    </button>
                  </div>

                  <div
                    className="home-card-main"
                    onClick={() => handleOpenChampionship(champ.id, champ.anno || 41, 'classifica')}
                  >
                    <h4 className="home-card-title" title={champ.nome}>
                      {cleanTitle}
                    </h4>
                    {cleanTitle !== champ.nome && (
                      <p className="home-card-sub">{champ.nome}</p>
                    )}
                  </div>

                  <div className="home-card-actions">
                    <button
                      type="button"
                      className="home-action-btn btn-main"
                      onClick={() => handleOpenChampionship(champ.id, champ.anno || 41, 'classifica')}
                    >
                      <i className="bi bi-trophy"></i>
                      <span>Classifica</span>
                    </button>
                    <button
                      type="button"
                      className="home-action-btn"
                      onClick={() => handleOpenChampionship(champ.id, champ.anno || 41, 'calendario')}
                    >
                      <i className="bi bi-calendar3"></i>
                      <span>Calendario</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 2: ATLETI PREFERITI
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="heading-fav-athletes">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <h3 id="heading-fav-athletes" className="home-section-title">
              Atleti Preferiti
              {athletesCount > 0 && (
                <span className="home-section-count">
                  {athletesCount} {athletesCount === 1 ? 'salvato' : 'salvati'}
                </span>
              )}
            </h3>
          </div>

          <button
            type="button"
            className="home-section-btn home-section-btn--icon"
            onClick={() => setIsSearchAtletaModalOpen(true)}
            title="Cerca giocatori"
            aria-label="Cerca giocatori"
            style={{ minWidth: '43px' }}
          >
            <i className="bi bi-search"></i>
          </button>
        </div>

        {favoriteAthletes.length > 0 ? (
          <div className="home-cards-grid home-cards-grid--compact home-cards-grid--athletes">
            {favoriteAthletes.map((athlete: FavoriteAthlete) => (
              <div
                key={`fav-athlete-${athlete.id}`}
                className="home-borderless-card home-athlete-card"
                onClick={() => onOpenAtletaModal(athlete.id, athlete.name)}
              >
                <div className="home-athlete-top">
                  <div className="title-wrapper">
                    <div className="home-athlete-profile">
                      <div className="home-athlete-avatar-wrap">
                        <AthleteAvatar
                          atletaId={athlete.id}
                          nome={athlete.name}
                          size={46}
                        />
                      </div>
                      <div className="home-athlete-info">
                        <MarqueeText
                          text={athlete.name}
                          className="home-card-title"
                        />
                        {athlete.squadra ? (
                          <div className="home-athlete-team" title={athlete.squadra}>
                            <span>{athlete.squadra}</span>
                          </div>
                        ) : (
                          <div className="home-athlete-team">
                            <i className="bi bi-person"></i>
                            <span>Tessera #{athlete.id}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="home-card-fav-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAthleteFavorite(athlete.id);
                      }}
                      title="Rimuovi atleta dai preferiti"
                      aria-label="Rimuovi atleta dai preferiti"
                    >
                      <i className="bi bi-star-fill text-warning"></i>
                    </button>
                  </div>
                </div>

                <div className="home-athlete-stats-row">
                  <div className="home-athlete-stat">
                    <span className="home-athlete-stat-label">Ranking</span>
                    <span className="home-athlete-stat-val rank">
                      {athlete.ranking ? `#${athlete.ranking}` : '—'}
                    </span>
                  </div>
                  <div className="home-athlete-stat">
                    <span className="home-athlete-stat-label">Punti</span>
                    <span className="home-athlete-stat-val points">
                      {athlete.punti !== undefined && athlete.punti !== null
                        ? athlete.punti.toLocaleString('it-IT')
                        : '—'}
                    </span>
                  </div>
                  <div className="home-athlete-stat">
                    <span className="home-athlete-stat-label">Categoria</span>
                    <span className="home-athlete-stat-val">
                      {formatCategoria(athlete.categoria) || '—'}
                    </span>
                  </div>
                </div>

                <div className="home-card-footer-link">
                  <span>Apri Scheda Atleta</span>
                  <i className="bi bi-arrow-right"></i>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="home-empty-simple">Nessun atleta preferito</p>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 3: CRONOLOGIA ATLETI VISITATI (mostrata solo se presenti)
         ─────────────────────────────────────────────────────────── */}
      {filteredRecentAthletes.length > 0 && (
        <section className="home-section" aria-labelledby="heading-recent-athletes">
          <div className="home-section-header">
            <div className="home-section-title-wrap">
              <h3 id="heading-recent-athletes" className="home-section-title">
                Cronologia Atleti Visitati
                <span className="home-section-count">
                  {filteredRecentAthletes.length} {filteredRecentAthletes.length === 1 ? 'atleta' : 'atleti'}
                </span>
              </h3>
            </div>

            <button
              type="button"
              className="home-section-btn text-muted"
              onClick={clearAthletes}
              title="Svuota cronologia atleti"
            >
              <i className="bi bi-trash3"></i>

            </button>
          </div>

          <div className="home-cards-grid home-cards-grid--compact home-cards-grid--athletes">
            {filteredRecentAthletes.map((item) => {
              const isFav = isFavoriteAthlete(item.id);

              return (
                <div
                  key={`recent-athlete-${item.id}`}
                  className="home-borderless-card home-athlete-card"
                  onClick={() => onOpenAtletaModal(item.id, item.name)}
                >
                  <div className="home-athlete-top">
                    <div className="title-wrapper">
                      <div className="home-athlete-profile">
                        <div className="home-athlete-avatar-wrap">
                          <AthleteAvatar
                            atletaId={item.id}
                            nome={item.name}
                            size={42}
                          />
                        </div>
                        <div className="home-athlete-info">
                          <MarqueeText
                            text={item.name}
                            className="home-card-title"
                          />
                          <div className="home-athlete-team">
                            {item.squadra ? (
                              <span title={item.squadra}>{item.squadra}</span>
                            ) : (
                              <span>Tessera #{item.id}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="home-athlete-stats-row">
                        <div className="home-athlete-stat">
                          <span className="home-athlete-stat-label">Ranking</span>
                          <span className="home-athlete-stat-val rank">
                            {item.ranking ? `#${item.ranking}` : '—'}
                          </span>
                        </div>
                        <div className="home-athlete-stat">
                          <span className="home-athlete-stat-label">Punti</span>
                          <span className="home-athlete-stat-val points">
                            {item.punti !== undefined && item.punti !== null
                              ? item.punti.toLocaleString('it-IT')
                              : '—'}
                          </span>
                        </div>
                        <div className="home-athlete-stat">
                          <span className="home-athlete-stat-label">Categoria</span>
                          <span className="home-athlete-stat-val">
                            {formatCategoria(item.categoria) || '—'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="home-card-fav-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAthleteFavorite({
                              id: item.id,
                              name: item.name,
                              squadra: item.squadra,
                            });
                          }}
                          title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                          aria-label="Salva come preferito"
                        >
                          <i className={isFav ? 'bi bi-star-fill text-warning' : 'bi bi-star'}></i>
                        </button>
                        <button
                          type="button"
                          className="home-card-fav-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAthlete(item.id);
                          }}
                          title="Rimuovi da cronologia"
                          aria-label="Rimuovi da cronologia"
                          style={{ fontSize: '13px' }}
                        >
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="home-card-footer-link" style={{ justifyContent: 'space-between' }}>
                    <small className="text-muted" style={{ fontSize: '11px' }}>
                      <i className="bi bi-clock me-1"></i>
                      {formatTimestamp(item.timestamp)}
                    </small>
                    <span>Apri Scheda →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 4: CRONOLOGIA CAMPIONATI VISITATI (mostrata solo se presenti)
         ─────────────────────────────────────────────────────────── */}
      {filteredRecentChampionships.length > 0 && (
        <section className="home-section" aria-labelledby="heading-recent-championships">
          <div className="home-section-header">
            <div className="home-section-title-wrap">
              <h3 id="heading-recent-championships" className="home-section-title">
                Cronologia Campionati Visitati
                <span className="home-section-count">
                  {filteredRecentChampionships.length} {filteredRecentChampionships.length === 1 ? 'campionato' : 'campionati'}
                </span>
              </h3>
            </div>

            <button
              type="button"
              className="home-section-btn text-muted"
              onClick={clearChampionships}
              title="Svuota cronologia campionati"
            >
              <i className="bi bi-trash3"></i>
              <span>Svuota</span>
            </button>
          </div>

          <div className="home-cards-grid home-cards-grid--compact">
            {filteredRecentChampionships.map((item) => {
              const isFav = isFavoriteChamp(item.id);
              const serieKey = getChampionshipSerieKey(item);
              const serieConfig = SERIE_CONFIGS[serieKey];
              const cleanTitle = cleanChampionshipCardName(item.nome, item.categoria);

              return (
                <div
                  key={`recent-champ-${item.id}`}
                  className="home-borderless-card"
                  onClick={() => handleOpenChampionship(item.id, item.anno || 41, 'classifica')}
                >
                  <div className="home-card-top">
                    <div className="home-card-badges">
                      <span
                        className="home-soft-pill"
                        style={{
                          backgroundColor: `${serieConfig.accent}16`,
                          color: serieConfig.accent,
                        }}
                      >
                        <i className={`bi ${serieConfig.icon}`}></i>
                        {item.categoria || serieConfig.title}
                      </span>
                      <span className="home-soft-region">
                        <i className="bi bi-geo-alt"></i>
                        {item.regione || 'Nazionale'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="home-card-fav-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChampFavorite(item.id, item);
                        }}
                        title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                        aria-label="Salva campionato come preferito"
                      >
                        <i className={isFav ? 'bi bi-star-fill text-warning' : 'bi bi-star'}></i>
                      </button>
                      <button
                        type="button"
                        className="home-card-fav-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeChampionship(item.id);
                        }}
                        title="Rimuovi da cronologia"
                        aria-label="Rimuovi da cronologia"
                        style={{ fontSize: '13px' }}
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  </div>

                  <div className="home-card-main">
                    <h4 className="home-card-title" title={item.nome}>
                      {cleanTitle}
                    </h4>
                    {cleanTitle !== item.nome && (
                      <p className="home-card-sub">{item.nome}</p>
                    )}
                  </div>

                  <div className="home-card-actions">
                    <button
                      type="button"
                      className="home-action-btn btn-main"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenChampionship(item.id, item.anno || 41, 'classifica');
                      }}
                    >
                      <i className="bi bi-trophy"></i>
                      <span>Classifica</span>
                    </button>
                    <button
                      type="button"
                      className="home-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenChampionship(item.id, item.anno || 41, 'calendario');
                      }}
                    >
                      <i className="bi bi-calendar3"></i>
                      <span>Calendario</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Modale Ricerca Atleta */}
      <SearchAtletaModal
        isOpen={isSearchAtletaModalOpen}
        onClose={() => setIsSearchAtletaModalOpen(false)}
        onSelectAthlete={(id, name) => {
          setIsSearchAtletaModalOpen(false);
          onOpenAtletaModal(id, name);
        }}
      />

      {/* Modale selezione due atleti per il Testa a Testa */}
      {isH2hPickerOpen && (
        <HeadToHeadPickerModal
          isOpen={isH2hPickerOpen}
          onClose={() => setIsH2hPickerOpen(false)}
          onCompare={(player1, player2) => {
            setIsH2hPickerOpen(false);
            setH2hPlayers({ player1, player2 });
          }}
        />
      )}

      {/* Storico Testa a Testa tra i due atleti selezionati */}
      {h2hPlayers && (
        <HeadToHeadModal
          isOpen={true}
          atleta1Id={h2hPlayers.player1.id}
          atleta1Nome={h2hPlayers.player1.name}
          atleta2Id={h2hPlayers.player2.id}
          atleta2Nome={h2hPlayers.player2.name}
          onClose={() => setH2hPlayers(null)}
          onSelectAthlete={onOpenAtletaModal}
          onNewSearch={() => {
            setH2hPlayers(null);
            setIsH2hPickerOpen(true);
          }}
        />
      )}
    </div>
  );
};
