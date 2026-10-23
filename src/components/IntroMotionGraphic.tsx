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
    }, 480);
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={`motion-intro-overlay ${isClosing ? 'is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Introduzione Campionati FITeT"
    >

      {/* Center Motion Graphic Stage */}
      <div className="motion-intro-stage">
        {/* Grand Hero Titles */}
        <div className="motion-intro-title">
          <span className="title-fitet">
            <img src="bw.png" alt="" />
          </span>
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
          <span>Entra nel nuovo portale</span>
          <span className="cta-arrow">
            <i className="bi bi-arrow-right"></i>
          </span>
        </button>
      </div>

      {/* Bottom Progress Timer Line removed*/}
    </div>
  );
};
