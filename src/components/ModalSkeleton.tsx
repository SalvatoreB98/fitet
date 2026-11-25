import React from 'react';

/**
 * Primitive e preset di skeleton riutilizzabili per tutte le modali.
 * Obiettivo: riservare lo spazio con una struttura simile al contenuto reale
 * così da evitare scatti di layout (CLS) quando arrivano i dati.
 */

type Size = number | string;

const toCss = (v?: Size) => (typeof v === 'number' ? `${v}px` : v);

interface SkelProps {
  w?: Size;
  h?: Size;
  r?: Size;
  className?: string;
  style?: React.CSSProperties;
}

export const Skel: React.FC<SkelProps> = ({ w = '100%', h = 12, r = 7, className = '', style }) => (
  <span
    className={`skel ${className}`}
    aria-hidden="true"
    style={{ width: toCss(w), height: toCss(h), borderRadius: toCss(r), ...style }}
  />
);

interface SkeletonWrapProps {
  label: string;
  caption?: string;
  className?: string;
  children: React.ReactNode;
}

/** Contenitore accessibile con didascalia di stato opzionale */
export const SkeletonWrap: React.FC<SkeletonWrapProps> = ({ label, caption, className = '', children }) => (
  <div className={`skel-wrap ${className}`} role="status" aria-busy="true" aria-label={label}>
    {children}
    {caption && (
      <div className="skel-caption">
        <span className="skel-caption-dot" aria-hidden="true" />
        <span>{caption}</span>
      </div>
    )}
  </div>
);

/** Replica la .overview-stats-card a N colonne */
export const SkeletonStatsCard: React.FC<{ cols?: number; className?: string }> = ({ cols = 4, className = '' }) => (
  <div className={`overview-stats-card skel-stats-card ${className}`}>
    <div className="overview-stats-row">
      {Array.from({ length: cols }).map((_, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <div className="overview-stat-divider" aria-hidden="true" />}
          <div className="overview-stat-col skel-stat-col">
            <Skel w={56} h={9} />
            <Skel w={52} h={22} />
            <Skel w={68} h={9} />
          </div>
        </React.Fragment>
      ))}
    </div>
  </div>
);

/** Intestazione di sezione (titolo + sottotitolo + badge a destra) */
export const SkeletonSectionHead: React.FC<{
  withSub?: boolean;
  withBadge?: boolean;
  titleW?: Size;
  badgeW?: Size;
  className?: string;
}> = ({
  withSub = true,
  withBadge = true,
  titleW = 180,
  badgeW = 64,
  className = '',
}) => (
  <div className={`skel-section-head ${className}`}>
    <div className="skel-section-head-left">
      <Skel w={titleW} h={16} />
      {withSub && <Skel w={260} h={10} style={{ maxWidth: '70vw', marginTop: 4 }} />}
    </div>
    {withBadge && <Skel w={badgeW} h={20} r={999} />}
  </div>
);

/** Righe tabella con avatar + nome + colonne numeriche */
export const SkeletonTableRows: React.FC<{
  rows?: number;
  cols?: number;
  avatar?: boolean;
  count?: number;
  hasAvatar?: boolean;
  className?: string;
}> = ({
  rows,
  cols = 4,
  avatar,
  count,
  hasAvatar,
  className = '',
}) => {
  const rowCount = count ?? rows ?? 6;
  const showAvatar = hasAvatar ?? avatar ?? true;
  return (
    <div className={`skel-table ${className}`}>
      <div className="skel-table-header">
        <Skel w="28%" h={10} />
        {Array.from({ length: cols }).map((_, i) => (
          <Skel key={i} w={36} h={10} />
        ))}
      </div>
      {Array.from({ length: rowCount }).map((_, rowIdx) => (
        <div className="skel-table-row" key={rowIdx}>
          <div className="skel-table-cell-main">
            {showAvatar && <Skel w={30} h={30} r="50%" />}
            <div className="skel-table-cell-meta">
              <Skel w={`${62 + ((rowIdx * 13) % 30)}%`} h={12} />
              <Skel w="38%" h={9} />
            </div>
          </div>
          <div className="skel-table-cols">
            {Array.from({ length: cols }).map((_, i) => (
              <Skel key={i} w={32} h={12} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Lista di righe cliccabili (indice/icona + due righe di testo + chevron) */
export const SkeletonListRows: React.FC<{
  rows?: number;
  count?: number;
  leading?: 'circle' | 'square' | 'none';
  hasChevron?: boolean;
  className?: string;
}> = ({
  rows,
  count,
  leading = 'circle',
  hasChevron = true,
  className = '',
}) => {
  const rowCount = count ?? rows ?? 5;
  return (
    <div className={`skel-list ${className}`}>
      {Array.from({ length: rowCount }).map((_, idx) => (
        <div className="skel-list-row" key={idx}>
          {leading !== 'none' && <Skel w={32} h={32} r={leading === 'circle' ? '50%' : 9} />}
          <div className="skel-list-meta">
            <Skel w={`${48 + ((idx * 17) % 36)}%`} h={13} />
            <Skel w={`${30 + ((idx * 11) % 24)}%`} h={10} />
          </div>
          {hasChevron && <Skel w={14} h={14} r={4} />}
        </div>
      ))}
    </div>
  );
};

/** Griglia di card (campionati, incontri, gironi) */
export const SkeletonCardGrid: React.FC<{
  count?: number;
  height?: number;
  minWidth?: number;
  className?: string;
}> = ({
  count = 6,
  height = 84,
  minWidth = 220,
  className = '',
}) => (
  <div
    className={`skel-card-grid ${className}`}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      gap: '12px',
    }}
  >
    {Array.from({ length: count }).map((_, idx) => (
      <div
        className="skel-card"
        key={idx}
        style={{
          height,
          padding: '12px 14px',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Skel w="72%" h={13} />
        <Skel w="46%" h={10} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Skel w={54} h={18} r={999} />
          <Skel w={28} h={12} />
        </div>
      </div>
    ))}
  </div>
);

/** Banner "versus" (due lati + punteggio centrale), per H2H, referto e anteprima incontro */
export const SkeletonVersus: React.FC<{
  avatar?: 'circle' | 'square';
  avatarShape?: 'circle' | 'square';
  withBar?: boolean;
  showScoreBar?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}> = ({
  avatar,
  avatarShape,
  withBar,
  showScoreBar,
  leftLabel,
  rightLabel,
  className = '',
}) => {
  const shape = avatarShape ?? avatar ?? 'circle';
  const displayBar = showScoreBar ?? withBar ?? true;
  const radius = shape === 'circle' ? '50%' : 12;

  const renderSide = (label?: string, isRight?: boolean) => (
    <div className={`skel-versus-side ${isRight ? 'is-right' : ''}`}>
      <Skel w={60} h={60} r={radius} style={{ flexShrink: 0 }} />
      <div className="skel-versus-meta">
        {label ? (
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-dark)' }}>{label}</span>
        ) : (
          <Skel w="75%" h={13} />
        )}
        <Skel w="48%" h={10} />
      </div>
    </div>
  );

  return (
    <div className={`skel-versus ${className}`}>
      <div className="skel-versus-row">
        {renderSide(leftLabel, false)}
        <div className="skel-versus-center">
          <Skel w={76} h={34} r={10} />
          <Skel w={56} h={9} />
        </div>
        {renderSide(rightLabel, true)}
      </div>
      {displayBar && <Skel w="100%" h={8} r={999} className="skel-versus-bar" />}
    </div>
  );
};
