import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioSquadra, AtletaSquadraDettaglio } from '../types/fitet';
import { fetchSquadra } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';

export interface SquadraModalProps {
  squadraId: string;
  squadraNome?: string;
  camId: number;
  annoId?: number;
  onClose: () => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
  onFilterCalendario?: (teamName: string) => void;
}

export const SquadraModal: React.FC<SquadraModalProps> = ({
  squadraId,
  squadraNome,
  camId,
  annoId = 41,
  onClose,
  onOpenAtletaModal,
  onFilterCalendario,
}) => {
  useBodyScrollLock(true);

  const [data, setData] = useState<DettaglioSquadra | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchSquadra(squadraId, camId, annoId, force);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento dei dettagli della squadra');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [squadraId, camId, annoId]);

  // Handle ESC key to close
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

  // Totals calculation
  const totalMatchesDisputate = data?.atleti.reduce((acc, a) => acc + a.partiteDisputate, 0) || 0;
  const totalMatchesVinte = data?.atleti.reduce((acc, a) => acc + a.partiteVinte, 0) || 0;
  const totalMatchesPerse = data?.atleti.reduce((acc, a) => acc + a.partitePerse, 0) || 0;
  const totalSetVinti = data?.atleti.reduce((acc, a) => acc + a.setVinti, 0) || 0;
  const totalSetPersi = data?.atleti.reduce((acc, a) => acc + a.setPersi, 0) || 0;
  const teamWinRate = totalMatchesDisputate > 0 ? Math.round((totalMatchesVinte / totalMatchesDisputate) * 100) : 0;
  const setDiff = totalSetVinti - totalSetPersi;

  const displayName = data?.nome || squadraNome || `Squadra ${squadraId}`;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop-simple modal-referto-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card-simple referto-modal-card squadra-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simple Blue Header matching the app's design system */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <TeamLogo
              teamName={displayName}
              logoUrl={data?.logoUrl}
              size={44}
              className="squadra-header-logo-box"
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 className="squadra-header-title" title={displayName}>
                  {displayName}
                </h3>
                <span className="modal-badge-pill">
                  FITeT #{camId}
                </span>
              </div>

            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
            {onFilterCalendario && (
              <button
                type="button"
                className="btn-action squadra-header-filter-btn"
                onClick={() => {
                  onFilterCalendario(displayName);
                  onClose();
                }}
                title="Filtra gli incontri di questa squadra nel Calendario"
              >
                <i className="bi bi-calendar-event me-1"></i>
                <span className="d-none d-sm-inline">Filtra Incontri</span>
              </button>
            )}

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
        <div className="modal-body-simple" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {loading && !data && (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
                <span className="visually-hidden">Caricamento...</span>
              </div>
              <div style={{ fontSize: '14.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-dark)' }}>
                Caricamento scheda squadra e percentuali atleti...
              </div>
              <div style={{ fontSize: '12px' }}>Interrogazione in tempo reale di portale.fitet.org</div>
            </div>
          )}

          {error && !data && (
            <div className="squadra-error-banner">
              <strong>Errore:</strong> {error}
              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-open-referto"
                  onClick={() => loadData(true)}
                  style={{ fontSize: '12px', padding: '5px 12px' }}
                >
                  Riprova
                </button>
              </div>
            </div>
          )}

          {data && (
            <div>
              {/* Summary Highlight Card in the exact style of overview-stats-card */}
              <div className="overview-stats-card" style={{ marginBottom: '18px' }}>
                <div className="overview-stats-row">
                  {/* 1. Atleti Tesserati */}
                  <div
                    className="overview-stat-col"
                    title={`Atleti Tesserati: ${data.atleti.filter((a) => !a.isDoppio).length} (Roster Ufficiale FITeT)`}
                  >
                    <span className="overview-stat-label">Atleti</span>
                    <MarqueeText
                      className="overview-stat-value"
                      text={String(data.atleti.filter((a) => !a.isDoppio).length)}
                    />
                    <MarqueeText className="overview-stat-sub" text="Roster FITeT" />
                  </div>

                  <div className="overview-stat-divider" aria-hidden="true" />

                  {/* 2. Partite Vinte - Perse */}
                  <div
                    className="overview-stat-col"
                    title={`Partite Vinte: ${totalMatchesVinte}, Perse: ${totalMatchesPerse} (${totalMatchesDisputate} partite totali)`}
                  >
                    <span className="overview-stat-label">Partite V/P</span>
                    <MarqueeText className="overview-stat-value">
                      <span style={{ color: '#4ade80' }}>{totalMatchesVinte}</span>{' '}
                      <span className="overview-stat-slash">-</span>{' '}
                      <span style={{ color: '#f87171' }}>{totalMatchesPerse}</span>
                    </MarqueeText>
                    <MarqueeText className="overview-stat-sub" text={`${totalMatchesDisputate} totali`} />
                  </div>

                  <div className="overview-stat-divider" aria-hidden="true" />

                  {/* 3. Set Vinti - Persi */}
                  <div
                    className="overview-stat-col"
                    title={`Set Vinti: ${totalSetVinti}, Persi: ${totalSetPersi} (Diff: ${setDiff > 0 ? `+${setDiff}` : setDiff})`}
                  >
                    <span className="overview-stat-label">Set V/P</span>
                    <MarqueeText className="overview-stat-value">
                      {totalSetVinti} <span className="overview-stat-slash">:</span> {totalSetPersi}
                    </MarqueeText>
                    <MarqueeText
                      className="overview-stat-sub"
                      text={`Diff: ${setDiff > 0 ? `+${setDiff}` : setDiff}`}
                    />
                  </div>

                  <div className="overview-stat-divider" aria-hidden="true" />

                  {/* 4. % Vittorie Squadra */}
                  <div
                    className="overview-stat-col"
                    title={`% Vittorie Squadra: ${teamWinRate}% (Rendimento complessivo)`}
                  >
                    <span className="overview-stat-label">% Vittorie</span>
                    <MarqueeText
                      className="overview-stat-value"
                      text={`${teamWinRate}%`}
                      style={{ color: '#fbbf24' }}
                    />
                    <MarqueeText className="overview-stat-sub" text="Rendimento" />
                  </div>
                </div>
              </div>

              {/* Roster Section Header */}
              <div className="squadra-section-header">
                <div>
                  <h4 className="squadra-section-title">
                    Statistiche Individuali
                  </h4>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Clicca su un atleta per visualizzare la scheda anagrafica federale e lo storico punti
                  </div>
                </div>
                <span className="squadra-roster-count">
                  {data.atleti.length} {data.atleti.length === 1 ? 'record' : 'record'}
                </span>
              </div>

              {/* Roster Table */}
              <div className="squadra-table-wrapper">
                <table className="squadra-roster-table">
                  <thead>
                    <tr className="squadra-roster-thead-tr">
                      <th style={{ padding: '10px 12px' }}>Atleta</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>Ranking</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }} title="Partite Disputate">PD</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }} title="Partite Vinte">PaV</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }} title="Partite Perse">PaP</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }} title="Set Vinti / Persi">Set</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }} title="Punti Vinti / Persi">Punti</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }} title="% Partite Vinte">% Vittorie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atleti.map((a: AtletaSquadraDettaglio, idx: number) => {
                      const isClickable = !a.isDoppio && Boolean(a.atletaId) && Boolean(onOpenAtletaModal);
                      const winRateColor =
                        a.percentualeVittorie >= 65
                          ? '#16a34a'
                          : a.percentualeVittorie >= 40
                          ? '#d97706'
                          : '#dc2626';

                      return (
                        <tr
                          key={`${a.atletaId || a.nome}_${idx}`}
                          onClick={() => {
                            if (isClickable && onOpenAtletaModal) {
                              onOpenAtletaModal(a.atletaId, a.nome);
                            }
                          }}
                          className={`squadra-roster-tr ${isClickable ? 'is-clickable hover-row-highlight' : ''}`}
                          title={isClickable ? `Visualizza scheda federale di ${a.nome}` : undefined}
                        >
                          {/* Athlete Info */}
                          <td style={{ padding: '9px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {a.isDoppio ? (
                                <div
                                  className="squadra-doppio-avatar"
                                  title="Coppia di doppio"
                                >
                                  <i className="bi bi-people-fill text-secondary"></i>
                                </div>
                              ) : (
                                <AthleteAvatar atletaId={a.atletaId} nome={a.nome} size={30} />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div className={`squadra-roster-name ${isClickable ? 'is-clickable' : ''}`}>
                                  <span style={{ textDecoration: isClickable ? 'underline' : 'none', textUnderlineOffset: '2px' }}>
                                    {a.nome}
                                  </span>
                                  {isClickable && (
                                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: '10.5px', opacity: 0.75 }}></i>
                                  )}
                                </div>
                                {a.isDoppio && (
                                  <span className="squadra-doppio-badge">
                                    Doppio
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Ranking */}
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            {a.isDoppio ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>-</span>
                            ) : a.rankPosizione || a.rankPunti ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                {a.rankPosizione && (
                                  <span className="squadra-rank-pos">
                                    #{a.rankPosizione}
                                  </span>
                                )}
                                {a.rankPunti !== null && (
                                  <span className="squadra-rank-pts">
                                    {a.rankPunti.toLocaleString('it-IT')} pt
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>N.C.</span>
                            )}
                          </td>

                          {/* PD */}
                          <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 600 }}>
                            {a.partiteDisputate}
                          </td>

                          {/* PaV */}
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                            {a.partiteVinte}
                          </td>

                          {/* PaP */}
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>
                            {a.partitePerse}
                          </td>

                          {/* SV / SP */}
                          <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>{a.setVinti}</span>
                            <span style={{ margin: '0 2px', color: 'var(--text-muted)' }}>:</span>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{a.setPersi}</span>
                          </td>

                          {/* PV / PP */}
                          <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '11.5px' }}>
                            <span style={{ color: 'var(--text-dark)' }}>{a.puntiVinti}</span>
                            <span style={{ margin: '0 2px', color: 'var(--text-muted)' }}>-</span>
                            <span style={{ color: 'var(--text-muted)' }}>{a.puntiPersi}</span>
                          </td>

                          {/* % pv */}
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: winRateColor,
                                }}
                              >
                                {a.percentualeVittorie}%
                              </span>
                              <div className="mini-progress-track">
                                <div
                                  style={{
                                    width: `${a.percentualeVittorie}%`,
                                    height: '100%',
                                    background: winRateColor,
                                    borderRadius: '3px',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
