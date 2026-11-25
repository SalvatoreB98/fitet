import React from 'react';

interface AthleteNotFoundStateProps {
  atletaId?: string;
  onClose: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}

export const AthleteNotFoundState: React.FC<AthleteNotFoundStateProps> = ({
  atletaId,
  onClose,
  onRetry,
  retrying = false,
}) => {
  const cleanId = (atletaId || '').trim();
  const isNumericId = /^\d+$/.test(cleanId);

  return (
    <div className="athlete-not-found-box" role="status" aria-live="polite">
      <div className="athlete-not-found-emblem" aria-hidden="true">
        <img src="/icon.png" alt="" className="athlete-not-found-logo" />
        <span className="athlete-not-found-badge">
          <i className="bi bi-question-lg"></i>
        </span>
      </div>

      {cleanId && (
        <span className="athlete-not-found-id-pill">
          {isNumericId ? `ID #${cleanId}` : cleanId}
        </span>
      )}

      <h3 className="athlete-not-found-title">Atleta non trovato</h3>

      <p className="athlete-not-found-subtitle">
        Palla fuori dal tavolo! Non abbiamo trovato nessuna scheda attiva sul portale FITeT per questo codice.
      </p>

      <p className="athlete-not-found-hint">
        L&apos;ID potrebbe essere errato, appartenere a un atleta non più tesserato oppure non essere ancora presente in classifica.
      </p>

      <div className="athlete-not-found-actions">
        <button
          type="button"
          className="athlete-not-found-btn-primary"
          onClick={onClose}
        >
          <i className="bi bi-x-lg"></i>
          <span>Chiudi</span>
        </button>

        {onRetry && (
          <button
            type="button"
            className="athlete-not-found-btn-secondary"
            onClick={onRetry}
            disabled={retrying}
          >
            <i className={`bi bi-arrow-clockwise ${retrying ? 'spin-icon' : ''}`}></i>
            <span>{retrying ? 'Verifica...' : 'Riprova'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
