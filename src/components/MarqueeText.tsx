import React, { useRef, useState, useEffect } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  className = '',
  style = {},
  title,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollDist, setScrollDist] = useState<number>(0);

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
  }, [text]);

  const isOverflowing = scrollDist > 0;
  // Natural reading duration: base 3.5s pause + 25px/s reading speed
  const duration = Math.max(4.5, 3.5 + scrollDist / 25);

  return (
    <div
      ref={containerRef}
      className={`marquee-text-wrapper ${isOverflowing ? 'has-overflow' : ''} ${className}`}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%',
        minWidth: 0,
        position: 'relative',
        display: 'block',
      }}
      title={title || text}
    >
      <span
        ref={textRef}
        className={`marquee-text-content ${isOverflowing ? 'is-scrolling' : ''}`}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          ...style,
          ...(isOverflowing
            ? ({
                '--marquee-dist': `-${scrollDist}px`,
                '--marquee-duration': `${duration}s`,
              } as React.CSSProperties)
            : {}),
        }}
      >
        {text}
      </span>
    </div>
  );
};

export default MarqueeText;
