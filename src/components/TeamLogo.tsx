import React, { useState, useEffect } from 'react';
import { getTeamLogoUrl } from '../utils/teamLogos';

export interface TeamLogoProps {
  teamName?: string;
  logoUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
  alt?: string;
  title?: string;
}

const GENERIC_FEDERALE_LOGO = 'https://portale.fitet.org/images/societa/img_generica.jpg';

export const TeamLogo: React.FC<TeamLogoProps> = ({
  teamName,
  logoUrl,
  className = '',
  style,
  size,
  alt = '',
  title,
}) => {
  const [errorCount, setErrorCount] = useState<number>(0);

  // Reset error state if teamName or logoUrl changes
  useEffect(() => {
    setErrorCount(0);
  }, [teamName, logoUrl]);

  const primaryUrl = getTeamLogoUrl(teamName, logoUrl);

  const getInitials = (name?: string): string => {
    if (!name) return 'TT';
    const words = name
      .replace(/^(ASD|APD|TT|POLISPORTIVA|TENNISTAVOLO)\s+/i, '')
      .split(' ')
      .filter(Boolean);
    if (words.length === 0) return name.slice(0, 3).toUpperCase();
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  const handleError = () => {
    setErrorCount((prev) => prev + 1);
  };

  const dimensionStyles: React.CSSProperties = size
    ? { width: size, height: size, minWidth: size, minHeight: size }
    : {};

  // Level 0: Try primaryUrl
  // Level 1: Fallback to official generic FITeT logo
  // Level 2: Fallback to styled initials badge (prevents layout collapse and stops infinite loops)
  if (errorCount >= 2) {
    return (
      <div
        className={`team-logo-fallback ${className}`}
        style={{
          fontSize: typeof size === 'number' ? Math.max(10, size * 0.35) : '11px',
          ...dimensionStyles,
          ...style,
        }}
        title={title || teamName}
      >
        <span>{getInitials(teamName)}</span>
      </div>
    );
  }

  const currentSrc = errorCount === 0 ? primaryUrl : GENERIC_FEDERALE_LOGO;

  return (
    <img
      src={currentSrc}
      alt={alt || teamName || 'Logo Squadra'}
      title={title || teamName}
      className={`team-logo-img ${className}`}
      style={{
        objectFit: 'contain',
        flexShrink: 0,
        ...dimensionStyles,
        ...style,
      }}
      onError={handleError}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
};
