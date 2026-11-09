import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MatchVideoInfo } from '../types/fitet';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface MatchVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: MatchVideoInfo[];
  initialVideoId?: string;
  matchTitle?: string;
  squadraCasa?: string;
  squadraOspite?: string;
  giornata?: number;
}

export const MatchVideoModal: React.FC<MatchVideoModalProps> = ({
  isOpen,
  onClose,
  videos,
  initialVideoId,
  matchTitle,
  squadraCasa,
  squadraOspite,
  giornata,
}) => {
  useBodyScrollLock(isOpen);

  // Normalizza e valida la lista dei video
  const sanitizedVideos = React.useMemo(() => {
    return (videos || [])
      .map((v: any) => ({
        videoId: String(v?.videoId || v?.video_id || '').trim(),
        channelName: v?.channelName || v?.channel_name || 'YouTube',
        channelUrl: v?.channelUrl || v?.channel_url || '',
        title: v?.title || '',
        publishedAt: v?.publishedAt || v?.published_at || '',
        league: v?.league || null,
        matchDay: v?.matchDay ?? v?.match_day ?? null,
        teamHome: v?.teamHome || v?.team_home || null,
        teamAway: v?.teamAway || v?.team_away || null,
      }))
      .filter((v) => Boolean(v.videoId) && v.videoId !== 'undefined' && v.videoId !== 'null');
  }, [videos]);

  const [activeVideoId, setActiveVideoId] = useState<string>('');

  useEffect(() => {
    if (sanitizedVideos && sanitizedVideos.length > 0) {
      if (initialVideoId && sanitizedVideos.some((v) => v.videoId === initialVideoId)) {
        setActiveVideoId(initialVideoId);
      } else {
        setActiveVideoId(sanitizedVideos[0].videoId);
      }
    }
  }, [sanitizedVideos, initialVideoId, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || sanitizedVideos.length === 0) return null;

  const currentVideo = sanitizedVideos.find((v) => v.videoId === activeVideoId) || sanitizedVideos[0];
  const videoId = currentVideo?.videoId;

  if (!videoId || videoId === 'undefined') return null;

  const headerTitle =
    matchTitle ||
    (squadraCasa && squadraOspite
      ? `${squadraCasa} vs ${squadraOspite}`
      : currentVideo.title);

  return createPortal(
    <div
      className="match-video-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Video incontro"
    >
      <div className="match-video-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="match-video-header">
          <div className="match-video-header-left">
            <span className="match-video-icon-badge">
              <i className="bi bi-youtube"></i>
            </span>
            <div className="match-video-titles">
              <div className="match-video-badges-row">
                <span className="match-video-badge-pill">
                  {giornata ? `Giornata ${giornata}` : 'Video Incontro'}
                </span>
                {sanitizedVideos.length > 1 && (
                  <span className="match-video-badge-count">
                    {sanitizedVideos.length} video disponibili
                  </span>
                )}
              </div>
              <h2 className="match-video-title">
                {headerTitle}
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="match-video-close-btn"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Video Switcher Tabs (se presenti più video) */}
        {sanitizedVideos.length > 1 && (
          <div className="match-video-switcher">
            <span className="match-video-switcher-label">
              <i className="bi bi-collection-play"></i> Canali / Video:
            </span>
            {sanitizedVideos.map((v, idx) => {
              const isActive = v.videoId === activeVideoId;
              return (
                <button
                  key={v.videoId}
                  type="button"
                  className={`match-video-tab-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveVideoId(v.videoId)}
                >
                  <i className={isActive ? 'bi bi-play-circle-fill' : 'bi bi-play-circle'}></i>
                  <span>{v.channelName || `Video #${idx + 1}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 16:9 Video Player */}
        <div className="match-video-player-container">
          <iframe
            key={videoId}
            className="match-video-iframe"
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
            title={currentVideo.title || 'Video Incontro'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Video Info & Attribution Footer */}
        <div className="match-video-footer">
          <div className="match-video-footer-row">
            <div className="match-video-meta-block">
              <h3 className="match-video-meta-title">
                {currentVideo.title}
              </h3>

              <div className="match-video-meta-info">
                <span>Canale:</span>
                <a
                  className="match-video-channel-link"
                  href={currentVideo.channelUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(currentVideo.channelName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Visita il canale ${currentVideo.channelName} su YouTube`}
                >
                  <i className="bi bi-youtube"></i>
                  <span>{currentVideo.channelName}</span>
                  <i className="bi bi-box-arrow-up-right" style={{ fontSize: '10px' }}></i>
                </a>

                {currentVideo.publishedAt && (
                  <>
                    <span>•</span>
                    <span>
                      <i className="bi bi-calendar3" style={{ marginRight: '4px' }}></i>
                      {new Date(currentVideo.publishedAt).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Link to YouTube */}
            <div className="match-video-actions">
              <a
                className="match-video-external-btn"
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="bi bi-play-fill"></i>
                <span>Apri su YouTube</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};