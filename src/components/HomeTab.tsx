import React, { useMemo, useEffect, useRef } from 'react';
import { ChampionshipItem, DashboardData } from '../types/fitet';
import {
  useFavoriteAthletes,
  useFavoriteChampionships,
  saveFavoriteAthlete,
  FavoriteAthlete,
} from '../utils/favorites';
import { fetchAtleta } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
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
  dashboardData,
}) => {
  const {
    favorites: favoriteAthletes,
    favoritesCount: athletesCount,
    removeFavorite: removeAthleteFavorite,
  } = useFavoriteAthletes();

  const {
    favoriteIds: favoriteChampIds,
    favoritesCount: champCount,
    cachedMeta,
    removeFavorite: removeChampFavorite,
  } = useFavoriteChampionships();

  // Sincronizza in background i dati dei preferiti con l'ultimo snapshot ufficiale (ranking reale, punti)
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

  // Risolve l'elenco dei campionati preferiti tramite il catalogo campionati e cache
  const resolvedFavoriteChampionships = useMemo(() => {
    return favoriteChampIds.map((id) => {
      const found = campionati.find((c) => c.id === id);
      if (found) return found;
      const cached = cachedMeta[id];
      if (cached) {
        return {
          id,
          nome: cached.nome || `Campionato #${id}`,
          categoria: cached.categoria || '',
          regione: cached.regione || 'FITET',
          anno: cached.anno || annoId,
          formula: cached.formula,
        } as ChampionshipItem;
      }
      return {
        id,
        nome: `Campionato #${id}`,
        categoria: '',
        regione: 'FITET',
        anno: annoId,
      } as ChampionshipItem;
    });
  }, [favoriteChampIds, campionati, cachedMeta, annoId]);

  const formatCategoria = (cat?: string): string | null => {
    if (!cat) return null;
    const trimmed = cat.trim();
    const num = trimmed.replace(/\D/g, '');
    if (num) {
      return `${num}ª Cat.`;
    }
    return trimmed;
  };

  const handleOpenChampionship = (champId: number, champAnno = 41, targetTab?: 'classifica' | 'calendario') => {
    onSelectChampionship(champId, champAnno);
    if (targetTab) {
      onNavigateTab(targetTab);
    } else {
      onNavigateTab('classifica');
    }
  };

  return (
    <div className="home-container">

      {/* SEZIONE 1: CAMPIONATI PREFERITI */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon trophy">
              <i className="bi bi-trophy-fill"></i>
            </div>
            <h3 className="home-section-title">
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
          >
            <i className="bi bi-plus-circle-fill"></i>
            <span>Sfoglia Campionati</span>
          </button>
        </div>

        {resolvedFavoriteChampionships.length > 0 ? (
          <div className="home-cards-grid">
            {resolvedFavoriteChampionships.map((champ) => {
              const serieKey = getChampionshipSerieKey(champ);
              const serieConfig = SERIE_CONFIGS[serieKey];
              const isActive = currentCamId === champ.id;
              const cleanTitle = cleanChampionshipCardName(champ.nome, champ.categoria);

              return (
                <div
                  key={`fav-champ-${champ.id}`}
                  className={`home-champ-card ${isActive ? 'is-active-champ' : ''}`}
                >
                  <div className="home-champ-top">
                    <div className="home-champ-badges">
                      <span
                        className="home-serie-pill"
                        style={{
                          backgroundColor: serieConfig.accentBg,
                          color: serieConfig.accent,
                          border: `1px solid ${serieConfig.accent}40`,
                        }}
                      >
                        <i className={`bi ${serieConfig.icon}`}></i>
                        {champ.categoria || serieConfig.title}
                      </span>
                      <span className="home-region-pill">
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
                      <i className="bi bi-star-fill"></i>
                    </button>
                  </div>

                  <div
                    className="home-champ-main"
                    onClick={() => handleOpenChampionship(champ.id, champ.anno || 41, 'classifica')}
                  >
                    <h4 className="home-champ-title" title={champ.nome}>
                      {cleanTitle}
                    </h4>
                    {cleanTitle !== champ.nome && (
                      <p className="home-champ-sub">{champ.nome}</p>
                    )}
                    {isActive && (
                      <div className="home-champ-active-tag">
                        <i className="bi bi-check-circle-fill"></i>
                        Attualmente attivo
                      </div>
                    )}
                  </div>

                  <div className="home-champ-actions">
                    <button
                      type="button"
                      className="home-champ-btn btn-main"
                      onClick={() => handleOpenChampionship(champ.id, champ.anno || 41, 'classifica')}
                    >
                      <i className="bi bi-trophy"></i>
                      <span>Classifica</span>
                    </button>
                    <button
                      type="button"
                      className="home-champ-btn"
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
        ) : (
          <div className="home-empty-card">
            <div className="home-empty-icon">
              <i className="bi bi-trophy"></i>
            </div>
            <h4 className="home-empty-title">Nessun Campionato Preferito</h4>
            <p className="home-empty-desc">
              Aggiungi qui i campionati e gironi della tua società o regione cliccando sulla stella nel catalogo,
              per accedere all'istante ogni volta che apri l'app.
            </p>
            <button
              type="button"
              className="home-empty-btn"
              onClick={onOpenChampionshipModal}
            >
              <i className="bi bi-plus-lg"></i>
              <span>Esplora e Aggiungi Campionati</span>
            </button>
          </div>
        )}
      </section>

      {/* SEZIONE 2: GIOCATORI PREFERITI */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon heart">
              <i className="bi bi-person-hearts"></i>
            </div>
            <h3 className="home-section-title">
              Giocatori Preferiti
              <span className="home-section-count">
                {athletesCount} {athletesCount === 1 ? 'atleta' : 'atleti'}
              </span>
            </h3>
          </div>

          <button
            type="button"
            className="home-section-btn"
            onClick={() => onNavigateTab('cercaAtleta')}
          >
            <i className="bi bi-search"></i>
            <span>Cerca Giocatori</span>
          </button>
        </div>

        {favoriteAthletes.length > 0 ? (
          <div className="home-cards-grid">
            {favoriteAthletes.map((athlete: FavoriteAthlete) => (
              <div
                key={`fav-athlete-${athlete.id}`}
                className="home-athlete-card"
                onClick={() => onOpenAtletaModal(athlete.id, athlete.name)}
              >
                <div className="home-athlete-header">
                  <div className="home-athlete-profile">
                    <div className="home-athlete-avatar-wrap">
                      <AthleteAvatar
                        atletaId={athlete.id}
                        nome={athlete.name}
                        size={46}
                      />
                    </div>
                    <div className="home-athlete-info">
                      <h4 className="home-athlete-name" title={athlete.name}>
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
                    <i className="bi bi-star-fill"></i>
                  </button>
                </div>

                {/* Stats Row */}
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

                <div className="home-athlete-footer">
                  <span>Apri Scheda Atleta</span>
                  <i className="bi bi-arrow-right"></i>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="home-empty-card">
            <div className="home-empty-icon">
              <i className="bi bi-person-hearts"></i>
            </div>
            <h4 className="home-empty-title">Nessun Giocatore tra i Preferiti</h4>
            <p className="home-empty-desc">
              Cerca i tuoi compagni di squadra, avversari o idoli e premi sulla stella per salvarli
              qui e visualizzare all'istante schede tecniche, vittorie e ranking ufficiale.
            </p>
            <button
              type="button"
              className="home-empty-btn"
              onClick={() => onNavigateTab('cercaAtleta')}
            >
              <i className="bi bi-search"></i>
              <span>Cerca e Aggiungi Giocatori</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
