import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './InstallAppModal.css';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const detectPlatform = (): 'android' | 'ios' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>(detectPlatform);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Aggiorna la piattaforma rilevata ogni volta che la modale si apre
  useEffect(() => {
    if (isOpen) {
      setPlatform(detectPlatform());
    }
  }, [isOpen]);

  // Ascolta l'evento nativo prima dell'installazione per browser Chromium
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Gestione tasto Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleDirectInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      setDeferredPrompt(null);
      onClose();
    }
  };

  return createPortal(
    <div
      className="install-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-title"
    >
      <div className="install-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="install-modal-header">
          <div>
            <h3 id="install-app-title" className="install-modal-title">
              Scarica App
            </h3>
            <p className="install-modal-subtitle">
              Installa il portale sul tuo dispositivo per aprirlo a schermo intero come una vera app.
            </p>
          </div>
          <button
            type="button"
            className="install-modal-close"
            onClick={onClose}
            title="Chiudi"
            aria-label="Chiudi"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Minimal OS Selector */}
        <div className="install-os-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'android'}
            className={`install-os-btn ${platform === 'android' ? 'is-active' : ''}`}
            onClick={() => setPlatform('android')}
            title="Android"
          >
            <i className="bi bi-android2"></i>
            <span>Android</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'ios'}
            className={`install-os-btn ${platform === 'ios' ? 'is-active' : ''}`}
            onClick={() => setPlatform('ios')}
            title="iPhone e iPad"
          >
            <i className="bi bi-apple"></i>
            <span>iOS</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform === 'desktop'}
            className={`install-os-btn ${platform === 'desktop' ? 'is-active' : ''}`}
            onClick={() => setPlatform('desktop')}
            title="Computer desktop"
          >
            <i className="bi bi-display"></i>
            <span>Desktop</span>
          </button>
        </div>

        {/* Installazione diretta (se disponibile su Chromium/Android/desktop) */}
        {(platform === 'android' || platform === 'desktop') && deferredPrompt && (
          <button type="button" className="install-direct-btn" onClick={handleDirectInstall}>
            <i className="bi bi-download"></i>
            <span>
              {platform === 'desktop'
                ? 'Installa subito con un clic'
                : 'Installa subito con un tocco'}
            </span>
          </button>
        )}

        {/* Guide Steps (Minimal Flat List) */}
        <div className="install-steps">
          {platform === 'android' ? (
            <>
              <div className="install-step-item">
                <div className="install-step-num">1</div>
                <div className="install-step-text">
                  Apri il menu di Chrome o del browser toccando i <strong>tre puntini</strong> (<strong>⋮</strong>) in alto a destra.
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">2</div>
                <div className="install-step-text">
                  Seleziona <strong>&quot;Aggiungi a schermata Home&quot;</strong> oppure <strong>&quot;Installa app&quot;</strong>.
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">3</div>
                <div className="install-step-text">
                  Conferma premendo <strong>&quot;Installa&quot;</strong>. L&apos;icona apparirà tra le tue app.
                </div>
              </div>
            </>
          ) : platform === 'ios' ? (
            <>
              <div className="install-step-item">
                <div className="install-step-num">1</div>
                <div className="install-step-text">
                  In Safari, tocca il pulsante {' '}
                  <img
                    className='icon-setting-safari'
                    src="/iOS-icon.png"
                    alt="new setting icon"
                    width="20px"
                    style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  />{' '} oppure  {' '}<i className="bi bi-three-dots"></i>{' '}
                  poi: <span className="install-inline-icon">
                    <i className="bi bi-box-arrow-up"></i>
                  </span>{' '}
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">2</div>
                <div className="install-step-text">
                  Scorri le opzioni e tocca{' '}
                  <strong>&quot;Aggiungi alla schermata Home&quot;</strong>{' '}
                  <span className="install-inline-icon">
                    <i className="bi bi-plus-square"></i>
                  </span>.
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">3</div>
                <div className="install-step-text">
                  Tocca <strong>&quot;Aggiungi&quot;</strong> in alto a destra. L&apos;icona apparirà sulla schermata Home.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="install-step-item">
                <div className="install-step-num">1</div>
                <div className="install-step-text">
                  Apri <strong>Chrome</strong> o <strong>Edge</strong> e clicca
                  l&apos;icona di installazione nella barra degli indirizzi (il
                  monitor con la freccia), oppure apri il menu{' '}
                  <strong>⋮</strong>.
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">2</div>
                <div className="install-step-text">
                  Seleziona <strong>&quot;Installa app&quot;</strong> oppure{' '}
                  <strong>&quot;App&quot;</strong> →{' '}
                  <strong>&quot;Installa questa app&quot;</strong>.
                </div>
              </div>
              <div className="install-step-item">
                <div className="install-step-num">3</div>
                <div className="install-step-text">
                  Conferma: l&apos;app si aprirà in una finestra dedicata e sarà
                  disponibile nel menu Start (Windows) o nel Launchpad (macOS).
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Note */}
        <p className="install-footer-note">
          <i className="bi bi-lightning-charge-fill text-warning"></i>
          <span>
            {platform === 'desktop'
              ? 'Su Safari (macOS) usa File → Aggiungi al Dock. Accesso istantaneo senza barre del browser.'
              : 'Accesso istantaneo senza barre del browser e caricamento fulmineo.'}
          </span>
        </p>
      </div>
    </div>,
    document.body
  );
};
