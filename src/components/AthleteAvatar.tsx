import React, { useState, useEffect } from 'react';

export interface AthleteAvatarProps {
  atletaId?: string | null;
  nome: string;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const AthleteAvatar: React.FC<AthleteAvatarProps> = ({
  atletaId,
  nome,
  size = 28,
  className = '',
  style,
}) => {
  const [error, setError] = useState(false);

  const initials = nome
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const photoUrl = atletaId ? `https://portale.fitet.org/images/atleti/${atletaId}.jpg` : null;

  useEffect(() => {
    setError(false);
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
          onError={() => setError(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
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
