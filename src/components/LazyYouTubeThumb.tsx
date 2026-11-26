import { useEffect, useRef, useState } from 'react';

// 1x1 transparent GIF: evita richieste di rete finché la thumbnail non entra
// nel viewport (o nella rootMargin dell'IntersectionObserver).
const PLACEHOLDER_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

type LazyYouTubeThumbProps = {
  videoId: string;
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
};

/**
 * Thumbnail YouTube caricata solo quando si avvicina al viewport.
 * Evita che decine di immagini vengano scaricate al primo paint, mantenendo
 * `loading="lazy"`, dimensioni esplicite (CLS) e decoding asincrono.
 */
export function LazyYouTubeThumb({
  videoId,
  className,
  alt = '',
  width = 320,
  height = 180,
}: LazyYouTubeThumbProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad || !videoId) return;
    const img = imgRef.current;
    if (!img) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(img);
    return () => observer.disconnect();
  }, [shouldLoad, videoId]);

  const src =
    shouldLoad && videoId
      ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
      : PLACEHOLDER_SRC;

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
    />
  );
}
