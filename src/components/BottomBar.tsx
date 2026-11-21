import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SocietaInfo } from '../types/fitet';
import './BottomBar.css';

export type MainViewType = 'home' | 'campionato' | 'tornei' | 'classifiche';

export interface BottomBarProps {
  activeView: MainViewType;
  onChangeView: (view: MainViewType) => void;
  onOpenSearchModal: () => void;
  onOpenMySociety?: () => void;
  mySocietyInfo?: SocietaInfo | null;
}

interface NavItem {
  view: MainViewType;
  icon: string;
  label: string;
  ariaLabel: string;
}

// L'ordine visivo della barra. Deve combaciare con l'ordine usato in App per
// l'animazione di slide tra le viste.
const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { view: 'home', icon: 'bi-house-door-fill', label: 'Home', ariaLabel: 'Home Dashboard' },
  { view: 'tornei', icon: 'bi-trophy-fill', label: 'Tornei', ariaLabel: 'Tornei FITeT' },
  { view: 'campionato', icon: 'bi-shield-fill', label: 'Campionato', ariaLabel: 'Campionato FITeT' },
  { view: 'classifiche', icon: 'bi-bar-chart-fill', label: 'Classifiche', ariaLabel: 'Classifiche Ranking FITeT' },
];

// Quanti pixel bisogna muovere il dito prima di considerare il gesto un drag.
const DRAG_THRESHOLD = 6;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface BarMetrics {
  items: Array<{ left: number; width: number; center: number } | null>;
}

interface DragSession {
  pointerId: number;
  startX: number;
  baseLeft: number;
  minLeft: number;
  maxLeft: number;
  lastX: number;
  lastTime: number;
  active: boolean;
  // Misure congelate all'inizio del drag: niente reflow a ogni pointermove.
  items: BarMetrics['items'];
}

type StretchOrigin = 'left center' | 'right center' | 'center';

export const BottomBar: React.FC<BottomBarProps> = ({
  activeView,
  onChangeView,
  onOpenSearchModal,
  onOpenMySociety,
  mySocietyInfo,
}) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragRef = useRef<DragSession | null>(null);
  const didDragRef = useRef(false);

  // Posizione misurata dell'indicatore (pill) sull'item attivo.
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });
  // Spostamento temporaneo dell'indicatore durante il drag.
  const [dragOffset, setDragOffset] = useState(0);
  // Stretch "liquido" dell'indicatore, in scala orizzontale.
  const [stretch, setStretch] = useState(1);
  const [stretchOrigin, setStretchOrigin] = useState<StretchOrigin>('center');
  const [dragging, setDragging] = useState(false);
  // Item più vicino all'indicatore durante il drag (anteprima di selezione).
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  // Item appena premuto: rende subito attivo il punto da cui parte il drag,
  // anche se non era quello selezionato in precedenza.
  const [visualIndex, setVisualIndex] = useState<number | null>(null);
  // Disattiva temporaneamente la transizione quando la pill "salta" sull'item premuto.
  const [snapPill, setSnapPill] = useState(false);

  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => item.view === activeView),
  );
  const pillIndex = visualIndex ?? activeIndex;

  const measure = useCallback(() => {
    const bar = barRef.current;
    const activeEl = itemRefs.current[pillIndex];
    if (!bar || !activeEl) return;

    const barRect = bar.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    const left = itemRect.left - barRect.left;
    const width = itemRect.width;

    setPill((prev) => {
      if (prev.ready && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.width - width) < 0.5) {
        return prev;
      }
      return { left, width, ready: true };
    });
  }, [pillIndex]);

  // Misura prima del paint per evitare qualsiasi flash dell'indicatore.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    let cancelled = false;
    const safeMeasure = () => {
      if (!cancelled) measure();
    };

    const observer = new ResizeObserver(safeMeasure);
    if (barRef.current) observer.observe(barRef.current);
    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    window.addEventListener('resize', safeMeasure);
    window.addEventListener('orientationchange', safeMeasure);

    // I font possono cambiare la larghezza delle label dopo il primo paint.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(safeMeasure).catch(() => {});
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('resize', safeMeasure);
      window.removeEventListener('orientationchange', safeMeasure);
    };
  }, [measure]);

  const getBarMetrics = (): BarMetrics | null => {
    const bar = barRef.current;
    if (!bar) return null;
    const barRect = bar.getBoundingClientRect();

    return {
      items: itemRefs.current.map((el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const left = rect.left - barRect.left;
        return { left, width: rect.width, center: left + rect.width / 2 };
      }),
    };
  };

  const findNearestIndex = (items: BarMetrics['items'], center: number): number => {
    let best = activeIndex;
    let bestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item, index) => {
      if (!item) return;
      const distance = Math.abs(item.center - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });

    return best;
  };

  const resetDragVisuals = () => {
    setDragging(false);
    setDragOffset(0);
    setStretch(1);
    setStretchOrigin('center');
    setDragTarget(null);
    setVisualIndex(null);
    setSnapPill(false);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Un secondo dito durante un drag attivo non deve rubare il gesto.
    if (dragRef.current?.active) return;
    didDragRef.current = false;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target as HTMLElement;
    // Il drag può partire da qualsiasi voce: quella premuta diventa subito attiva.
    const navButton = target.closest<HTMLElement>('[data-nav-index]');
    if (!navButton) return;

    const pressedIndex = Number(navButton.dataset.navIndex);
    const metrics = getBarMetrics();
    if (!metrics) return;

    const pressedItem = metrics.items[pressedIndex];
    if (!pressedItem) return;

    const first = metrics.items.find((item): item is NonNullable<typeof item> => Boolean(item));
    const last = [...metrics.items].reverse().find((item): item is NonNullable<typeof item> => Boolean(item));
    if (!first || !last) return;

    // La pill si sposta subito sulla voce premuta: da lì inizia il trascinamento.
    setVisualIndex(pressedIndex);
    if (pressedIndex !== pillIndex) {
      setSnapPill(true);
      setPill({ left: pressedItem.left, width: pressedItem.width, ready: true });
      window.requestAnimationFrame(() => setSnapPill(false));
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      baseLeft: pressedItem.left,
      minLeft: first.left,
      maxLeft: Math.max(first.left, last.left + last.width - pressedItem.width),
      lastX: event.clientX,
      lastTime: performance.now(),
      active: false,
      items: metrics.items,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;

    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      drag.active = true;
      setDragging(true);
      try {
        barRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture non disponibile: il drag continua comunque */
      }
    }

    if (event.cancelable) event.preventDefault();

    const left = clamp(drag.baseLeft + dx, drag.minLeft, drag.maxLeft);
    const offset = left - drag.baseLeft;
    setDragOffset(offset);

    const now = performance.now();
    const deltaTime = now - drag.lastTime;
    const velocity = deltaTime > 0 ? (event.clientX - drag.lastX) / deltaTime : 0; // px/ms
    drag.lastX = event.clientX;
    drag.lastTime = now;

    // Più veloce il gesto, più la pill si allunga in direzione del movimento.
    setStretch(1 + Math.min(0.16, Math.abs(velocity) * 0.09));
    if (Math.abs(offset) > 1) {
      setStretchOrigin(offset > 0 ? 'left center' : 'right center');
    }

    setDragTarget(findNearestIndex(drag.items, left + pill.width / 2));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const wasDragging = drag.active;
    dragRef.current = null;

    try {
      if (barRef.current?.hasPointerCapture(event.pointerId)) {
        barRef.current.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* noop */
    }

    // Un semplice tap: lascia che sia il click del bottone a navigare.
    if (!wasDragging) return;

    // Il drag è terminato: sopprime il click che il browser potrebbe generare.
    didDragRef.current = true;
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 0);

    const left = clamp(drag.baseLeft + (event.clientX - drag.startX), drag.minLeft, drag.maxLeft);
    const targetIndex = findNearestIndex(drag.items, left + pill.width / 2);

    resetDragVisuals();

    if (!cancelled) {
      const nextView = NAV_ITEMS[targetIndex]?.view;
      if (nextView && nextView !== activeView) {
        onChangeView(nextView);
      }
    }
  };

  const handleItemClick = (view: MainViewType) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      setVisualIndex(null);
      return;
    }
    setVisualIndex(null);
    onChangeView(view);
  };

  const highlightedIndex = dragging ? (dragTarget ?? pillIndex) : pillIndex;

  return (
    <nav className="portal-bottom-bar-wrapper" aria-label="Navigazione principale">
      <div
        ref={barRef}
        className={`portal-bottom-bar${dragging ? ' is-dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
        onPointerLeave={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          if (!drag.active) {
            // Puntatore uscito prima della soglia: annulla il tap potenziale.
            dragRef.current = null;
            setVisualIndex(null);
            setSnapPill(false);
            return;
          }
          // Se il pointer capture non è disponibile, chiude il drag uscendo dalla barra.
          if (!barRef.current?.hasPointerCapture(event.pointerId)) {
            dragRef.current = null;
            resetDragVisuals();
          }
        }}
      >
        {/* Indicatore scorrevole: segue il dito e si aggancia all'item più vicino */}
        <div
          className={`bottom-bar-pill${pill.ready ? ' is-ready' : ''}${snapPill ? ' is-snapping' : ''}`}
          aria-hidden="true"
          style={
            {
              width: pill.width ? `${pill.width}px` : undefined,
              '--pill-left': `${pill.left + dragOffset}px`,
              '--pill-stretch': stretch,
              '--pill-origin': stretchOrigin,
            } as React.CSSProperties
          }
        />

        {NAV_ITEMS.map((item, index) => (
          <button
            key={item.view}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            data-nav-index={index}
            className={`bottom-bar-item${index === highlightedIndex ? ' is-active' : ''}`}
            onClick={() => handleItemClick(item.view)}
            aria-label={item.ariaLabel}
            aria-current={activeView === item.view ? 'page' : undefined}
          >
            <div className="bottom-bar-icon-wrap">
              <i className={`bi ${item.icon}`}></i>
            </div>
            <span className="bottom-bar-label">{item.label}</span>
          </button>
        ))}

        {/* Cerca Atleta */}
        <button
          type="button"
          className="bottom-bar-item bottom-bar-search-item"
          onClick={onOpenSearchModal}
          aria-label="Cerca Atleta"
          title="Cerca atleta FITeT"
        >
          <div className="bottom-bar-icon-wrap">
            <i className="bi bi-search"></i>
          </div>
          <span className="bottom-bar-label">Cerca Atleta</span>
        </button>

        {/* La mia società (solo desktop) */}
        {onOpenMySociety && (
          <button
            type="button"
            className="bottom-bar-item bottom-bar-society-item"
            onClick={onOpenMySociety}
            aria-label="La mia società"
            title="La mia società"
          >
            <div className="bottom-bar-icon-wrap">
              {mySocietyInfo?.logoUrl ? (
                <img
                  src={mySocietyInfo.logoUrl}
                  alt=""
                  className="bottom-bar-society-logo"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <i className="bi bi-buildings"></i>
              )}
            </div>
            <span className="bottom-bar-label">Società</span>
          </button>
        )}
      </div>
    </nav>
  );
};
