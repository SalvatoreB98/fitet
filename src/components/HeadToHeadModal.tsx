import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HeadToHeadData } from '../types/fitet';
import { fetchHeadToHead } from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { HeadToHeadComparisonPanel } from './HeadToHeadComparisonPanel';
import { HeadToHeadPickerModal, HeadToHeadPlayer } from './HeadToHeadPickerModal';

interface HeadToHeadModalProps {
  isOpen: boolean;
  atleta1Id: string;
  atleta1Nome: string;
  atleta2Id?: string;
  atleta2Nome: string;
  onClose: () => void;
  onSelectAthlete?: (id: string, name: string) => void;
  onNewSearch?: () => void;
}

export const HeadToHeadModal: React.FC<HeadToHeadModalProps> = ({
  isOpen,
  atleta1Id,
  atleta1Nome,
  atleta2Id,
  atleta2Nome,
  onClose,
  onSelectAthlete,
  onNewSearch,
}) => {
  useBodyScrollLock(isOpen);

  const [activePlayer1, setActivePlayer1] = useState<HeadToHeadPlayer>({
    id: atleta1Id,
    name: atleta1Nome,
  });
  const [activePlayer2, setActivePlayer2] = useState<HeadToHeadPlayer>({
    id: atleta2Id || '',
    name: atleta2Nome,
  });

  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerInitialP1, setPickerInitialP1] = useState<HeadToHeadPlayer | null>(null);
  const [pickerInitialP2, setPickerInitialP2] = useState<HeadToHeadPlayer | null>(null);

  const [data, setData] = useState<HeadToHeadData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [img1Error, setImg1Error] = useState<boolean>(false);
  const [img2Error, setImg2Error] = useState<boolean>(false);

  // Sync state if props change from outside
  useEffect(() => {
    setActivePlayer1({ id: atleta1Id, name: atleta1Nome });
    setActivePlayer2({ id: atleta2Id || '', name: atleta2Nome });
  }, [atleta1Id, atleta1Nome, atleta2Id, atleta2Nome]);

  useEffect(() => {
    if (!isOpen || !activePlayer1.id || (!activePlayer2.id && !activePlayer2.name)) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setImg1Error(false);
    setImg2Error(false);

    const oppParam = activePlayer2.id || activePlayer2.name;

    fetchHeadToHead(activePlayer1.id, oppParam)
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
  }, [isOpen, activePlayer1.id, activePlayer2.id, activePlayer2.name]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen || isPickerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isPickerOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const player1 = data?.atleta1 || {
    id: activePlayer1.id,
    nome: activePlayer1.name,
    vittorie: 0,
    fotoUrl: activePlayer1.id ? `https://portale.fitet.org/images/atleti/${activePlayer1.id}.jpg` : undefined,
  };

  const player2 = data?.atleta2 || {
    id: activePlayer2.id || '',
    nome: activePlayer2.name,
    vittorie: 0,
    fotoUrl: activePlayer2.id ? `https://portale.fitet.org/images/atleti/${activePlayer2.id}.jpg` : undefined,
  };

  const totalMatches = data?.totaleIncontri ?? (player1.vittorie + player2.vittorie);
  const p1Rate = totalMatches > 0 ? Math.round((player1.vittorie / totalMatches) * 100) : 50;
  const p2Rate = 100 - p1Rate;
  const player1Id = player1.id || activePlayer1.id;
  const player2Id = player2.id || activePlayer2.id;

  const handleChangePlayer1 = () => {
    setPickerInitialP1(null);
    setPickerInitialP2({
      id: player2Id,
      name: player2.nome,
    });
    setIsPickerOpen(true);
  };

  const handleChangePlayer2 = () => {
    setPickerInitialP1({
      id: player1Id,
      name: player1.nome,
    });
    setPickerInitialP2(null);
    setIsPickerOpen(true);
  };

  const handleAnotherComparison = () => {
    setPickerInitialP1({
      id: player1Id,
      name: player1.nome,
    });
    setPickerInitialP2({
      id: player2Id,
      name: player2.nome,
    });
    setIsPickerOpen(true);
  };

  const handlePickerCompare = (p1: HeadToHeadPlayer, p2: HeadToHeadPlayer) => {
    setActivePlayer1(p1);
    setActivePlayer2(p2);
    setIsPickerOpen(false);
  };

  return createPortal(
    <div className="modal-backdrop-simple modal-h2h-backdrop" onClick={onClose} style={{ zIndex: 1600 }}>
      <div
        className="modal-card-simple h2h-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h2h-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span className="h2h-header-icon" aria-hidden="true">
              <i className="bi bi-arrow-left-right"></i>
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)' }}>
                Testa a Testa Storico
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                Precedenti ufficiali FITeT (Campionati e Tornei)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleAnotherComparison}
              aria-label="Fai un altro confronto"
              title="Fai un altro confronto"
              className="h2h-header-action-btn"
            >
              <i className="bi bi-arrow-left-right" aria-hidden="true"></i>
              <span className="h2h-header-btn-text">Altro confronto</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="modal-close-btn"
            >
              <i className="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
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
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Player 1 Column */}
                  <div className="h2h-player-column">
                    <button
                      type="button"
                      className="h2h-player-change-trigger"
                      onClick={handleChangePlayer1}
                      title={`Clicca per cambiare ${player1.nome}`}
                      aria-label={`Clicca per cambiare ${player1.nome}`}
                    >
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
                        <div className="h2h-avatar-change-overlay" aria-hidden="true">
                          <i className="bi bi-arrow-repeat"></i>
                        </div>
                      </div>
                      <div className="h2h-player-name-text" title={player1.nome}>
                        {player1.nome}
                      </div>
                      <div className="subtitle">
                        {player1.vittorie} {player1.vittorie === 1 ? 'vittoria' : 'vittorie'}
                      </div>
                      <span className="h2h-change-pill-btn">
                        <i className="bi bi-arrow-repeat" aria-hidden="true"></i>
                        <span>Cambia</span>
                      </span>
                    </button>
                  </div>

                  {/* Central Score */}
                  <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 8px', marginTop: '10px' }}>
                    <div className="h2h-central-score">
                      <span>
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

                  {/* Player 2 Column */}
                  <div className="h2h-player-column">
                    <button
                      type="button"
                      className="h2h-player-change-trigger"
                      onClick={handleChangePlayer2}
                      title={`Clicca per cambiare ${player2.nome}`}
                      aria-label={`Clicca per cambiare ${player2.nome}`}
                    >
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
                        <div className="h2h-avatar-change-overlay" aria-hidden="true">
                          <i className="bi bi-arrow-repeat"></i>
                        </div>
                      </div>
                      <div className="h2h-player-name-text" title={player2.nome}>
                        {player2.nome}
                      </div>
                      <div className="subtitle">
                        {player2.vittorie} {player2.vittorie === 1 ? 'vittoria' : 'vittorie'}
                      </div>
                      <span className="h2h-change-pill-btn">
                        <i className="bi bi-arrow-repeat" aria-hidden="true"></i>
                        <span>Cambia</span>
                      </span>
                    </button>
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

              {player1Id && player2Id && (
                <HeadToHeadComparisonPanel
                  atleta1Id={player1Id}
                  atleta1Nome={player1.nome}
                  atleta2Id={player2Id}
                  atleta2Nome={player2.nome}
                  h2h={data}
                />
              )}

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

        {/* Modal Picker for switching players */}
        {isPickerOpen && (
          <HeadToHeadPickerModal
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            onCompare={handlePickerCompare}
            initialPlayer1={pickerInitialP1}
            initialPlayer2={pickerInitialP2}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
