import React, { useMemo, useEffect, useRef, useState } from 'react';
import { ChampionshipItem, DashboardData } from '../types/fitet';
import {
  useFavoriteAthletes,
  useFavoriteChampionships,
  saveFavoriteAthlete,
  FavoriteAthlete,
} from '../utils/favorites';
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
  } = useFavoriteAthletes();

  const {
    favoriteIds: favoriteChampIds,
    favoritesCount: champCount,
    cachedMeta,
    isFavorite: isFavoriteChamp,
    toggleFavorite: toggleChampFavorite,
    removeFavorite: removeChampFavorite,
  } = useFavoriteChampionships();

  // Modale Cerca Atleta
  const [isSearchAtletaModalOpen, setIsSearchAtletaModalOpen] = useState(false);

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

  // Campionato attuale / ultimo selezionato (da prop o da localStorage)
  const currentOrLastCamId = useMemo(() => {
    if (currentCamId) return currentCamId;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fitet_selected_cam');
      if (saved && /^\d+$/.test(saved)) return parseInt(saved, 10);
    }
    return null;
  }, [currentCamId]);

  const currentChampionshipResolved = useMemo(() => {
    if (!currentOrLastCamId) return null;
    const found = campionati.find((c) => c.id === currentOrLastCamId);
    if (found) return found;
    if (currentChampionship && currentChampionship.nome) {
      return {
        id: currentOrLastCamId,
        nome: currentChampionship.nome,
        categoria: currentChampionship.categoria || '',
        regione: currentChampionship.regione || 'FITET',
        anno: annoId,
      } as ChampionshipItem;
    }
    const cached = cachedMeta[currentOrLastCamId];
    if (cached) {
      return {
        id: currentOrLastCamId,
        nome: cached.nome || `Campionato #${currentOrLastCamId}`,
        categoria: cached.categoria || '',
        regione: cached.regione || 'FITET',
        anno: cached.anno || annoId,
      } as ChampionshipItem;
    }
    return {
      id: currentOrLastCamId,
      nome: `Campionato #${currentOrLastCamId}`,
      categoria: '',
      regione: 'FITET',
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

  const handleOpenChampionship = (champId: number, champAnno = 41, targetTab: 'classifica' | 'calendario' = 'classifica') => {
    onSelectChampionship(champId, champAnno);
    onNavigateTab(targetTab);
  };

  return (
    <div className="home-container">
      {/* ───────────────────────────────────────────────────────────
          DUE MACRO-AZIONI PRINCIPALI (ESPLORA CAMPIONATI & CERCA ATLETA)
         ─────────────────────────────────────────────────────────── */}
      <section className="home-macro-actions" aria-label="Azioni principali del portale">
        {/* Macro-Azione 1: Esplora Campionati */}
        <div
          className="macro-card macro-card-championship"
          onClick={onOpenChampionshipModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenChampionshipModal();
            }
          }}
        >
          <div className="macro-card-header">
            <div className="macro-icon-box icon-trophy">
              <i className="bi bi-trophy-fill"></i>
            </div>
            <span className="macro-action-tag">Gironi & Risultati</span>
          </div>

          <div className="macro-card-body">
            <h3 className="macro-card-title">Esplora Campionati</h3>
            <p className="macro-card-desc">
              Selezione guidata per Regione, Serie e Girone: consulta classifiche a squadre, calendari e risultati.
            </p>
          </div>

          <div className="macro-card-footer">
            <span className="macro-cta-link">
              <span>Scegli Girone</span>
              <i className="bi bi-arrow-right"></i>
            </span>
          </div>
        </div>

        {/* Macro-Azione 2: Cerca Atleta (Apre Modale Dedicata) */}
        <div
          className="macro-card macro-card-athlete"
          onClick={() => setIsSearchAtletaModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsSearchAtletaModalOpen(true);
            }
          }}
        >
          <div className="macro-card-header">
            <div className="macro-icon-box icon-search">
              <i className="bi bi-search"></i>
            </div>
            <span className="macro-action-tag">Schede Atleti</span>
          </div>

          <div className="macro-card-body">
            <h3 className="macro-card-title">Cerca Atleta</h3>
            <p className="macro-card-desc">
              Trova subito qualsiasi tesserato FITeT per consultarne classifica, rendimento e storico partite.
            </p>
          </div>

          <div className="macro-card-footer">
            <span className="macro-cta-link">
              <span>Apri Ricerca</span>
              <i className="bi bi-arrow-right"></i>
            </span>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────
          SEZIONE 1: CAMPIONATI PREFERITI (Minimal & Borderless)
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon trophy">
              <i className="bi bi-trophy-fill"></i>
            </div>
            <h3 className="home-section-title">
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

        {/* Se ci sono preferiti salvati, mostra l'elenco dei preferiti */}
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
                      <i className="bi bi-star-fill"></i>
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
          /* Se non ci sono preferiti salvati, mostra il campionato attuale / salvato in localStorage */
          <div className="home-cards-grid">
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
                        <i className="bi bi-check-circle-fill"></i> Campionato Attivo
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
                      <i className={isFav ? 'bi bi-star-fill' : 'bi bi-star'}></i>
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
          /* Fallback se non c'è nessun campionato preferito né attuale */
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
          SEZIONE 2: ATLETI PREFERITI (Minimal & Borderless)
         ─────────────────────────────────────────────────────────── */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title-wrap">
            <div className="home-section-icon heart">
              <i className="bi bi-person-hearts"></i>
            </div>
            <h3 className="home-section-title">
              Atleti Preferiti
              <span className="home-section-count">
                {athletesCount} {athletesCount === 1 ? 'atleta' : 'atleti'}
              </span>
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
          <div className="home-cards-grid">
            {favoriteAthletes.map((athlete: FavoriteAthlete) => (
              <div
                key={`fav-athlete-${athlete.id}`}
                className="home-borderless-card home-athlete-card"
                onClick={() => onOpenAtletaModal(athlete.id, athlete.name)}
              >
                <div className="home-athlete-top">
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
                    <i className="bi bi-star-fill"></i>
                  </button>
                </div>

                {/* Soft Stats Row */}
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
              <i className="bi bi-person-hearts"></i>
            </div>
            <h4 className="home-empty-title">Nessun Giocatore tra i Preferiti</h4>
            <p className="home-empty-desc">
              Cerca i tuoi compagni di squadra, avversari o atleti di riferimento e premi sulla stella per salvarli
              qui e visualizzare all'istante schede tecniche, vittorie e ranking ufficiale.
            </p>
            <button
              type="button"
              className="home-empty-btn"
              onClick={() => setIsSearchAtletaModalOpen(true)}
            >
              <i className="bi bi-search"></i>
              <span>Cerca e Aggiungi Giocatori</span>
            </button>
          </div>
        )}
      </section>

      {/* Modale Ricerca Atleta Globale */}
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
