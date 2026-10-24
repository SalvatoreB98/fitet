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

  // Modale Cerca Atleta
  const [isSearchAtletaModalOpen, setIsSearchAtletaModalOpen] = useState(false);

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

  // Campionato attivo attuale o salvato in localStorage
  const currentOrLastCamId = useMemo(() => {
    if (currentCamId) return currentCamId;
    try {
      const stored = localStorage.getItem('fitet_selected_cam');
      if (stored) {
        const num = parseInt(stored, 10);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch { }
    return null;
  }, [currentCamId]);

  const currentChampionshipResolved = useMemo((): ChampionshipItem | null => {
    if (!currentOrLastCamId) return null;
    const found = campionati.find((c) => c.id === currentOrLastCamId);
    if (found) return found;

    if (currentChampionship && currentChampionship.nome) {
      return {
        id: currentOrLastCamId,
        nome: currentChampionship.nome,
        regione: currentChampionship.regione || '',
        categoria: currentChampionship.categoria || '',
        anno: annoId,
      } as ChampionshipItem;
    }

    const cached = cachedMeta[currentOrLastCamId];
    if (cached) {
      return {
        id: currentOrLastCamId,
        nome: cached.nome,
        regione: cached.regione,
        categoria: cached.categoria,
        anno: cached.anno || annoId,
      } as ChampionshipItem;
    }

    return {
      id: currentOrLastCamId,
      nome: `Campionato #${currentOrLastCamId}`,
      regione: '',
      categoria: '',
      anno: annoId,
    } as ChampionshipItem;
  }, [currentOrLastCamId, campionati, currentChampionship, cachedMeta, annoId]);

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
          SEZIONE 2: CAMPIONATI PREFERITI
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="heading-fav-championships">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <h3 id="heading-fav-championships" className="home-section-title">
              {resolvedFavoriteChampionships.length > 0 ? 'Campionati Preferiti' : 'Campionato Attuale'}
              {resolvedFavoriteChampionships.length > 0 && (
                <span className="home-section-count">
                  {champCount} {champCount === 1 ? 'salvato' : 'salvati'}
                </span>
              )}
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

        {resolvedFavoriteChampionships.length > 0 ? (
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
        ) : currentChampionshipResolved ? (
          <div className="home-cards-grid home-cards-grid--compact">
            {(() => {
              const serieKey = getChampionshipSerieKey(currentChampionshipResolved);
              const serieConfig = SERIE_CONFIGS[serieKey];
              const cleanTitle = cleanChampionshipCardName(
                currentChampionshipResolved.nome,
                currentChampionshipResolved.categoria
              );
              const isFav = isFavoriteChamp(currentChampionshipResolved.id);

              return (
                <div
                  key={`curr-champ-${currentChampionshipResolved.id}`}
                  className="home-borderless-card is-active-champ"
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
                        {currentChampionshipResolved.categoria || serieConfig.title}
                      </span>
                      <span className="home-soft-region">
                        <i className="bi bi-geo-alt"></i>
                        {currentChampionshipResolved.regione || 'Nazionale'}
                      </span>
                      <span className="home-current-badge">
                        <i className="bi bi-check-circle-fill"></i> Attivo
                      </span>
                    </div>

                    <button
                      type="button"
                      className="home-card-fav-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleChampFavorite(
                          currentChampionshipResolved.id,
                          currentChampionshipResolved
                        );
                      }}
                      title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                      aria-label="Aggiungi o rimuovi dai preferiti"
                    >
                      <i className={isFav ? 'bi bi-star-fill text-warning' : 'bi bi-star'}></i>
                    </button>
                  </div>

                  <div
                    className="home-card-main"
                    onClick={() =>
                      handleOpenChampionship(
                        currentChampionshipResolved.id,
                        currentChampionshipResolved.anno || 41,
                        'classifica'
                      )
                    }
                  >
                    <h4 className="home-card-title" title={currentChampionshipResolved.nome}>
                      {cleanTitle}
                    </h4>
                    {cleanTitle !== currentChampionshipResolved.nome && (
                      <p className="home-card-sub">{currentChampionshipResolved.nome}</p>
                    )}
                  </div>

                  <div className="home-card-actions">
                    <button
                      type="button"
                      className="home-action-btn btn-main"
                      onClick={() =>
                        handleOpenChampionship(
                          currentChampionshipResolved.id,
                          currentChampionshipResolved.anno || 41,
                          'classifica'
                        )
                      }
                    >
                      <i className="bi bi-trophy"></i>
                      <span>Classifica</span>
                    </button>
                    <button
                      type="button"
                      className="home-action-btn"
                      onClick={() =>
                        handleOpenChampionship(
                          currentChampionshipResolved.id,
                          currentChampionshipResolved.anno || 41,
                          'calendario'
                        )
                      }
                    >
                      <i className="bi bi-calendar3"></i>
                      <span>Calendario</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="home-empty-card">
            <div className="home-empty-icon icon-trophy">
              <i className="bi bi-trophy"></i>
            </div>
            <h4 className="home-empty-title">Nessun Campionato Selezionato</h4>
            <p className="home-empty-desc">
              Scegli il campionato FITeT da consultare dal catalogo, per accedere all'istante ogni volta che apri l'app.
            </p>
            <button
              type="button"
              className="home-empty-btn"
              onClick={onOpenChampionshipModal}
            >
              <i className="bi bi-plus-lg"></i>
              <span>Esplora Campionati</span>
            </button>
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 1: ATLETI PREFERITI
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
            className="home-section-btn"
            onClick={() => setIsSearchAtletaModalOpen(true)}
            title="Cerca un atleta da salvare"
          >
            <i className="bi bi-search"></i>
            <span>Cerca Giocatori</span>
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
                        <h4 className="home-card-title" title={athlete.name}>
                          {athlete.name}
                        </h4>
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
          <div className="home-empty-card">
            <div className="home-empty-icon icon-heart">
              <i className="bi bi-star"></i>
            </div>
            <h4 className="home-empty-title">Nessun Giocatore tra i Preferiti</h4>
            <p className="home-empty-desc">
              Cerca i tuoi compagni di squadra, avversari o atleti di riferimento e tocca la stella per salvarli
              qui e consultarli in qualsiasi momento.
            </p>
            <button
              type="button"
              className="home-empty-btn"
              onClick={() => setIsSearchAtletaModalOpen(true)}
            >
              <i className="bi bi-search"></i>
              <span>Cerca e Aggiungi Atleta</span>
            </button>
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 3: CRONOLOGIA ATLETI VISITATI
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="heading-recent-athletes">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon history">
              <i className="bi bi-clock-history"></i>
            </div>
            <h3 id="heading-recent-athletes" className="home-section-title">
              Cronologia Atleti Visitati
              {recentAthletes.length > 0 && (
                <span className="home-section-count">
                  {recentAthletes.length} {recentAthletes.length === 1 ? 'atleta' : 'atleti'}
                </span>
              )}
            </h3>
          </div>

          {recentAthletes.length > 0 && (
            <button
              type="button"
              className="home-section-btn text-muted"
              onClick={clearAthletes}
              title="Svuota cronologia atleti"
            >
              <i className="bi bi-trash3"></i>
              <span>Svuota</span>
            </button>
          )}
        </div>

        {recentAthletes.length > 0 ? (
          <div className="home-cards-grid home-cards-grid--compact home-cards-grid--athletes">
            {recentAthletes.map((item) => {
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
                          <h4 className="home-card-title" title={item.name}>
                            {item.name}
                          </h4>
                          <div className="home-athlete-team">
                            {item.squadra ? (
                              <span title={item.squadra}>{item.squadra}</span>
                            ) : (
                              <span>Tessera #{item.id}</span>
                            )}
                          </div>
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
        ) : (
          <div className="home-empty-card" style={{ padding: '24px 16px' }}>
            <p className="text-muted mb-0" style={{ fontSize: '13px' }}>
              Nessun atleta visitato di recente. Quando aprirai la scheda di un atleta, apparirà qui per un rapido accesso.
            </p>
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 4: CRONOLOGIA CAMPIONATI VISITATI
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="heading-recent-championships">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon history">
              <i className="bi bi-clock-history"></i>
            </div>
            <h3 id="heading-recent-championships" className="home-section-title">
              Cronologia Campionati Visitati
              {recentChampionships.length > 0 && (
                <span className="home-section-count">
                  {recentChampionships.length} {recentChampionships.length === 1 ? 'campionato' : 'campionati'}
                </span>
              )}
            </h3>
          </div>

          {recentChampionships.length > 0 && (
            <button
              type="button"
              className="home-section-btn text-muted"
              onClick={clearChampionships}
              title="Svuota cronologia campionati"
            >
              <i className="bi bi-trash3"></i>
              <span>Svuota</span>
            </button>
          )}
        </div>

        {recentChampionships.length > 0 ? (
          <div className="home-cards-grid home-cards-grid--compact">
            {recentChampionships.map((item) => {
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
        ) : (
          <div className="home-empty-card" style={{ padding: '24px 16px' }}>
            <p className="text-muted mb-0" style={{ fontSize: '13px' }}>
              Nessun campionato visitato di recente. Quando aprirai un campionato dal catalogo, verrà memorizzato qui.
            </p>
          </div>
        )}
      </section>

      {/* Modale Ricerca Atleta */}
      <SearchAtletaModal
        isOpen={isSearchAtletaModalOpen}
        onClose={() => setIsSearchAtletaModalOpen(false)}
        onSelectAthlete={(id, name) => {
          setIsSearchAtletaModalOpen(false);
          onOpenAtletaModal(id, name);
        }}
      />
    </div>
  );
};
