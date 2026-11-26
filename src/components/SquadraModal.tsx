import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioSquadra, AtletaSquadraDettaglio, SquadraClassifica } from '../types/fitet';
import { fetchDashboard, fetchSquadra, type SocietaLookupContext } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { useModalTransition } from '../utils/useModalTransition';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import { MarqueeText } from './MarqueeText';
import { SkeletonWrap, SkeletonStatsCard, SkeletonSectionHead, SkeletonTableRows } from './ModalSkeleton';

export interface SquadraModalProps {
  squadraId: string;
  squadraNome?: string;
  camId: number;
  annoId?: number;
  zIndex?: number;
  onClose: () => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
  onFilterCalendario?: (teamName: string) => void;
  onOpenSociety?: (societyName: string, context?: SocietaLookupContext) => void;
}

function getAthleteWinRate(a: AtletaSquadraDettaglio): { winRate: number; winRateColor: string } {
  let winRate = Number(a.percentualeVittorie) || 0;
  if (winRate > 100) {
    if (a.partiteDisputate > 0) {
      winRate = Math.round((a.partiteVinte / a.partiteDisputate) * 1000) / 10;
    } else {
      while (winRate > 100) winRate /= 10;
    }
  }
  winRate = Math.max(0, Math.min(100, winRate));
  const winRateColor = winRate >= 65 ? '#16a34a' : winRate >= 40 ? '#d97706' : '#dc2626';
  return { winRate, winRateColor };
}

function getDoubleInitials(nome: string): string {
  const parts = nome
    .split(/[-–/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export const SquadraModal: React.FC<SquadraModalProps> = ({
  squadraId,
  squadraNome,
  camId,
  annoId = 41,
  zIndex,
  onClose,
  onOpenAtletaModal,
  onFilterCalendario,
  onOpenSociety,
}) => {
  useBodyScrollLock(true);
  const { isClosing, requestClose } = useModalTransition(onClose);

  const [data, setData] = useState<DettaglioSquadra | null>(null);
  const [standingsRow, setStandingsRow] = useState<SquadraClassifica | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterFilter, setRosterFilter] = useState<'all' | 'singolo' | 'doppio'>('all');
  const [rosterViewMode, setRosterViewMode] = useState<'card' | 'list'>('card');

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

  // Recupera posizione in classifica e incontri V/P della squadra dal dashboard del campionato
  useEffect(() => {
    if (!camId) {
      setStandingsRow(null);
      return;
    }
    let active = true;
    fetchDashboard(camId, annoId)
      .then((dash) => {
        if (!active || !dash?.classifica?.length) return;
        const norm = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const targetName = norm(data?.nome || squadraNome);
        const found =
          dash.classifica.find((t) => t.squadraId && t.squadraId === squadraId) ||
          (targetName ? dash.classifica.find((t) => norm(t.nome) === targetName) : undefined);
        if (active) setStandingsRow(found || null);
      })
      .catch(() => {
        if (active) setStandingsRow(null);
      });
    return () => {
      active = false;
    };
  }, [camId, annoId, squadraId, data?.nome, squadraNome]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [requestClose]);

  // Totals calculation
  const totalMatchesDisputate = data?.atleti.reduce((acc, a) => acc + a.partiteDisputate, 0) || 0;
  const totalMatchesVinte = data?.atleti.reduce((acc, a) => acc + a.partiteVinte, 0) || 0;
  const totalMatchesPerse = data?.atleti.reduce((acc, a) => acc + a.partitePerse, 0) || 0;
  const totalSetVinti = data?.atleti.reduce((acc, a) => acc + a.setVinti, 0) || 0;
  const totalSetPersi = data?.atleti.reduce((acc, a) => acc + a.setPersi, 0) || 0;
  const teamWinRate = totalMatchesDisputate > 0 ? Math.round((totalMatchesVinte / totalMatchesDisputate) * 100) : 0;
  const setDiff = totalSetVinti - totalSetPersi;

  const displayName = data?.nome || squadraNome || `Squadra ${squadraId}`;
  const headerDisplayName = displayName
    .replace(/\bdilettantistic[ao]\b\.?/gi, 'D.')
    .replace(/\btennis\s*tavolo\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const isCompactState = !loading && Boolean(error && !data);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`modal-backdrop-simple modal-referto-backdrop ${isClosing ? 'modal-closing' : ''}`}
      style={zIndex ? { zIndex } : undefined}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-card-simple referto-modal-card squadra-modal-card ${isClosing ? 'is-closing' : ''} ${isCompactState ? 'is-compact-state' : ''}`}
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
                  {headerDisplayName}
                </h3>
                <span className="modal-badge-pill">
                  FITeT #{camId}
                </span>
              </div>

            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
            {onOpenSociety && displayName && (
              <button
                type="button"
                className="btn-action squadra-header-filter-btn"
                onClick={() =>
                  onOpenSociety(displayName, {
                    squadraId: data?.squadraId || (/^\d+$/.test(squadraId) ? squadraId : null),
                    camId: camId || null,
                    logoUrl: data?.logoUrl || null,
                  })
                }
                title={`Apri scheda società ${displayName}`}
              >
                <i className="bi bi-building me-1"></i>
                <span className="d-none d-sm-inline">Società</span>
              </button>
            )}
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
              onClick={requestClose}
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
            <SkeletonWrap
              label="Caricamento dati squadra"
              caption="Caricamento scheda squadra e percentuali atleti da portale.fitet.org..."
            >
              <SkeletonStatsCard cols={4} />
              <div style={{ marginTop: '18px' }}>
                <SkeletonSectionHead titleW={180} badgeW={80} />
                <SkeletonTableRows count={6} hasAvatar cols={3} />
              </div>
            </SkeletonWrap>
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
              {/* Posizione in classifica & Incontri V/P (stile societa-stats-row) */}
              {standingsRow && (
                <div className="societa-stats-row" style={{ marginBottom: '12px', justifyContent: 'flex-end' }}>
                  <div className="societa-stat">
                    <strong>{standingsRow.posizione ? `#${standingsRow.posizione}` : '—'}</strong>
                    <span>classifica</span>
                  </div>
                  <div className="societa-stat">
                    <strong>{standingsRow.incontriVinti}</strong>
                    <span>incontri Vinti</span>
                  </div>
                  <div className="societa-stat">
                    <strong>{standingsRow.incontriPersi}</strong>
                    <span>incontri Persi</span>
                  </div>
                </div>
              )}

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
                <div className="pill-switcher-container">
                  <button
                    type="button"
                    onClick={() => setRosterViewMode('card')}
                    title="Vista Card"
                    className={`pill-switcher-btn ${rosterViewMode === 'card' ? 'active' : ''}`}
                  >
                    <i className="bi bi-grid-3x3-gap me-1"></i>Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterViewMode('list')}
                    title="Vista Elenco"
                    className={`pill-switcher-btn ${rosterViewMode === 'list' ? 'active' : ''}`}
                  >
                    <i className="bi bi-list-ul me-1"></i>Elenco
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="squadra-mobile-filter-bar">
                <div className="squadra-mobile-filter-pills" role="tablist" aria-label="Filtra atleti">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rosterFilter === 'all'}
                    className={`squadra-mobile-filter-pill${rosterFilter === 'all' ? ' is-active' : ''}`}
                    onClick={() => setRosterFilter('all')}
                  >
                    Tutti ({data.atleti.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rosterFilter === 'singolo'}
                    className={`squadra-mobile-filter-pill${rosterFilter === 'singolo' ? ' is-active' : ''}`}
                    onClick={() => setRosterFilter('singolo')}
                  >
                    Singolo
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rosterFilter === 'doppio'}
                    className={`squadra-mobile-filter-pill${rosterFilter === 'doppio' ? ' is-active' : ''}`}
                    onClick={() => setRosterFilter('doppio')}
                  >
                    Doppio
                  </button>
                </div>
                <span className="squadra-mobile-record-pill">
                  {data.atleti.filter((a) =>
                    rosterFilter === 'all' ? true : rosterFilter === 'singolo' ? !a.isDoppio : a.isDoppio
                  ).length}{' '}
                  record
                </span>
              </div>

              {/* Vista Card (Default) */}
              {rosterViewMode === 'card' ? (
                <div className="squadra-mobile-carousel-wrap">
                  <div className="squadra-mobile-carousel" role="region" aria-label="Atleti della squadra">
                    {data.atleti
                      .filter((a) =>
                        rosterFilter === 'all' ? true : rosterFilter === 'singolo' ? !a.isDoppio : a.isDoppio
                      )
                      .map((a: AtletaSquadraDettaglio, idx: number) => {
                        const isClickable = !a.isDoppio && Boolean(a.atletaId) && Boolean(onOpenAtletaModal);
                        const { winRate, winRateColor } = getAthleteWinRate(a);
                        const ringRadius = 31;
                        const ringCircumference = 2 * Math.PI * ringRadius;
                        const ringOffset = ringCircumference * (1 - winRate / 100);
                        const doubleInitials = a.isDoppio ? getDoubleInitials(a.nome) : '';

                        return (
                          <div
                            key={`mobile_${a.atletaId || a.nome}_${idx}`}
                            role={isClickable ? 'button' : undefined}
                            tabIndex={isClickable ? 0 : undefined}
                            onClick={() => {
                              if (isClickable && onOpenAtletaModal) {
                                onOpenAtletaModal(a.atletaId, a.nome);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (isClickable && onOpenAtletaModal && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                onOpenAtletaModal(a.atletaId, a.nome);
                              }
                            }}
                            className={`squadra-mobile-card${isClickable ? ' is-clickable' : ''}`}
                          >
                            <div className="squadra-mobile-card-top">
                              {a.isDoppio ? (
                                <div className="squadra-mobile-doppio-circles" title="Coppia di doppio">
                                  <span className="squadra-doppio-circle is-icon">
                                    <i className="bi bi-people-fill" />
                                  </span>
                                  <span className="squadra-doppio-circle is-initials">
                                    +{doubleInitials}
                                  </span>
                                </div>
                              ) : (
                                <div className="squadra-mobile-ring-wrap">
                                  <svg
                                    className="squadra-mobile-ring-svg"
                                    viewBox="0 0 70 70"
                                    aria-hidden="true"
                                  >
                                    <circle
                                      className="squadra-mobile-ring-track"
                                      cx="35"
                                      cy="35"
                                      r={ringRadius}
                                    />
                                    {winRate > 0 && (
                                      <circle
                                        className="squadra-mobile-ring-fill"
                                        cx="35"
                                        cy="35"
                                        r={ringRadius}
                                        stroke={winRateColor}
                                        strokeDasharray={ringCircumference}
                                        strokeDashoffset={ringOffset}
                                      />
                                    )}
                                  </svg>
                                  <div className="squadra-mobile-ring-avatar">
                                    <AthleteAvatar atletaId={a.atletaId} nome={a.nome} size={54} avatarPlaceholder />
                                  </div>
                                </div>
                              )}

                              <div className="squadra-mobile-card-name" title={a.nome}>
                                {a.nome}
                              </div>

                              <span className="squadra-mobile-rank-pill">
                                {a.isDoppio
                                  ? 'Doppio'
                                  : a.rankPosizione
                                    ? `#${a.rankPosizione}`
                                    : 'N.C.'}
                              </span>
                            </div>

                            <div className="squadra-mobile-card-stats">
                              <div className="squadra-mobile-stat-line">
                                <span className="squadra-mobile-stat-lbl">Partite V/P</span>
                                <span
                                  className="squadra-mobile-vp-badge"
                                  style={{
                                    color: winRateColor,
                                    backgroundColor: `${winRateColor}1a`,
                                  }}
                                >
                                  {a.partiteVinte} / {a.partitePerse}
                                </span>
                              </div>
                              <div className="squadra-mobile-stat-line">
                                <span className="squadra-mobile-stat-lbl">Vittorie</span>
                                <span className="squadra-mobile-pct-val" style={{ color: winRateColor }}>
                                  {winRate}%
                                </span>
                              </div>
                              <div className="progress-win-rate-track">
                                <div
                                  className="progress-win-rate-bar"
                                  style={{ width: `${winRate}%`, background: winRateColor }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                /* Vista Elenco (Tabella) */
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
                      {data.atleti
                        .filter((a) =>
                          rosterFilter === 'all' ? true : rosterFilter === 'singolo' ? !a.isDoppio : a.isDoppio
                        )
                        .map((a: AtletaSquadraDettaglio, idx: number) => {
                          const isClickable = !a.isDoppio && Boolean(a.atletaId) && Boolean(onOpenAtletaModal);
                          const { winRate, winRateColor } = getAthleteWinRate(a);

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
                                    {winRate}%
                                  </span>
                                  <div className="mini-progress-track">
                                    <div
                                      style={{
                                        width: `${winRate}%`,
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
