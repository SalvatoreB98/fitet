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
        className="modal-card-simple"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-th, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--color-primary-600, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
              }}
            >
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
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--text-muted)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
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
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#dc2626',
                fontSize: '12.5px',
                textAlign: 'center',
              }}
            >
              <i className="bi bi-exclamation-triangle me-1"></i>
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Versus Showcase Banner */}
              <div
                style={{
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px 14px',
                  marginBottom: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Player 1 Card */}
                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        margin: '0 auto 6px',
                        border: '2px solid var(--color-primary-600, #2563eb)',
                        background: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
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
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '13px',
                        color: 'var(--text-dark)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={player1.nome}
                    >
                      {player1.nome}
                    </div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                      {player1.vittorie} {player1.vittorie === 1 ? 'vittoria' : 'vittorie'}
                    </div>
                  </div>

                  {/* Central Score */}
                  <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 8px' }}>
                    <div
                      style={{
                        fontSize: '28px',
                        fontWeight: 900,
                        color: 'var(--text-dark)',
                        letterSpacing: '1px',
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span style={{ color: player1.vittorie >= player2.vittorie ? '#16a34a' : 'var(--text-dark)' }}>
                        {player1.vittorie}
                      </span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: '20px' }}>-</span>
                      <span style={{ color: player2.vittorie >= player1.vittorie ? '#16a34a' : 'var(--text-dark)' }}>
                        {player2.vittorie}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '10.5px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginTop: '4px',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {totalMatches} {totalMatches === 1 ? 'partita' : 'partite'}
                    </div>
                  </div>

                  {/* Player 2 Card */}
                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        margin: '0 auto 6px',
                        border: '2px solid var(--border-color)',
                        background: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
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
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '13px',
                        color: 'var(--text-dark)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={player2.nome}
                    >
                      {onSelectAthlete && player2.id ? (
                        <button
                          type="button"
                          onClick={() => onSelectAthlete(player2.id, player2.nome)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary-600, #2563eb)',
                            fontWeight: 700,
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 'inherit',
                          }}
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
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '999px',
                        background: '#e2e8f0',
                        display: 'flex',
                        overflow: 'hidden',
                      }}
                    >
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
                  <div
                    style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: 'var(--bg-th, #f8fafc)',
                      borderRadius: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '12.5px',
                    }}
                  >
                    <i className="bi bi-shield-slash me-1"></i>
                    Nessun precedente registrato tra questi due atleti nel database FITeT.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.incontri.map((enc, idx) => {
                      const isVittoria = enc.isVittoriaAtleta1;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'var(--bg-card, #ffffff)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            gap: '10px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: isVittoria ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isVittoria ? '#16a34a' : '#dc2626',
                                  border: `1px solid ${isVittoria ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                }}
                              >
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

                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--text-dark)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={enc.gara}
                            >
                              {enc.gara}
                            </div>
                          </div>

                          {/* Set Score */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: '16px',
                                fontWeight: 900,
                                color: isVittoria ? '#16a34a' : '#dc2626',
                                fontVariantNumeric: 'tabular-nums',
                                letterSpacing: '0.5px',
                              }}
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
