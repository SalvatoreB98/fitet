import React, { useState, useEffect } from 'react';
import { RankingAthleteItem, RankingPageResult } from '../types/fitet';
import { fetchRanking } from '../services/api';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import './ClassificheRankingTab.css';

export interface ClassificheRankingTabProps {
  onOpenAtletaModal: (atletaId: string, nome: string) => void;
  onOpenSearchModal?: () => void;
}

export const REGIONS_COMIT = [
  { id: 0, name: 'Tutte (Nazionale)' },
  { id: 14, name: 'Abruzzo' },
  { id: 7, name: 'Alto Adige' },
  { id: 17, name: 'Basilicata' },
  { id: 19, name: 'Calabria' },
  { id: 16, name: 'Campania' },
  { id: 9, name: 'Emilia Romagna' },
  { id: 8, name: 'Friuli Venezia Giulia' },
  { id: 13, name: 'Lazio' },
  { id: 3, name: 'Liguria' },
  { id: 4, name: 'Lombardia' },
  { id: 11, name: 'Marche' },
  { id: 15, name: 'Molise' },
  { id: 2, name: 'Piemonte' },
  { id: 18, name: 'Puglia' },
  { id: 21, name: 'Sardegna' },
  { id: 20, name: 'Sicilia' },
  { id: 10, name: 'Toscana' },
  { id: 6, name: 'Trentino' },
  { id: 12, name: 'Umbria' },
  { id: 1, name: "Valle d'Aosta" },
  { id: 5, name: 'Veneto' },
];

export const ClassificheRankingTab: React.FC<ClassificheRankingTabProps> = ({
  onOpenAtletaModal,
  onOpenSearchModal,
}) => {
  const [sesso, setSesso] = useState<'M' | 'F'>('M');
  const [comitId, setComitId] = useState<number>(0); // 0 = Nazionale
  const [page, setPage] = useState<number>(1);
  const [data, setData] = useState<RankingPageResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadRanking = async (targetPage = page, targetSesso = sesso, targetComit = comitId, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchRanking(targetPage, targetSesso, targetComit > 0 ? targetComit : undefined, force);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento della classifica.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRanking(page, sesso, comitId);
  }, [page, sesso, comitId]);

  const handleComitChange = (newComit: number) => {
    setComitId(newComit);
    setPage(1);
  };

  const handleSessoChange = (newSesso: 'M' | 'F') => {
    setSesso(newSesso);
    setPage(1);
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (data && page < data.totalPages) {
      setPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const formatPoints = (points: number) => {
    return new Intl.NumberFormat('it-IT').format(points);
  };

  const selectedRegionName = REGIONS_COMIT.find((r) => r.id === comitId)?.name || 'Nazionale';

  return (
    <div className="ranking-tab-container">
      {/* Top Filter Bar */}
      <div className="ranking-filter-card">
        <div className="ranking-filter-header">

          {/* Gender Selector Buttons */}
          <div className="ranking-gender-group" role="group" aria-label="Sesso">
            <button
              type="button"
              className={`ranking-gender-btn ${sesso === 'M' ? 'active' : ''}`}
              onClick={() => handleSessoChange('M')}
            >
              <i className="bi bi-gender-male me-1"></i>
              Maschile
            </button>
            <button
              type="button"
              className={`ranking-gender-btn ${sesso === 'F' ? 'active' : ''}`}
              onClick={() => handleSessoChange('F')}
            >
              <i className="bi bi-gender-female me-1"></i>
              Femminile
            </button>
          </div>
        </div>

        <div className="ranking-controls-row">
          {/* Region Dropdown */}
          <div className="ranking-region-select-wrap">
            <label htmlFor="ranking-region-select" className="ranking-select-label">
              <i className="bi bi-geo-alt-fill me-1"></i>
              Regione:
            </label>
            <div className="ranking-select-inner">
              <select
                id="ranking-region-select"
                className="ranking-select-input"
                value={comitId}
                onChange={(e) => handleComitChange(Number(e.target.value))}
              >
                {REGIONS_COMIT.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name}
                  </option>
                ))}
              </select>
              <i className="bi bi-chevron-down ranking-select-chevron"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading && !refreshing ? (
        <div className="ranking-loading-state">
          <div className="spinner-border text-primary" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <p className="ranking-loading-text">Caricamento classifica ufficiale FITeT...</p>
        </div>
      ) : error ? (
        <div className="ranking-error-card">
          <div className="ranking-error-icon">
            <i className="bi bi-exclamation-triangle-fill"></i>
          </div>
          <h3>Impossibile caricare la classifica</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn-action"
            onClick={() => loadRanking(page, sesso, comitId, true)}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Riprova
          </button>
        </div>
      ) : data && data.athletes.length > 0 ? (
        <div className="ranking-card-block primary-official ranking-table-card">
          <div className="ranking-section-header official-header">
            <div className="official-title-group">
              <span className="official-crown">
                <i className="bi bi-trophy-fill text-warning"></i>
              </span>
              <div>
                <div className="official-main-title">Classifica Ufficiale</div>
              </div>
            </div>
            <div className="official-badge-group">
              <span className="section-badge">{selectedRegionName} • {sesso === 'M' ? 'Maschile' : 'Femminile'}</span>
            </div>
          </div>

          <div className="table-responsive">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  <th className="th-athlete">Atleta</th>
                  <th className="th-date hide-xs">Nascita</th>
                  <th className="th-settore hide-xs">Sett.</th>
                  <th className="th-points text-end">Punti</th>
                  <th className="th-posnaz hide-sm text-center">Pos. Naz</th>
                  <th className="th-provincia hide-md">Provincia</th>
                  <th className="th-cat text-center">Cat.</th>
                </tr>
              </thead>
              <tbody>
                {data.athletes.map((ath: RankingAthleteItem) => {
                  const isPodium = ath.rank <= 3;
                  return (
                    <tr
                      key={`${ath.atletaId || ath.nome}-${ath.rank}`}
                      className={`ranking-row ${isPodium ? `podium-rank-${ath.rank}` : ''}`}
                      onClick={() => onOpenAtletaModal(ath.atletaId, ath.nome)}
                      title="Clicca per aprire la scheda atleta"
                    >
                      {/* Rank Position */}
                      <td className="td-rank">
                        <span className={`rank-badge rank-badge-${ath.rank <= 3 ? ath.rank : 'default'}`}>
                          {ath.rank === 1 && <i className="bi bi-trophy-fill rank-medal gold"></i>}
                          {ath.rank === 2 && <i className="bi bi-trophy-fill rank-medal silver"></i>}
                          {ath.rank === 3 && <i className="bi bi-trophy-fill rank-medal bronze"></i>}
                          {ath.rank}
                        </span>
                      </td>

                      {/* Athlete Name */}
                      <td className="td-athlete">
                        <div className="athlete-row-cell">
                          <AthleteAvatar
                            atletaId={ath.atletaId}
                            nome={ath.nome}
                            size={28}
                            className="ranking-athlete-avatar"
                          />
                          <div className="athlete-name-cell">
                            <button
                              type="button"
                              className="athlete-link-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAtletaModal(ath.atletaId, ath.nome);
                              }}
                            >
                              <MarqueeText text={ath.nome} className="athlete-link-text" />
                              <i className="bi bi-arrow-up-right athlete-link-arrow"></i>
                            </button>
                            {/* Mobile submeta */}
                            <div className="athlete-mobile-meta show-xs">
                              {ath.provinciaOrRegione && <span>{ath.provinciaOrRegione}</span>}
                              {ath.settore && <span> • {ath.settore}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Data Nascita */}
                      <td className="td-date hide-xs">
                        <span className="date-text">{ath.dataNascita || '-'}</span>
                      </td>

                      {/* Settore */}
                      <td className="td-settore hide-xs">
                        <span className="settore-badge">{ath.settore || '-'}</span>
                      </td>

                      {/* Punti */}
                      <td className="td-points text-end">
                        <span className="badge-points-official">{formatPoints(ath.punti)}</span>
                      </td>

                      {/* Pos Naz */}
                      <td className="td-posnaz hide-sm text-center">
                        <span className="posnaz-text">{ath.posNazOrVariazione || '-'}</span>
                      </td>

                      {/* Provincia */}
                      <td className="td-provincia hide-md">
                        <span className="provincia-text">{ath.provinciaOrRegione || '-'}</span>
                      </td>

                      {/* Categoria */}
                      <td className="td-cat text-center">
                        <span className={`cat-pill cat-pill-${ath.categoria || 'default'}`}>
                          {ath.categoria ? `${ath.categoria}ª` : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="ranking-pagination-bar">
            <button
              type="button"
              className="ranking-page-nav-btn"
              onClick={handlePrevPage}
              disabled={page <= 1}
              aria-label="Pagina precedente"
            >
              <i className="bi bi-chevron-left me-1"></i>
              Precedente
            </button>

            <div className="ranking-page-indicator">
              <span>
                Pagina <strong>{page}</strong> di <strong>{data.totalPages}</strong>
              </span>
            </div>

            <button
              type="button"
              className="ranking-page-nav-btn"
              onClick={handleNextPage}
              disabled={page >= data.totalPages}
              aria-label="Pagina successiva"
            >
              Successiva
              <i className="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      ) : (
        <div className="ranking-empty-card">
          <i className="bi bi-clipboard-x ranking-empty-icon"></i>
          <h3>Nessun atleta trovato</h3>
          <p>Non ci sono atleti registrati per i filtri selezionati ({selectedRegionName}, {sesso === 'M' ? 'Maschile' : 'Femminile'}).</p>
        </div>
      )}
    </div>
  );
};
