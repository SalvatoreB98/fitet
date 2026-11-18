import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SocietaAtletaStagione,
  SocietaDettaglio,
  SocietaInfo,
  SocietaStagione,
  SocietaStagioneIndexItem,
  SocietaSquadraStagione,
} from '../types/fitet';
import {
  fetchSocieta,
  fetchSocietaStagione,
  lookupSocieta,
  resolveSocietaHistoricalAthlete,
} from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import './SocietaModal.css';

export interface SocietaModalProps {
  societyId: string | null;
  initialLookupQuery?: string | null;
  initialInfo?: SocietaInfo | null;
  annoId: number;
  zIndex?: number;
  onClose: () => void;
  onSocietySelected: (societyId: string, info?: SocietaInfo) => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
  onSelectChampionship?: (camId: number, anno: number) => void;
}

const PORTAL_BASE = 'https://portale.fitet.org';

const formatNumber = (value?: number | null): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('it-IT');
};

const formatPct = (value?: number | null): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1).replace('.', ',')}%`;
};

const seasonLabelFromAnno = (anno: number): string => {
  const start = 1985 + anno;
  return `${start}/${String(start + 1).slice(-2)}`;
};

const AthleteRow: React.FC<{
  athlete: SocietaAtletaStagione;
  showRanking: boolean;
  onOpen?: () => void;
}> = ({ athlete, showRanking, onOpen }) => {
  const isClickable = Boolean(onOpen);
  return (
    <div
      className={`societa-athlete-row ${isClickable ? 'is-clickable' : ''}`}
      onClick={onOpen}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen?.();
            }
          }
          : undefined
      }
    >
      <AthleteAvatar atletaId={athlete.atletaId} nome={athlete.nome} size={32} />
      <div className="societa-athlete-main">
        <span className="societa-athlete-name">{athlete.nome}</span>
        <span className="societa-athlete-sub">
          {athlete.partiteDisputate > 0
            ? `${athlete.partiteVinte}V · ${athlete.partitePerse}P · ${formatPct(athlete.percentualeVittorie)}`
            : 'Nessuna partita disputata'}
        </span>
      </div>
      {showRanking && !athlete.isDoppio && (
        <div className="societa-athlete-ranking" title="Classifica FITeT attuale">
          <span className="societa-ranking-points">{formatNumber(athlete.rankPunti)} pt</span>
          <span className="societa-ranking-pos">
            {athlete.rankPosizione ? `#${formatNumber(athlete.rankPosizione)}` : 'NC'}
          </span>
        </div>
      )}
      {isClickable && <i className="bi bi-chevron-right societa-athlete-arrow"></i>}
    </div>
  );
};

const TeamBlock: React.FC<{
  team: SocietaSquadraStagione;
  showRanking: boolean;
  onOpenAthlete?: (athlete: SocietaAtletaStagione) => void;
  onOpenChampionship?: () => void;
}> = ({ team, showRanking, onOpenAthlete, onOpenChampionship }) => (
  <div className="societa-team-block">
    <div className="societa-team-head">
      <TeamLogo teamName={team.nome} size={50} className="societa-team-logo" />
      <div className="societa-team-name-wrap">
        <span className="societa-team-name">{team.nome}</span>
        <span className="societa-team-record">
          {team.incontriDisputati > 0
            ? `${team.incontriVinti}V · ${team.incontriPareggiati}N · ${team.incontriPersi}P`
            : 'Campionato non ancora iniziato'}
        </span>
      </div>
      <span className="societa-team-pos" title="Posizione in classifica">
        {team.posizione ? `#${team.posizione}` : '—'}
      </span>
      <button
        type="button"
        className="societa-team-points"
        onClick={onOpenChampionship}
        title="Apri il campionato"
        disabled={!onOpenChampionship}
      >
        <strong>{formatNumber(team.punti)}</strong>
        <span>punti</span>
      </button>
    </div>

    <div className="societa-roster">
      {team.atleti.length > 0 ? (
        team.atleti.map((athlete) => {
          const canOpen = Boolean(onOpenAthlete && athlete.atletaId && !athlete.isDoppio);
          return (
            <AthleteRow
              key={`${team.squadraId}-${athlete.atletaId || athlete.nome}`}
              athlete={athlete}
              showRanking={showRanking}
              onOpen={canOpen ? () => onOpenAthlete?.(athlete) : undefined}
            />
          );
        })
      ) : (
        <div className="societa-empty-inline">
          <i className="bi bi-info-circle"></i>
          <span>Formazione non disponibile per questa squadra.</span>
        </div>
      )}
    </div>
  </div>
);

const SeasonChampionships: React.FC<{
  season: SocietaStagione;
  showRanking: boolean;
  onOpenAthlete?: (athlete: SocietaAtletaStagione) => void;
  onOpenChampionship?: (camId: number, anno: number) => void;
}> = ({ season, showRanking, onOpenAthlete, onOpenChampionship }) => {
  if (season.campionati.length === 0) {
    return (
      <div className="societa-empty-state">
        <i className="bi bi-calendar-x"></i>
        <span>Nessun campionato a squadre registrato per questa stagione.</span>
      </div>
    );
  }

  return (
    <div className="societa-champ-list">
      {season.campionati.map((camp) => (
        <div className="societa-champ-card" key={`${camp.anno}-${camp.campId}`}>
          <div className="societa-champ-head">
            <div className="societa-champ-title-wrap">
              <span className="societa-champ-name">{camp.nome}</span>
              <span className="societa-champ-sub">
                {camp.stagione || seasonLabelFromAnno(camp.anno)} · {camp.squadre.length}{' '}
                {camp.squadre.length === 1 ? 'squadra' : 'squadre'}
              </span>
            </div>
            <div className="societa-champ-actions">
              <a
                className="societa-icon-link"
                href={`${PORTAL_BASE}/risultati/archivio/ClassificaSquadre.asp?ANNATA=${camp.anno}&CAMP=${camp.campId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Apri la classifica ufficiale FITeT"
                onClick={(event) => event.stopPropagation()}
              >
                <i className="bi bi-box-arrow-up-right"></i>
              </a>
              {onOpenChampionship && (
                <button
                  type="button"
                  className="societa-open-champ-btn"
                  onClick={() => onOpenChampionship(camp.campId, camp.anno)}
                  title="Apri questo campionato nell'app"
                >
                  Apri <i className="bi bi-arrow-right-short"></i>
                </button>
              )}
            </div>
          </div>

          <div className="societa-team-list">
            {camp.squadre.map((team) => (
              <TeamBlock
                key={`${camp.anno}-${camp.campId}-${team.squadraId}`}
                team={team}
                showRanking={showRanking}
                onOpenAthlete={onOpenAthlete}
                onOpenChampionship={
                  onOpenChampionship ? () => onOpenChampionship(camp.campId, camp.anno) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const SocietaModal: React.FC<SocietaModalProps> = ({
  societyId,
  initialLookupQuery,
  initialInfo,
  annoId,
  zIndex,
  onClose,
  onSocietySelected,
  onOpenAtletaModal,
  onSelectChampionship,
}) => {
  useBodyScrollLock(true);

  const [activeSocietyId, setActiveSocietyId] = useState<string | null>(societyId);
  const [data, setData] = useState<SocietaDettaglio | null>(null);
  const [loading, setLoading] = useState(Boolean(societyId || initialLookupQuery));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manualQuery, setManualQuery] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(!societyId && !initialLookupQuery);

  const [openSeasons, setOpenSeasons] = useState<number[]>([]);
  const [seasonData, setSeasonData] = useState<Record<number, SocietaStagione>>({});
  const [seasonLoading, setSeasonLoading] = useState<Record<number, boolean>>({});
  const [seasonError, setSeasonError] = useState<Record<number, string>>({});

  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [resolvingAthlete, setResolvingAthlete] = useState<string | null>(null);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSocietyId(societyId);
    if (!societyId && !initialLookupQuery) {
      setShowManual(true);
    } else if (societyId) {
      setShowManual(false);
    }
  }, [societyId, initialLookupQuery]);

  // Risoluzione automatica quando la modale viene aperta per nome società (es. da AtletaModal o MyProfileHero)
  useEffect(() => {
    const q = (initialLookupQuery || '').trim();
    if (societyId || !q) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setShowManual(false);
    setData(null);

    lookupSocieta(q, annoId)
      .then((result) => {
        if (cancelled) return;
        if (!result.found || !result.societyId) {
          setLoading(false);
          setManualQuery(q);
          setShowManual(true);
          setManualError(`Società "${q}" non trovata nell'Albo Federale.`);
          return;
        }
        setActiveSocietyId(result.societyId);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setLoading(false);
        setError(err?.message || `Impossibile trovare la società "${q}".`);
      });

    return () => {
      cancelled = true;
    };
  }, [societyId, initialLookupQuery, annoId]);

  const loadSociety = (force = false) => {
    if (!activeSocietyId) return;
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    fetchSocieta(activeSocietyId, annoId, force)
      .then((result) => {
        setData(result);
        onSocietySelected(activeSocietyId, result.info);
      })
      .catch((err: any) => {
        setError(err?.message || 'Impossibile caricare la scheda società.');
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    if (!activeSocietyId) {
      setData(null);
      if (!initialLookupQuery) {
        setLoading(false);
      }
      return;
    }
    loadSociety();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSocietyId, annoId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const handleManualLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = manualQuery.trim();
    if (!query) {
      setManualError('Inserisci il nome di una squadra o l’ID Albo Federale.');
      return;
    }

    setManualLoading(true);
    setManualError(null);
    try {
      const result = await lookupSocieta(query, annoId);
      if (!result.found || !result.societyId) {
        setManualError(
          'Società non trovata. Controlla il nome della squadra o l’ID Albo Federale.'
        );
        return;
      }
      if (result.societyId !== activeSocietyId) {
        setData(null);
        setLoading(true);
        setError(null);
        setShowAllHistorical(false);
        setHistoricalError(null);
      }
      setActiveSocietyId(result.societyId);
      setShowManual(false);
      setOpenSeasons([]);
      setSeasonData({});
      onSocietySelected(result.societyId, result.info);
    } catch (err: any) {
      setManualError(err?.message || 'Errore nella ricerca della società.');
    } finally {
      setManualLoading(false);
    }
  };

  const toggleSeason = async (season: SocietaStagioneIndexItem) => {
    const anno = season.anno;
    const isOpen = openSeasons.includes(anno);
    if (isOpen) {
      setOpenSeasons((prev) => prev.filter((item) => item !== anno));
      return;
    }

    setOpenSeasons((prev) => [...prev, anno]);
    if (seasonData[anno] || seasonLoading[anno] || !activeSocietyId) return;

    setSeasonLoading((prev) => ({ ...prev, [anno]: true }));
    setSeasonError((prev) => ({ ...prev, [anno]: '' }));
    try {
      const result = await fetchSocietaStagione(activeSocietyId, anno);
      setSeasonData((prev) => ({ ...prev, [anno]: result }));
    } catch (err: any) {
      setSeasonError((prev) => ({
        ...prev,
        [anno]: err?.message || 'Errore nel caricamento della stagione.',
      }));
    } finally {
      setSeasonLoading((prev) => ({ ...prev, [anno]: false }));
    }
  };

  const info = data?.info || initialInfo || null;
  const currentSeason = data?.stagioneCorrente || null;

  const formAthletes = useMemo(() => {
    if (!currentSeason) return [];
    return [...currentSeason.atleti]
      .filter((athlete) => !athlete.isDoppio && athlete.partiteDisputate >= 2)
      .sort(
        (a, b) =>
          b.percentualeVittorie - a.percentualeVittorie ||
          b.partiteVinte - a.partiteVinte ||
          (b.rankPunti || 0) - (a.rankPunti || 0)
      )
      .slice(0, 4);
  }, [currentSeason]);

  const historicalSeasons = useMemo(() => {
    const list = data?.stagioni || [];
    return list.filter((season) => season.anno !== currentSeason?.anno);
  }, [data?.stagioni, currentSeason?.anno]);

  const historicalAthletes = useMemo(() => {
    const list = [...(data?.atletiStorici || [])].sort((a, b) => b.presenze - a.presenze);
    return showAllHistorical ? list : list.slice(0, 12);
  }, [data?.atletiStorici, showAllHistorical]);

  const handleOpenCurrentAthlete = (athlete: SocietaAtletaStagione) => {
    if (athlete.isDoppio || !athlete.atletaId || !onOpenAtletaModal) return;
    onOpenAtletaModal(athlete.atletaId, athlete.nome);
  };

  const handleOpenHistoricalAthlete = async (nome: string, tessera: string, atletaId?: string | null) => {
    if (!onOpenAtletaModal) return;
    if (atletaId) {
      onOpenAtletaModal(atletaId, nome);
      return;
    }

    setHistoricalError(null);
    setResolvingAthlete(tessera);
    try {
      const resolved = await resolveSocietaHistoricalAthlete(nome, tessera);
      if (resolved) {
        onOpenAtletaModal(resolved, nome);
      } else {
        setHistoricalError(`Non è stato possibile trovare la scheda di ${nome}.`);
      }
    } finally {
      setResolvingAthlete(null);
    }
  };

  const handleOpenChampionship = (camId: number, anno: number) => {
    if (!onSelectChampionship) return;
    onSelectChampionship(camId, anno);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  const titles = [
    ...(data?.titoliNazionali || []).map((title) => ({ ...title, scope: 'Nazionale' })),
    ...(data?.titoliRegionali || []).map((title) => ({ ...title, scope: 'Regionale' })),
  ];

  return createPortal(
    <div
      className="modal-backdrop-simple modal-referto-backdrop"
      style={zIndex ? { zIndex } : undefined}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="La mia società"
    >
      <div
        className="modal-card-simple referto-modal-card societa-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header-simple societa-modal-header">
          <div className="societa-header-main">
            <TeamLogo
              teamName={info?.nome || 'Società'}
              logoUrl={info?.logoUrl}
              size={54}
              className="societa-header-logo"
            />
            <div className="societa-header-text">
              <div className="societa-header-title-row">
                <h3 title={info?.nome}>{info?.nome || 'La mia società'}</h3>
                {info?.alboFederale && (
                  <span className="societa-badge">Albo {info.alboFederale}</span>
                )}
              </div>
              <div className="societa-header-meta">
                {info ? (
                  <>
                    {[info.citta, info.provincia].filter(Boolean).join(' (') && (
                      <span>
                        <i className="bi bi-geo-alt-fill"></i>{' '}
                        {info.citta}
                        {info.provincia ? ` (${info.provincia})` : ''}
                      </span>
                    )}
                    {info.primaAffiliazione && (
                      <span>
                        <i className="bi bi-flag-fill"></i> Dal {info.primaAffiliazione}
                      </span>
                    )}
                  </>
                ) : (
                  <span>Seleziona la tua società per iniziare</span>
                )}
              </div>
            </div>
          </div>

          <div className="societa-header-actions">
            {activeSocietyId && (
              <button
                type="button"
                className="societa-header-btn"
                onClick={() => {
                  setShowManual((prev) => !prev);
                  setManualQuery('');
                  setManualError(null);
                }}
                title="Cambia società"
              >
                <i className="bi bi-arrow-repeat"></i>
                <span>Cambia</span>
              </button>
            )}
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Chiudi"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div className="societa-modal-body">
          {showManual && (
            <section className="societa-manual-panel">
              <div className="societa-manual-icon">
                <i className="bi bi-buildings"></i>
              </div>
              <div className="societa-manual-content">
                <h4>
                  {activeSocietyId ? 'Cambia società' : 'Qual è la tua società?'}
                </h4>
                <p>
                  Inserisci il nome di una squadra (es. <strong>TT Petrolo Cosenza</strong>) oppure
                  l’ID Albo Federale (es. <strong>2904</strong>). La scelta verrà salvata su questo
                  dispositivo.
                </p>
                <form onSubmit={handleManualLookup} className="societa-manual-form">
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={(event) => {
                      setManualQuery(event.target.value);
                      setManualError(null);
                    }}
                    placeholder="Nome squadra o ID Albo Federale"
                    aria-label="Nome squadra o ID Albo Federale"
                    autoFocus
                  />
                  <button type="submit" className="societa-primary-btn" disabled={manualLoading}>
                    {manualLoading ? (
                      <>
                        <span className="societa-spinner"></span> Cerco…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-search"></i> Cerca
                      </>
                    )}
                  </button>
                </form>
                {manualError && (
                  <div className="societa-inline-error">
                    <i className="bi bi-exclamation-circle"></i> {manualError}
                  </div>
                )}
              </div>
            </section>
          )}

          {!activeSocietyId && !showManual && (
            <div className="societa-empty-state">
              <i className="bi bi-buildings"></i>
              <span>Nessuna società selezionata.</span>
              <button type="button" className="societa-primary-btn" onClick={() => setShowManual(true)}>
                Seleziona società
              </button>
            </div>
          )}

          {loading && !data && (
            <div className="societa-loading">
              <span className="societa-spinner societa-spinner-lg"></span>
              <span>Caricamento della società…</span>
            </div>
          )}

          {error && !loading && (
            <div className="societa-error-panel">
              <i className="bi bi-cloud-slash"></i>
              <div>
                <strong>Impossibile caricare la società</strong>
                <p>{error}</p>
              </div>
              <button type="button" className="societa-secondary-btn" onClick={() => loadSociety(true)}>
                Riprova
              </button>
            </div>
          )}

          {data && (
            <>
              {currentSeason ? (
                <section className="societa-section">
                  <div className="societa-section-head">
                    <div>
                      <span className="societa-eyebrow">Stagione in corso</span>
                      <h4 className="societa-section-title">
                        {currentSeason.stagione || seasonLabelFromAnno(currentSeason.anno)}
                      </h4>
                    </div>
                    <div className="societa-stats-row">
                      <div className="societa-stat">
                        <strong>{currentSeason.squadreCount}</strong>
                        <span>squadre</span>
                      </div>
                      <div className="societa-stat">
                        <strong>{currentSeason.puntiTotali}</strong>
                        <span>punti</span>
                      </div>
                      <div className="societa-stat">
                        <strong>{currentSeason.atletiCount}</strong>
                        <span>atleti</span>
                      </div>
                    </div>
                  </div>

                  {formAthletes.length > 0 && (
                    <div className="societa-form-panel">
                      <div className="societa-form-title">
                        <i className="bi bi-fire"></i>
                        <span>Atleti in forma</span>
                      </div>
                      <div className="societa-form-grid">
                        {formAthletes.map((athlete) => (
                          <button
                            type="button"
                            className="societa-form-card"
                            key={athlete.atletaId || athlete.nome}
                            onClick={() => handleOpenCurrentAthlete(athlete)}
                            disabled={!athlete.atletaId || !onOpenAtletaModal}
                            title={
                              athlete.atletaId
                                ? `Apri la scheda di ${athlete.nome}`
                                : athlete.nome
                            }
                          >
                            <AthleteAvatar
                              atletaId={athlete.atletaId}
                              nome={athlete.nome}
                              size={38}
                            />
                            <div className="societa-form-card-main">
                              <span className="societa-form-name">{athlete.nome}</span>
                              <span className="societa-form-team">{athlete.squadraNome}</span>
                            </div>
                            <div className="societa-form-values">
                              <span className="societa-form-pct">
                                {formatPct(athlete.percentualeVittorie)}
                              </span>
                              <span className="societa-form-record">
                                {athlete.partiteVinte}V / {athlete.partiteDisputate}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <SeasonChampionships
                    season={currentSeason}
                    showRanking
                    onOpenAthlete={handleOpenCurrentAthlete}
                    onOpenChampionship={onSelectChampionship ? handleOpenChampionship : undefined}
                  />
                </section>
              ) : (
                <div className="societa-empty-state">
                  <i className="bi bi-calendar-x"></i>
                  <span>Nessun campionato disponibile per la stagione in corso.</span>
                </div>
              )}

              {historicalSeasons.length > 0 && (
                <section className="societa-section">
                  <div className="societa-section-head">
                    <div>
                      <span className="societa-eyebrow">Storico</span>
                      <h4 className="societa-section-title">Stagioni precedenti</h4>
                    </div>
                    <span className="societa-section-hint">
                      {historicalSeasons.length} stagioni
                    </span>
                  </div>

                  <div className="societa-season-list">
                    {historicalSeasons.map((season) => {
                      const isOpen = openSeasons.includes(season.anno);
                      const isLoading = Boolean(seasonLoading[season.anno]);
                      const loaded = seasonData[season.anno];
                      const seasonErr = seasonError[season.anno];

                      return (
                        <div
                          className={`societa-season-item ${isOpen ? 'is-open' : ''}`}
                          key={season.anno}
                        >
                          <button
                            type="button"
                            className="societa-season-toggle"
                            onClick={() => toggleSeason(season)}
                            aria-expanded={isOpen}
                          >
                            <span className="societa-season-badge">{season.stagione}</span>
                            <span className="societa-season-champs">
                              {season.campionati.map((camp) => camp.nome).join(' · ')}
                            </span>
                            <span className="societa-season-arrow">
                              {isLoading ? (
                                <span className="societa-spinner"></span>
                              ) : (
                                <i
                                  className={`bi bi-chevron-${isOpen ? 'up' : 'down'}`}
                                ></i>
                              )}
                            </span>
                          </button>

                          {isOpen && (
                            <div className="societa-season-content">
                              {seasonErr ? (
                                <div className="societa-inline-error">
                                  <i className="bi bi-exclamation-circle"></i> {seasonErr}
                                </div>
                              ) : loaded ? (
                                <SeasonChampionships
                                  season={loaded}
                                  showRanking={false}
                                  onOpenAthlete={handleOpenCurrentAthlete}
                                />
                              ) : (
                                <div className="societa-loading societa-loading-inline">
                                  <span className="societa-spinner"></span>
                                  <span>Caricamento stagione…</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {data.atletiStorici.length > 0 && (
                <section className="societa-section">
                  <div className="societa-section-head">
                    <div>
                      <span className="societa-eyebrow">Archivio federale</span>
                      <h4 className="societa-section-title">Atleti storici</h4>
                    </div>
                    <span className="societa-section-hint">
                      {data.atletiStorici.length} tesserati
                    </span>
                  </div>

                  <div className="societa-historical-grid">
                    {historicalAthletes.map((athlete) => {
                      const isResolving = resolvingAthlete === athlete.tessera;
                      return (
                        <button
                          type="button"
                          className="societa-historical-item"
                          key={`${athlete.tessera}-${athlete.nome}`}
                          onClick={() =>
                            handleOpenHistoricalAthlete(
                              athlete.nome,
                              athlete.tessera,
                              athlete.atletaId
                            )
                          }
                          disabled={isResolving || !onOpenAtletaModal}
                          title={
                            onOpenAtletaModal
                              ? `Apri la scheda di ${athlete.nome}`
                              : athlete.nome
                          }
                        >
                          <AthleteAvatar
                            atletaId={athlete.atletaId}
                            nome={athlete.nome}
                            size={30}
                          />
                          <span className="societa-historical-name">{athlete.nome}</span>
                          <span className="societa-historical-presenze">
                            {isResolving ? (
                              <span className="societa-spinner"></span>
                            ) : (
                              <>
                                <strong>{athlete.presenze}</strong> pres.
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {data.atletiStorici.length > 12 && (
                    <button
                      type="button"
                      className="societa-link-btn"
                      onClick={() => setShowAllHistorical((prev) => !prev)}
                    >
                      {showAllHistorical
                        ? 'Mostra meno'
                        : `Mostra tutti (${data.atletiStorici.length})`}
                    </button>
                  )}

                  {historicalError && (
                    <div className="societa-inline-error">
                      <i className="bi bi-exclamation-circle"></i> {historicalError}
                    </div>
                  )}
                </section>
              )}

              {titles.length > 0 && (
                <section className="societa-section">
                  <div className="societa-section-head">
                    <div>
                      <span className="societa-eyebrow">Palmarès</span>
                      <h4 className="societa-section-title">Titoli individuali</h4>
                    </div>
                    <span className="societa-section-hint">{titles.length}</span>
                  </div>
                  <div className="societa-titles-list">
                    {titles.map((title, index) => (
                      <div className="societa-title-item" key={`${title.stagione}-${title.gara}-${index}`}>
                        <span className="societa-title-trophy">
                          <i className="bi bi-trophy-fill"></i>
                        </span>
                        <div className="societa-title-main">
                          <span className="societa-title-gara">{title.gara}</span>
                          <span className="societa-title-sub">
                            {title.stagione} · {title.torneo}
                            {title.dettaglio ? ` · ${title.dettaglio}` : ''}
                          </span>
                        </div>
                        <span className="societa-title-scope">{title.scope}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(info?.indirizzo || info?.email || info?.sito) && (
                <section className="societa-section societa-contacts">
                  <div className="societa-section-head">
                    <div>
                      <span className="societa-eyebrow">Contatti</span>
                      <h4 className="societa-section-title">Sede e riferimenti</h4>
                    </div>
                  </div>
                  <div className="societa-contact-list">
                    {info?.indirizzo && (
                      <div className="societa-contact-item">
                        <i className="bi bi-geo-alt-fill"></i>
                        <span>
                          {info.indirizzo}
                          {info.cap ? `, ${info.cap}` : ''} {info.citta}
                          {info.provincia ? ` (${info.provincia})` : ''}
                        </span>
                      </div>
                    )}
                    {info?.email && (
                      <div className="societa-contact-item">
                        <i className="bi bi-envelope-fill"></i>
                        <a href={`mailto:${info.email}`}>{info.email}</a>
                      </div>
                    )}
                    {info?.sito && (
                      <div className="societa-contact-item">
                        <i className="bi bi-globe2"></i>
                        <a href={info.sito} target="_blank" rel="noopener noreferrer">
                          {info.sito}
                        </a>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
