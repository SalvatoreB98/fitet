import React, { useState, useEffect, useRef } from 'react';
import './IntroMotionGraphic.css';

interface IntroMotionGraphicProps {
  onComplete: () => void;
}

export const IntroMotionGraphic: React.FC<IntroMotionGraphicProps> = ({ onComplete }) => {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFinish = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onComplete();
    }, 420);
  };

  useEffect(() => {
    // Keyboard shortcut to skip
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleFinish();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto-advance after 2.8s
    timerRef.current = setTimeout(() => {
      handleFinish();
    }, 50000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className={`motion-intro-overlay ${isClosing ? 'is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Introduzione Campionati FITeT"
    >
      {/* Dynamic ambient backgrounds */}
      <div className="motion-intro-ambient" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1"></div>
        <div className="ambient-orb ambient-orb-2"></div>
        <div className="ambient-grid"></div>
      </div>

      {/* Center Motion Graphic Stage */}
      <div className="motion-intro-stage">
        {/* Grand Hero Titles */}
        <div className="motion-intro-title">
          <span className="title-fitet">FITeT</span>
          <span className="title-campionati">CAMPIONATI</span>
        </div>

        <p className="motion-intro-sub">
          Risultati • Classifiche • Statistiche Atleti
        </p>

        {/* Interactive CTA */}
        <button
          type="button"
          className="motion-intro-cta"
          onClick={handleFinish}
          autoFocus
        >
          <span>Entra nel portale</span>
          <span className="cta-arrow">→</span>
        </button>
      </div>

      {/* Bottom Progress Timer Line */}
      <div className="motion-intro-progress-bar" aria-hidden="true">
        <div className="motion-intro-progress-fill"></div>
      </div>
    </div>
  );
};
