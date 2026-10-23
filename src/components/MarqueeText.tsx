import React, { useRef, useState, useEffect, useMemo } from 'react';

interface MarqueeTextProps {
  text?: string | number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  children,
  className = '',
  style = {},
  title,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollDist, setScrollDist] = useState<number>(0);

  const stringVal = text !== undefined && text !== null ? String(text) : (typeof children === 'string' ? children : '');

  useEffect(() => {
    const updateOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        if (textWidth > containerWidth + 2) {
          // Add 6px margin so the very last letter is comfortably visible
          setScrollDist(textWidth - containerWidth + 6);
        } else {
          setScrollDist(0);
        }
      }
    };

    updateOverflow();

    // ResizeObserver detects container width changes on resize or tab switch
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => updateOverflow());
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateOverflow);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [text, children]);

  const isOverflowing = scrollDist > 0;
  // Much slower and relaxing duration: generous base pauses + calm ~10px/s glide speed
  const duration = Math.max(12.0, 9.0 + scrollDist / 10);

  // Subtle deterministic delay (0.5s - 2.0s) so multiple rows don't move in simultaneous lockstep
  const delay = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < stringVal.length; i++) {
      hash = (hash << 5) - hash + stringVal.charCodeAt(i);
      hash |= 0;
    }
    return 0.5 + ((Math.abs(hash) % 15) / 10);
  }, [stringVal]);

  return (
    <div
      ref={containerRef}
      className={`marquee-text-wrapper ${isOverflowing ? 'has-overflow' : ''} ${className}`}
      title={title || (stringVal ? stringVal : undefined)}
    >
      <span
        ref={textRef}
        className={`marquee-text-content ${isOverflowing ? 'is-scrolling' : ''}`}
        style={{
          ...style,
          ...(isOverflowing
            ? ({
                '--marquee-dist': `-${scrollDist}px`,
                '--marquee-duration': `${duration}s`,
                '--marquee-delay': `${delay}s`,
              } as React.CSSProperties)
            : {}),
        }}
      >
        {children ?? text}
      </span>
    </div>
  );
};

export default MarqueeText;
