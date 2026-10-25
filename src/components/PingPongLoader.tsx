import React from 'react';
import { ChampionshipItem } from '../types/fitet';

interface PingPongLoaderProps {
  targetChampionship?: ChampionshipItem | null;
  camId?: number | null;
  message?: string;
  subMessage?: string;
}

export const PingPongLoader: React.FC<PingPongLoaderProps> = ({
  targetChampionship,
  camId,
  message,
  subMessage,
}) => {
  const champName = targetChampionship?.nome || (camId ? `Campionato FITeT #${camId}` : 'Campionato FITeT');
  const champRegion = targetChampionship?.regione || '';
  const champCategory = targetChampionship?.categoria || '';

  return (
    <div className="ping-pong-loader-wrapper" role="status" aria-live="polite">
      <div className="ping-pong-loader-card">
        {/* Hypnotic Table Tennis Balls Animation Arena */}
        <div className="ping-pong-arena">
          {/* Table Surface with center net and boundary line */}
          <div className="ping-pong-table-surface">
            <div className="ping-pong-table-line"></div>
            <div className="ping-pong-net">
              <div className="ping-pong-net-mesh"></div>
              <div className="ping-pong-net-top"></div>
            </div>
          </div>

          {/* 3 Animated 3D Ping Pong Balls with Shadows */}
          <div className="ping-pong-balls-track">
            {/* Ball 1: Official White 3-Star Celluloid */}
            <div className="ping-pong-ball-column column-1">
              <div className="ping-pong-ball ball-white">
                <span className="ball-stamp">★</span>
              </div>
              <div className="ping-pong-ball-shadow shadow-1"></div>
            </div>

            {/* Ball 2: Classic Federal Orange 40+ */}
            <div className="ping-pong-ball-column column-2">
              <div className="ping-pong-ball ball-orange">
                <span className="ball-stamp">40+</span>
              </div>
              <div className="ping-pong-ball-shadow shadow-2"></div>
            </div>

            {/* Ball 3: Modern Federal Blue / Cyan Accent */}
            <div className="ping-pong-ball-column column-3">
              <div className="ping-pong-ball ball-blue">
                <span className="ball-stamp">FITeT</span>
              </div>
              <div className="ping-pong-ball-shadow shadow-3"></div>
            </div>
          </div>
        </div>

        {/* Text and Status Info */}
        <div className="ping-pong-loader-content">
          <div className="ping-pong-badge-pill">
            <i className="bi bi-arrow-repeat spin-icon text-primary me-1"></i>
            <span>Sincronizzazione FITeT in corso</span>
          </div>

          <h3 className="ping-pong-champ-title">
            {champName}
          </h3>

          {(champRegion || champCategory) && (
            <div className="ping-pong-champ-meta">
              {champRegion && (
                <span className="ping-pong-meta-item">
                  <i className="bi bi-geo-alt-fill me-1 text-danger"></i>
                  {champRegion}
                </span>
              )}
              {champCategory && (
                <span className="ping-pong-meta-item">
                  <i className="bi bi-award-fill me-1 text-warning"></i>
                  {champCategory}
                </span>
              )}
              {camId && (
                <span className="ping-pong-meta-item badge-id">
                  ID #{camId}
                </span>
              )}
            </div>
          )}

          <p className="ping-pong-status-desc">
            {message || 'Caricamento classifica ufficiale, calendario e statistiche atleti...'}
          </p>

          {subMessage && (
            <div className="ping-pong-submessage">
              {subMessage}
            </div>
          )}

          {/* Shimmer loading bar */}
          <div className="ping-pong-shimmer-track">
            <div className="ping-pong-shimmer-bar"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
