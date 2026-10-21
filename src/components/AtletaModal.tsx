import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta } from '../types/fitet';
import { fetchAtleta } from '../services/api';
import { RatingChart } from './RatingChart';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface AtletaModalProps {
  atletaId: string;
  athleteName?: string;
  returnLabel?: string;
  onClose: () => void;
}

export const AtletaModal: React.FC<AtletaModalProps> = ({ atletaId, athleteName, returnLabel, onClose }) => {
  useBodyScrollLock(true);

  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchAtleta(atletaId)
      .then((data) => {
        if (isMounted) {
          setAtleta(data);
          setLoading(false);
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
  }, [atletaId]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {returnLabel && (
              <button
                type="button"
                className="btn-modal-back"
                onClick={onClose}
                title="Torna alla schermata precedente"
              >
                ← {returnLabel}
              </button>
            )}
            <div>
              <h3>Scheda Ranking FITeT — {atleta?.anagrafica?.nome || athleteName || 'Atleta'}</h3>
              <div style={{ fontSize: '11px', color: '#bfdbfe', marginTop: '2px' }}>
                Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : 'In risoluzione...')} • Classifica Unica Nazionale
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-header"
            onClick={onClose}
            style={{ padding: '4px 9px', fontSize: '13px' }}
            title="Chiudi"
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

                <div style={{ flex: '1 1 200px' }}>
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

              {/* Stat Boxes */}
              <div className="modal-stat-boxes">
                <div className="modal-stat-box stat-box-blue">
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-primary-500)' }}>
                    {(() => {
                      const storico = atleta.storicoClassifica || [];
                      const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
                      let pts = atleta.anagrafica.punti;
                      if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                        pts = ultimoSnapshot.punti;
                      }
                      return pts;
                    })()} pt
                  </div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: 'var(--color-primary-600)' }}>
                    Punti Classifica Attuali
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Iniziali: {(() => {
                      const storico = atleta.storicoClassifica || [];
                      const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
                      let initPts = atleta.riepilogo.puntiIniziali;
                      if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                        initPts = Math.round(initPts * 1000);
                      }
                      return initPts;
                    })()} {atleta.riepilogo.puntiInizialiData ? `(${atleta.riepilogo.puntiInizialiData})` : ''}
                  </div>
                </div>

                {(() => {
                  const storico = atleta.storicoClassifica || [];
                  // L'array storicoClassifica è ordinato dal più vecchio al più recente: l'ultimo elemento è la rilevazione attuale
                  const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
                  const pos = ultimoSnapshot?.posizione ?? null;
                  const stato = atleta.anagrafica.stato;
                  const record = atleta.anagrafica.recordClassifica;
                  const hasRecord = record && !record.includes('n. il') && record.trim().length > 0;
                  const dataAgg = ultimoSnapshot?.data
                    ? (ultimoSnapshot.data.includes('-')
                      ? ultimoSnapshot.data.split('-').reverse().join('/')
                      : ultimoSnapshot.data)
                    : null;

                  return (
                    <div className="modal-stat-box stat-box-blue">
                      <div
                        style={{
                          fontSize: pos ? '20px' : '16px',
                          fontWeight: '800',
                          color: 'var(--color-primary-500)',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                      >
                        {pos ? `N. ${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro')}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: '700',
                          color: 'var(--color-primary-600)',
                        }}
                      >
                        Posizione Attuale
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                        title={hasRecord ? `Record storico: ${record}` : (dataAgg ? `Rilevazione: ${dataAgg}` : '')}
                      >
                        {hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Graduatoria Nazionale')}
                      </div>
                    </div>
                  );
                })()}

                <div className="modal-stat-box stat-box-green">
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a' }}>
                    {atleta.riepilogo.partiteVinte}
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}> / {atleta.riepilogo.partiteGiocate}</span>
                  </div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#16a34a' }}>
                    Partite Vinte / Giocate
                  </div>
                  <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>
                    Perse: {atleta.riepilogo.partitePerse}
                  </div>
                </div>

                <div className="modal-stat-box stat-box-amber">
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#d97706' }}>
                    {atleta.riepilogo.percentualePositiva}%
                  </div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', color: '#d97706' }}>
                    % Vittorie Stagionale
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Guadagno netto: {atleta.riepilogo.puntiTotali > 0 ? `+${atleta.riepilogo.puntiTotali}` : atleta.riepilogo.puntiTotali} pt
                  </div>
                </div>
              </div>

              {/* Points Over Time Chart */}
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
