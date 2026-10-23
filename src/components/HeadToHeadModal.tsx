import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HeadToHeadData } from '../types/fitet';
import { fetchHeadToHead } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface HeadToHeadModalProps {
  isOpen: boolean;
  atleta1Id: string;
  atleta1Nome: string;
  atleta2Id?: string;
  atleta2Nome: string;
  onClose: () => void;
  onSelectAthlete?: (id: string, name: string) => void;
}

export const HeadToHeadModal: React.FC<HeadToHeadModalProps> = ({
  isOpen,
  atleta1Id,
  atleta1Nome,
  atleta2Id,
  atleta2Nome,
  onClose,
  onSelectAthlete,
}) => {
  useBodyScrollLock(isOpen);

  const [data, setData] = useState<HeadToHeadData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [img1Error, setImg1Error] = useState<boolean>(false);
  const [img2Error, setImg2Error] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !atleta1Id || (!atleta2Id && !atleta2Nome)) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setImg1Error(false);
    setImg2Error(false);

    const oppParam = atleta2Id || atleta2Nome;

    fetchHeadToHead(atleta1Id, oppParam)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Impossibile recuperare il testa a testa');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, atleta1Id, atleta2Id, atleta2Nome]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const player1 = data?.atleta1 || {
    id: atleta1Id,
    nome: atleta1Nome,
    vittorie: 0,
    fotoUrl: `https://portale.fitet.org/images/atleti/${atleta1Id}.jpg`,
  };

  const player2 = data?.atleta2 || {
    id: atleta2Id || '',
    nome: atleta2Nome,
    vittorie: 0,
    fotoUrl: atleta2Id ? `https://portale.fitet.org/images/atleti/${atleta2Id}.jpg` : undefined,
  };

  const totalMatches = data?.totaleIncontri ?? (player1.vittorie + player2.vittorie);
  const p1Rate = totalMatches > 0 ? Math.round((player1.vittorie / totalMatches) * 100) : 50;
  const p2Rate = 100 - p1Rate;

  return createPortal(
    <div className="modal-backdrop-simple modal-h2h-backdrop" onClick={onClose} style={{ zIndex: 1600 }}>
      <div
        className="modal-card-simple h2h-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h2h-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="h2h-header-icon">
              <i className="bi bi-arrow-left-right"></i>
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)' }}>
                Testa a Testa Storico
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                Precedenti ufficiali FITeT (Campionati e Tornei)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="h2h-close-button"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
              <span className="spinner-border spinner-border-sm text-primary me-2" role="status"></span>
              Caricamento confronti diretti da FITeT...
            </div>
          )}

          {error && !loading && (
            <div className="h2h-error-banner">
              <i className="bi bi-exclamation-triangle me-1"></i>
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Versus Showcase Banner */}
              <div className="h2h-versus-banner">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Player 1 Card */}
                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
                    <div className="h2h-player-avatar-circle is-p1">
                      {player1.fotoUrl && !img1Error ? (
                        <img
                          src={player1.fotoUrl}
                          alt={player1.nome}
                          referrerPolicy="no-referrer"
                          onError={() => setImg1Error(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <i className="bi bi-person-fill" style={{ fontSize: '28px', color: '#94a3b8' }}></i>
                      )}
                    </div>
                    <div className="h2h-player-name-text" title={player1.nome}>
                      {player1.nome}
                    </div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                      {player1.vittorie} {player1.vittorie === 1 ? 'vittoria' : 'vittorie'}
                    </div>
                  </div>

                  {/* Central Score */}
                  <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 8px' }}>
                    <div className="h2h-central-score">
                      <span style={{ color: player1.vittorie >= player2.vittorie ? '#ffffffff' : 'var(--text-dark)' }}>
                        {player1.vittorie}
                      </span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: '20px' }}>-</span>
                      <span style={{ color: player2.vittorie >= player1.vittorie ? '#16a34a' : 'var(--text-dark)' }}>
                        {player2.vittorie}
                      </span>
                    </div>
                    <div className="h2h-matches-label">
                      {totalMatches} {totalMatches === 1 ? 'partita' : 'partite'}
                    </div>
                  </div>

                  {/* Player 2 Card */}
                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
                    <div className="h2h-player-avatar-circle">
                      {player2.fotoUrl && !img2Error ? (
                        <img
                          src={player2.fotoUrl}
                          alt={player2.nome}
                          referrerPolicy="no-referrer"
                          onError={() => setImg2Error(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <i className="bi bi-person-fill" style={{ fontSize: '28px', color: '#94a3b8' }}></i>
                      )}
                    </div>
                    <div className="h2h-player-name-text" title={player2.nome}>
                      {onSelectAthlete && player2.id ? (
                        <button
                          type="button"
                          onClick={() => onSelectAthlete(player2.id, player2.nome)}
                          className="h2h-player-link-inline"
                        >
                          {player2.nome}
                        </button>
                      ) : (
                        player2.nome
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                      {player2.vittorie} {player2.vittorie === 1 ? 'vittoria' : 'vittorie'}
                    </div>
                  </div>
                </div>

                {/* Win Distribution Progress Bar */}
                {totalMatches > 0 && (
                  <div style={{ marginTop: '14px' }}>
                    <div className="h2h-progress-track">
                      <div
                        style={{
                          width: `${p1Rate}%`,
                          background: '#16a34a',
                          transition: 'width 0.4s ease',
                        }}
                        title={`${player1.nome}: ${p1Rate}%`}
                      ></div>
                      <div
                        style={{
                          width: `${p2Rate}%`,
                          background: '#ef4444',
                          transition: 'width 0.4s ease',
                        }}
                        title={`${player2.nome}: ${p2Rate}%`}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Encounters Timeline List */}
              <div style={{ marginBottom: '8px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-dark)' }}>
                  <i className="bi bi-clock-history me-1 text-primary"></i>
                  Cronologia Incontri ({data?.incontri.length || 0})
                </h4>

                {(!data?.incontri || data.incontri.length === 0) ? (
                  <div className="h2h-empty-box">
                    <i className="bi bi-shield-slash me-1"></i>
                    Nessun precedente registrato tra questi due atleti nel database FITeT.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.incontri.map((enc, idx) => {
                      const isVittoria = enc.isVittoriaAtleta1;
                      return (
                        <div key={idx} className="h2h-match-item">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span className={`h2h-badge-result ${isVittoria ? 'is-vinta' : 'is-persa'}`}>
                                {isVittoria ? 'VINTA' : 'PERSA'}
                              </span>

                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {enc.data}
                              </span>

                              {enc.anno && (
                                <span className="badge badge-neutral" style={{ fontSize: '9.5px' }}>
                                  {enc.anno}
                                </span>
                              )}
                            </div>

                            <div className="h2h-match-title" title={enc.gara}>
                              {enc.gara}
                            </div>
                          </div>

                          {/* Set Score */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              className="h2h-match-score"
                              style={{ color: isVittoria ? '#16a34a' : '#dc2626' }}
                            >
                              {enc.punteggio}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
