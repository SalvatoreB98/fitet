import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../utils/useNetworkStatus';
import { getVenueCacheSummary, clearAllVenueCache } from '../utils/venueCache';

interface VenueConnectionBannerProps {
  onRefresh?: () => void;
  currentChampionshipName?: string;
  onOpenPrecache?: () => void;
}

export const VenueConnectionBanner: React.FC<VenueConnectionBannerProps> = ({
  onRefresh,
  currentChampionshipName,
  onOpenPrecache,
}) => {
  const {
    isOnline,
    isWeakConnection,
    usingCachedData,
    cachedTime,
    cachedItemsCount,
    triggerRetry,
  } = useNetworkStatus();

  const [isDismissed, setIsDismissed] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [cacheSummary, setCacheSummary] = useState(getVenueCacheSummary());

  // Listen for connection restored event
  useEffect(() => {
    const handleRestored = () => {
      setShowRestoredNotice(true);
      setIsDismissed(false);
      const timer = setTimeout(() => {
        setShowRestoredNotice(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('fitet-connection-restored', handleRestored);
    return () => window.removeEventListener('fitet-connection-restored', handleRestored);
  }, []);

  // Update summary when cache updates
  useEffect(() => {
    const handleUpdate = () => {
      setCacheSummary(getVenueCacheSummary());
    };
    window.addEventListener('fitet-venue-cache-updated', handleUpdate);
    return () => window.removeEventListener('fitet-venue-cache-updated', handleUpdate);
  }, []);

  const handleManualRetry = () => {
    triggerRetry();
    onRefresh?.();
  };

  // Se la connessione è tornata online e mostriamo il messaggio di successo temporaneo
  if (showRestoredNotice && !isWeakConnection) {
    return (
      <div className="venue-connection-banner is-restored" role="status" aria-live="polite">
        <div className="venue-banner-content">
          <i className="bi bi-check-circle-fill venue-banner-icon icon-success"></i>
          <div>
            <strong>Connessione ripristinata</strong>
            <span className="venue-banner-sub">I dati FITeT sono di nuovo sincronizzati in tempo reale.</span>
          </div>
        </div>
      </div>
    );
  }

  // Non mostrare nulla se siamo regolarmente online e non usiamo dati cache
  if (!isWeakConnection && !usingCachedData) {
    return null;
  }

  // Se l'utente ha ridotto il banner, mostra un badge discreto galleggiante
  if (isDismissed) {
    return (
      <button
        type="button"
        className="venue-compact-pill"
        onClick={() => setIsDismissed(false)}
        title="Connessione debole in palestra - Clicca per dettagli"
      >
        <span className="pulse-indicator"></span>
        <i className="bi bi-reception-1 me-1"></i>
        <span>Offline Palestra</span>
      </button>
    );
  }

  return (
    <>
      <div
        className={`venue-connection-banner ${!isOnline ? 'is-offline' : 'is-weak'}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="venue-banner-main">
          <div className="venue-banner-icon-wrap">
            <i className={`bi ${!isOnline ? 'bi-wifi-off' : 'bi-reception-1'} venue-banner-icon`}></i>
          </div>

          <div className="venue-banner-text">
            <div className="venue-banner-title-row">
              <span className="venue-banner-title">
                {!isOnline ? 'Modalità Palestra (Offline)' : 'Connessione debole in palestra'}
              </span>
              {cachedTime && (
                <span className="venue-banner-time-badge">
                  <i className="bi bi-clock-history me-1"></i>
                  Salvato: {cachedTime}
                </span>
              )}
            </div>

            <p className="venue-banner-desc">
              {!isOnline
                ? 'Segnale cellulare assente. Stai visualizzando i dati memorizzati in locale per questa gara.'
                : 'Segnale cellulare debole o instabile. L\'app sta utilizzando i dati salvati per evitare blocchi.'}
            </p>
          </div>
        </div>

        <div className="venue-banner-actions">
          <button
            type="button"
            className="venue-btn-retry"
            onClick={handleManualRetry}
            title="Riprova a scaricare i dati più recenti dal portale FITeT"
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Riprova
          </button>

          <button
            type="button"
            className="venue-btn-info"
            onClick={() => setShowDetailsModal(true)}
            title="Visualizza i dati archiviati per la consultazione offline"
          >
            <i className="bi bi-hdd-fill me-1"></i>
            Memoria ({cacheSummary.totalItems})
          </button>

          <button
            type="button"
            className="venue-btn-close"
            onClick={() => setIsDismissed(true)}
            title="Riduci banner"
            aria-label="Riduci banner"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      {/* Modal Dettagli Memoria Palestra */}
      {showDetailsModal && (
        <div className="modal-backdrop-simple" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-card-simple venue-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-simple">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="bi bi-hdd-network-fill" style={{ fontSize: '18px', color: '#38bdf8' }}></i>
                <h3 style={{ margin: 0 }}>Dati Salvati per la Palestra</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDetailsModal(false)}
                title="Chiudi"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="modal-body-simple" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Questa memoria locale assicura che tu possa consultare classifiche, referti e profili atleta
                anche nei palazzetti e negli scantinati dove il segnale 4G/5G è debole o non prende.
              </p>

              <div className="venue-stats-grid">
                <div className="venue-stat-box">
                  <div className="venue-stat-num">{cacheSummary.championshipsCount}</div>
                  <div className="venue-stat-label">Campionati Salvati</div>
                </div>
                <div className="venue-stat-box">
                  <div className="venue-stat-num">{cacheSummary.athletesCount}</div>
                  <div className="venue-stat-label">Schede Atleti</div>
                </div>
                <div className="venue-stat-box">
                  <div className="venue-stat-num">{cacheSummary.matchesCount}</div>
                  <div className="venue-stat-label">Referti Gare</div>
                </div>
              </div>

              {cacheSummary.lastUpdated && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px', textAlign: 'center' }}>
                  Ultima sincronizzazione salvata: <strong>{cacheSummary.lastUpdated}</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-action"
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  onClick={() => {
                    if (window.confirm('Vuoi davvero cancellare i dati salvati in memoria per la palestra?')) {
                      clearAllVenueCache();
                      setCacheSummary(getVenueCacheSummary());
                    }
                  }}
                >
                  <i className="bi bi-trash me-1"></i>
                  Svuota Memoria
                </button>

                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setShowDetailsModal(false)}
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
