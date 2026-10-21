import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite } from '../services/api';
import { RatingChart } from './RatingChart';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface AtletaModalProps {
  atletaId: string;
  athleteName?: string;
  returnLabel?: string;
  camId?: string | null;
  campionatoNome?: string | null;
  onClose: () => void;
}

export const AtletaModal: React.FC<AtletaModalProps> = ({
  atletaId,
  athleteName,
  returnLabel,
  camId,
  campionatoNome,
  onClose,
}) => {
  useBodyScrollLock(true);

  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);

  // Partite nel campionato attualmente aperto
  const [campionatoPartite, setCampionatoPartite] = useState<PartitaCampionatoAtleta[] | null>(null);
  const [squadraCampionato, setSquadraCampionato] = useState<string | null>(null);
  const [loadingPartite, setLoadingPartite] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchAtleta(atletaId)
      .then((data) => {
        if (isMounted) {
          setAtleta(data);
          setLoading(false);

          // Se camId è presente e non abbiamo ancora provato con il nome anagrafico risolto
          if (camId) {
            setLoadingPartite(true);
            fetchAtletaCampionatoPartite(atletaId, camId, undefined, athleteName || data.anagrafica.nome)
              .then((res) => {
                if (isMounted) {
                  setCampionatoPartite(res.matches || []);
                  setSquadraCampionato(res.squadra || null);
                  setLoadingPartite(false);
                }
              })
              .catch(() => {
                if (isMounted) {
                  setCampionatoPartite([]);
                  setLoadingPartite(false);
                }
              });
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Impossibile caricare i dati atleta');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [atletaId, camId, athleteName]);

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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop-simple modal-athlete-backdrop" onClick={onClose}>
      <div className="modal-card-simple" onClick={(e) => e.stopPropagation()}>
        {/* Simple Blue Header */}
        <div className="modal-header-simple">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Scheda Ranking FITeT — {atleta?.anagrafica?.nome || athleteName || 'Atleta'}
              </h3>
              <div style={{ fontSize: '11px', color: '#bfdbfe', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : 'In risoluzione...')} • Classifica Unica Nazionale
              </div>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn-red"
            onClick={onClose}
            title="Chiudi finestra (ESC)"
            aria-label="Chiudi finestra"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple">
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Caricamento dati dal portale FITeT in corso...
              </div>
              <div style={{ fontSize: '12px' }}>Lettura anagrafica e storico punti</div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#fee2e2',
                color: '#b91c1c',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              <strong>Errore:</strong> {error}
            </div>
          )}

          {atleta && !loading && (
            <div>
              {/* Profile Bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  paddingBottom: '16px',
                  marginBottom: '16px',
                  borderBottom: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: '74px',
                    height: '74px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: 'var(--bg-th)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {!imgError && atleta.anagrafica.fotoUrl ? (
                    <img
                      src={atleta.anagrafica.fotoUrl}
                      alt={atleta.anagrafica.nome}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-muted)' }}>
                      {atleta.anagrafica.nome.slice(0, 2)}
                    </span>
                  )}
                </div>

                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-dark)', fontFamily: 'var(--font-serif)' }}>
                    {atleta.anagrafica.nome}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <strong>Società:</strong> {atleta.anagrafica.societa || 'N.D.'} {atleta.anagrafica.regione && `(${atleta.anagrafica.regione})`}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span className="badge pct-high">Cat: {atleta.anagrafica.categoria || 'N.D.'}</span>
                    <span className="badge pct-mid">Stato: {atleta.anagrafica.stato || 'Attivo'}</span>
                    {atleta.anagrafica.settore && (
                      <span className="badge pct-zero">{atleta.anagrafica.settore}</span>
                    )}
                    {atleta.anagrafica.dataNascita && (
                      <span className="badge pct-zero">Nascita: {atleta.anagrafica.dataNascita}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overview Stats (Broadcast Sports Style) */}
              {(() => {
                const storico = atleta.storicoClassifica || [];
                const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

                // Points calculation
                let pts = atleta.anagrafica.punti;
                if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                  pts = ultimoSnapshot.punti;
                }
                let initPts = atleta.riepilogo.puntiIniziali;
                if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                  initPts = Math.round(initPts * 1000);
                }

                // Position calculation
                const pos = ultimoSnapshot?.posizione ?? null;
                const stato = atleta.anagrafica.stato;
                const record = atleta.anagrafica.recordClassifica;
                const hasRecord = record && !record.includes('n. il') && record.trim().length > 0;
                const dataAgg = ultimoSnapshot?.data
                  ? (ultimoSnapshot.data.includes('-')
                    ? ultimoSnapshot.data.split('-').reverse().join('/')
                    : ultimoSnapshot.data)
                  : null;

                const posText = pos ? `#${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro');
                const posSub = hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Nazionale');

                return (
                  <div className="overview-stats-section">
                    <div className="overview-stats-card">
                      <div className="overview-stats-row">
                        {/* 1. Posizione */}
                        <div className="overview-stat-col" title={`Posizione attuale: ${posText} (${posSub})`}>
                          <span className="overview-stat-label">Posizione</span>
                          <span className="overview-stat-value">{posText}</span>
                          <span className="overview-stat-sub">{posSub}</span>
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 2. Punti Rank */}
                        <div className="overview-stat-col" title={`Punti attuali: ${pts} pt (Iniziali: ${initPts} pt)`}>
                          <span className="overview-stat-label">Punti Rank</span>
                          <span className="overview-stat-value">{pts.toLocaleString('it-IT')}</span>
                          <span className="overview-stat-sub">Iniziali: {initPts.toLocaleString('it-IT')}</span>
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 3. Partite V/G */}
                        <div className="overview-stat-col" title={`Partite vinte: ${atleta.riepilogo.partiteVinte}, giocate: ${atleta.riepilogo.partiteGiocate}, perse: ${atleta.riepilogo.partitePerse}`}>
                          <span className="overview-stat-label">Partite V/G</span>
                          <span className="overview-stat-value">
                            {atleta.riepilogo.partiteVinte} <span className="overview-stat-slash">/</span> {atleta.riepilogo.partiteGiocate}
                          </span>
                          <span className="overview-stat-sub">Perse: {atleta.riepilogo.partitePerse}</span>
                        </div>

                        <div className="overview-stat-divider" aria-hidden="true" />

                        {/* 4. % Vittorie */}
                        <div className="overview-stat-col" title={`% Vittorie: ${atleta.riepilogo.percentualePositiva}%, Guadagno netto: ${atleta.riepilogo.puntiTotali} pt`}>
                          <span className="overview-stat-label">% Vittorie</span>
                          <span className="overview-stat-value">{atleta.riepilogo.percentualePositiva}%</span>
                          <span className="overview-stat-sub">
                            {atleta.riepilogo.puntiTotali > 0 ? `+${atleta.riepilogo.puntiTotali} pt netti` : `${atleta.riepilogo.puntiTotali} pt`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Partite nel Campionato Attivo */}
              <div className="modal-campionato-partite-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-primary-600)', letterSpacing: '0.04em' }}>
                      <i className="bi bi-trophy-fill me-1 text-warning"></i>
                      Partite nel Campionato {campionatoNome ? `(${campionatoNome})` : ''}
                    </div>
                    {squadraCampionato && (
                      <span className="badge pct-high" style={{ fontSize: '11px' }}>
                        {squadraCampionato}
                      </span>
                    )}
                  </div>
                  {campionatoPartite && campionatoPartite.length > 0 && (
                    <span className="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle" style={{ fontSize: '11px' }}>
                      {campionatoPartite.length} {campionatoPartite.length === 1 ? 'partita disputata' : 'partite disputate'}
                    </span>
                  )}
                </div>

                {/* Federazione Update Disclaimer Required by User */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    color: '#ca8a04',
                    fontSize: '11.5px',
                    lineHeight: '1.4',
                    marginBottom: '12px',
                  }}
                >
                  <i className="bi bi-info-circle-fill" style={{ fontSize: '13px', marginTop: '1px', flexShrink: 0 }}></i>
                  <div>
                    <strong>Nota federale:</strong> Le partite disputate nel campionato in corso potrebbero non essere ancora state conteggiate dalla Federazione nel ranking e nei punti ufficiali del profilo.
                  </div>
                </div>

                {loadingPartite && (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Caricamento partite del campionato in corso...
                  </div>
                )}

                {!loadingPartite && !camId && (
                  <div style={{ padding: '12px', textAlign: 'center', background: 'var(--bg-th)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <i className="bi bi-pin-map me-1"></i>
                    Nessun campionato attualmente aperto. Seleziona un campionato per vedere le partite dell'atleta nel rispettivo girone.
                  </div>
                )}

                {!loadingPartite && camId && campionatoPartite && campionatoPartite.length === 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', background: 'var(--bg-th)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <i className="bi bi-shield-slash me-1"></i>
                    Nessuna partita disputata registrata per questo atleta nel campionato selezionato (l'atleta potrebbe non essere ancora sceso in campo o militare in un'altra serie).
                  </div>
                )}

                {!loadingPartite && campionatoPartite && campionatoPartite.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {campionatoPartite.map((match, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          background: 'var(--bg-card, #ffffff)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          gap: '10px',
                          flexWrap: 'wrap',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 180px' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '700',
                              background: match.isVittoria ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: match.isVittoria ? '#16a34a' : '#dc2626',
                              border: `1px solid ${match.isVittoria ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            }}
                          >
                            {match.isVittoria ? 'VINTA' : 'PERSA'}
                          </span>
                          <span className="badge pct-zero" style={{ fontSize: '10px' }}>
                            G{match.giornata}
                          </span>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-dark)' }}>
                            vs {match.avversario}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {match.sets.map((s, sIdx) => (
                              <span
                                key={sIdx}
                                style={{
                                  fontSize: '11px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'var(--bg-th)',
                                  color: 'var(--text-main)',
                                  border: '1px solid var(--border-color)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: '800',
                              color: match.isVittoria ? '#16a34a' : '#dc2626',
                              minWidth: '32px',
                              textAlign: 'right',
                            }}
                          >
                            {match.risultatoSet}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historical Charts */}
              <div style={{ marginBottom: '16px' }}>
                <RatingChart data={atleta.storicoClassifica} athleteName={atleta.anagrafica.nome} />
              </div>

              {/* Historical Ranking Table */}
              {atleta.storicoClassifica.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Storico Classifica Ufficiale
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                    <div className="modal-ranking-grid">
                      <div className="grid-header-row">
                        <div className="grid-th text-center">Data Rilevazione</div>
                        <div className="grid-th text-center">Categoria</div>
                        <div className="grid-th text-center">Punti Classifica</div>
                        <div className="grid-th text-center">Posizione</div>
                      </div>
                      {[...atleta.storicoClassifica].reverse().map((s, idx) => (
                        <div key={idx} className="grid-data-row">
                          <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.data}</div>
                          <div className="grid-cell text-center"><span className="badge pct-zero">{s.categoria}^</span></div>
                          <div className="grid-cell text-center" style={{ fontWeight: '700', color: 'var(--color-primary-600)' }}>{s.punti} pt</div>
                          <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.posizione ? `#${s.posizione}` : '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
