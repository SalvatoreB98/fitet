import React, { useState, useEffect } from 'react';
import { isPhotoError, markPhotoLoaded, markPhotoError } from '../utils/photoCache';

export interface AthleteAvatarProps {
  atletaId?: string | null;
  photoUrlOverride?: string | null;
  nome: string;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  avatarPlaceholder?: boolean;
}

export const AthleteAvatar: React.FC<AthleteAvatarProps> = ({
  atletaId,
  photoUrlOverride,
  nome,
  size = 28,
  className = '',
  style,
  avatarPlaceholder = false,
}) => {
  const photoUrl = photoUrlOverride || (atletaId ? `https://portale.fitet.org/images/atleti/${atletaId}.jpg` : null);
  const [error, setError] = useState<boolean>(() => (photoUrl ? isPhotoError(photoUrl) : false));
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  );

  useEffect(() => {
    if (!avatarPlaceholder || typeof document === 'undefined') return;
    const updateTheme = () => {
      setIsDarkTheme(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [avatarPlaceholder]);

  const isBig = (typeof size === 'number' && size >= 64) || size === '100%';
  const placeholderSrc = isDarkTheme
    ? (isBig ? '/dark-big-placeholder.png' : '/dark-placeholder.png')
    : (isBig ? '/light-big-placeholder.png' : '/light-placeholder.png');

  const initials = nome
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    setError(photoUrl ? isPhotoError(photoUrl) : false);
  }, [atletaId, photoUrl]);

  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`athlete-avatar-wrapper ${className}`}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        ...style,
      }}
      title={`Foto ${nome}`}
    >
      {!error && photoUrl ? (
        <img
          src={photoUrl}
          alt={nome}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onLoad={() => markPhotoLoaded(photoUrl)}
          onError={() => {
            markPhotoError(photoUrl);
            setError(true);
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : avatarPlaceholder ? (
        <img
          src={placeholderSrc}
          alt={nome}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <span
          className="athlete-avatar-initials"
          style={{
            fontSize: typeof size === 'number' ? `${Math.max(9, size * 0.38)}px` : '10.5px',
          }}
        >
          {initials || <i className="bi bi-person-fill" style={{ fontSize: typeof size === 'number' ? `${Math.max(12, size * 0.52)}px` : '13px' }} />}
        </span>
      )}
    </div>
  );
};
