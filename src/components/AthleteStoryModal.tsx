import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DettaglioAtleta } from '../types/fitet';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface AthleteStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  atleta: DettaglioAtleta;
}

export type StoryTheme = 'panoramica' | 'torneo' | 'best_rank' | 'punti';

interface ThemeOption {
  id: StoryTheme;
  label: string;
  icon: string;
  description: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'panoramica',
    label: 'Panoramica',
    icon: 'bi-grid-fill',
    description: 'Ranking, vittorie e andamento complessivo',
  },
  {
    id: 'torneo',
    label: 'Ultimo Torneo',
    icon: 'bi-trophy-fill',
    description: 'Risultato e punti dell’ultimo torneo disputato',
  },
  {
    id: 'best_rank',
    label: 'Best Ranking',
    icon: 'bi-star-fill',
    description: 'Celebrazione del miglior piazzamento in carriera',
  },
  {
    id: 'punti',
    label: 'Variazione Punti',
    icon: 'bi-graph-up-arrow',
    description: 'Guadagno netto di punti ranking nella stagione',
  },
];

export const AthleteStoryModal: React.FC<AthleteStoryModalProps> = ({
  isOpen,
  onClose,
  atleta,
}) => {
  useBodyScrollLock(isOpen);

  const [selectedTheme, setSelectedTheme] = useState<StoryTheme>('panoramica');
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [sharing, setSharing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');

  const athleteName = atleta.anagrafica?.nome || `Atleta #${atleta.id}`;
  const hasTournament = Boolean(atleta.partiteRanking?.tornei && atleta.partiteRanking.tornei.length > 0);

  // Carica l'immagine 1080x1920 generata dall'endpoint
  useEffect(() => {
    if (!isOpen || !atleta.id) return;

    let isMounted = true;
    setLoading(true);
    setCopied(false);

    const apiUrl = `/api/story/player/${encodeURIComponent(atleta.id)}.png?theme=${selectedTheme}&t=${Date.now()}`;

    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Errore durante la generazione della card');
        return res.blob();
      })
      .then((blob) => {
        if (isMounted) {
          setImageBlob(blob);
          const objUrl = URL.createObjectURL(blob);
          setImageUrl(objUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Errore fetch story card:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [isOpen, atleta.id, selectedTheme]);

  // Gestione tasto ESC
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

  // Scarica il file PNG sul dispositivo
  const handleDownload = () => {
    if (!imageBlob) return;
    setDownloading(true);
    try {
      const url = URL.createObjectURL(imageBlob);
      const a = document.createElement('a');
      const filename = `storia-${athleteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${selectedTheme}.png`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setDownloading(false);
    }
  };

  // Condividi nativamente su mobile (Instagram Stories / WhatsApp)
  const handleShare = async () => {
    if (!imageBlob) return;
    setSharing(true);
    try {
      const filename = `storia-${athleteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const file = new File([imageBlob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Scheda ${athleteName}`,
          text: `Guarda la scheda e le statistiche di ${athleteName} sul Portale Risultati FITeT!`,
        });
      } else {
        // Fallback su download
        handleDownload();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        handleDownload();
      }
    } finally {
      setSharing(false);
    }
  };

  // Copia negli appunti (per incollarla direttamente nelle storie su iOS/Mac/PC)
  const handleCopy = async () => {
    if (!imageBlob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': imageBlob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  const canNativeShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator;

  return createPortal(
    <div
      className="modal-backdrop-simple athlete-story-backdrop"
      onClick={onClose}
      style={{ zIndex: 1750 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-modal-title"
    >
      <div
        className="modal-card-simple athlete-story-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="athlete-story-header">
          <div className="athlete-story-header-left">
            <span className="athlete-story-icon-badge" aria-hidden="true">
              <i className="bi bi-instagram"></i>
            </span>
            <div>
              <h3 id="story-modal-title" className="athlete-story-title">
                Card per Instagram Stories
              </h3>
              <p className="athlete-story-subtitle">
                Formato 9:16 (1080×1920) pronto per Storie, WhatsApp Status e Reel
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Chiudi finestra (ESC)"
            aria-label="Chiudi finestra"
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        {/* Modal Body: Theme Selector + Preview */}
        <div className="athlete-story-body">
          {/* Theme Selector Pills */}
          <div className="athlete-story-themes-section">
            <span className="athlete-story-section-label">Seleziona il focus della Storia:</span>
            <div className="athlete-story-theme-pills">
              {THEME_OPTIONS.map((t) => {
                const isSelected = selectedTheme === t.id;
                const isDisabled = t.id === 'torneo' && !hasTournament;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`athlete-story-theme-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => setSelectedTheme(t.id)}
                    disabled={isDisabled}
                    title={isDisabled ? 'Nessun torneo recente registrato' : t.description}
                  >
                    <i className={`bi ${t.icon} me-1`}></i>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phone Frame Preview */}
          <div className="athlete-story-preview-container">
            <div className="athlete-story-phone-mockup">
              <div className="athlete-story-phone-screen">
                {loading && (
                  <div className="athlete-story-loading">
                    <span className="spinner-border spinner-border-sm text-primary mb-2" role="status"></span>
                    <span>Generazione grafica 1080×1920...</span>
                  </div>
                )}

                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={`Card Instagram Stories di ${athleteName}`}
                    className={`athlete-story-img ${loading ? 'is-loading' : ''}`}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="athlete-story-footer">
          <div className="athlete-story-footer-info">
            <i className="bi bi-info-circle me-1"></i>
            <span>Grafica HD generata in 9:16 con i dati FITeT ufficiali</span>
          </div>

          <div className="athlete-story-actions-group">
            <button
              type="button"
              className="athlete-story-action-btn btn-copy"
              onClick={handleCopy}
              disabled={loading}
              title="Copia l'immagine negli appunti per incollarla nella storia"
            >
              <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-clipboard'} me-1`}></i>
              <span>{copied ? 'Copiata!' : 'Copia'}</span>
            </button>

            <button
              type="button"
              className="athlete-story-action-btn btn-download"
              onClick={handleDownload}
              disabled={loading || downloading}
              title="Salva l'immagine 1080x1920 sul tuo dispositivo"
            >
              <i className="bi bi-download me-1"></i>
              <span>Scarica PNG</span>
            </button>

            {canNativeShareFiles && (
              <button
                type="button"
                className="athlete-story-action-btn btn-share-main"
                onClick={handleShare}
                disabled={loading || sharing}
                title="Apri le opzioni di condivisione su Instagram Stories o WhatsApp"
              >
                <i className="bi bi-instagram me-1"></i>
                <span>Condividi Storia</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

