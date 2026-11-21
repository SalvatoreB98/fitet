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

interface ItemMetric {
  left: number;
  width: number;
  center: number;
}

interface DragSession {
  pointerId: number;
  startX: number;
  baseLeft: number;
  pillWidth: number;
  minLeft: number;
  maxLeft: number;
  lastX: number;
  lastTime: number;
  active: boolean;
  items: Array<ItemMetric | null>;
  rafId: number | null;
  pendingClientX: number;
  currentTarget: number;
}

const findNearestIndex = (
  items: Array<ItemMetric | null>,
  center: number,
  fallback: number
): number => {
  let best = fallback;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const distance = Math.abs(item.center - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  return best;
};

export const BottomBar: React.FC<BottomBarProps> = React.memo(({
  activeView,
  onChangeView,
  onOpenSearchModal,
  onOpenMySociety,
  mySocietyInfo,
}) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragRef = useRef<DragSession | null>(null);
  const didDragRef = useRef(false);
  const lastPillRectRef = useRef<{ left: number; width: number }>({ left: -1, width: -1 });

  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => item.view === activeView),
  );
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // Stato minimo: solo per stato visuale (visibilità/dragTarget/dragging).
  // Le coordinate a 60/120fps durante il drag vengono applicate direttamente sul DOM via rAF.
  const [pillReady, setPillReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<number | null>(null);

  const applyPillTransform = useCallback(
    (left: number, width: number, stretch = 1, origin: 'left center' | 'right center' | 'center' = 'center', instant = false) => {
      const pillEl = pillRef.current;
      if (!pillEl) return;
      if (instant) {
        pillEl.classList.add('is-snapping');
      } else {
        pillEl.classList.remove('is-snapping');
      }
      if (Math.abs(lastPillRectRef.current.width - width) >= 0.5) {
        pillEl.style.width = `${width}px`;
      }
      lastPillRectRef.current = { left, width };
      pillEl.style.transformOrigin = origin;
      pillEl.style.transform =
        stretch === 1
          ? `translate3d(${left}px, 0, 0)`
          : `translate3d(${left}px, 0, 0) scaleX(${stretch})`;
    },
    [],
  );

  const measureActive = useCallback(() => {
    if (dragRef.current?.active) return;
    const bar = barRef.current;
    const activeEl = itemRefs.current[activeIndexRef.current];
    if (!bar || !activeEl) return;

    const barRect = bar.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    const left = itemRect.left - barRect.left;
    const width = itemRect.width;

    if (
      Math.abs(lastPillRectRef.current.left - left) < 0.5 &&
      Math.abs(lastPillRectRef.current.width - width) < 0.5
    ) {
      return;
    }

    applyPillTransform(left, width, 1, 'center', false);
    setPillReady((prev) => (prev ? prev : true));
  }, [applyPillTransform]);

  // Misura prima del paint quando cambia la tab attiva.
  useLayoutEffect(() => {
    measureActive();
  }, [activeIndex, measureActive]);

  // ResizeObserver creato una sola volta (nessun teardown ad ogni tap).
  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    const scheduleMeasure = () => {
      if (cancelled || rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!cancelled) measureActive();
      });
    };

    const observer = new ResizeObserver(scheduleMeasure);
    if (barRef.current) observer.observe(barRef.current);

    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('orientationchange', scheduleMeasure, { passive: true });

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(scheduleMeasure).catch(() => {});
    }

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
    };
  }, [measureActive]);

  const getBarMetrics = (): Array<ItemMetric | null> | null => {
    const bar = barRef.current;
    if (!bar) return null;
    const barRect = bar.getBoundingClientRect();

    return itemRefs.current.map((el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const left = rect.left - barRect.left;
      return { left, width: rect.width, center: left + rect.width / 2 };
    });
  };

  const cleanupDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.rafId !== null && drag?.rafId !== undefined) {
      window.cancelAnimationFrame(drag.rafId);
    }
    dragRef.current = null;
    setDragging(false);
    setDragTarget(null);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) return;
    didDragRef.current = false;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target as HTMLElement;
    const navButton = target.closest<HTMLElement>('[data-nav-index]');
    if (!navButton) return;

    const pressedIndex = Number(navButton.dataset.navIndex);
    const items = getBarMetrics();
    if (!items) return;

    const pressedItem = items[pressedIndex];
    if (!pressedItem) return;

    const first = items.find((item): item is ItemMetric => Boolean(item));
    const last = [...items].reverse().find((item): item is ItemMetric => Boolean(item));
    if (!first || !last) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      baseLeft: pressedItem.left,
      pillWidth: pressedItem.width,
      minLeft: first.left,
      maxLeft: Math.max(first.left, last.left + last.width - pressedItem.width),
      lastX: event.clientX,
      lastTime: performance.now(),
      active: false,
      items,
      rafId: null,
      pendingClientX: event.clientX,
      currentTarget: pressedIndex,
    };
  };

  const flushDragFrame = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;
    drag.rafId = null;

    const clientX = drag.pendingClientX;
    const dx = clientX - drag.startX;
    const left = clamp(drag.baseLeft + dx, drag.minLeft, drag.maxLeft);
    const offset = left - drag.baseLeft;

    const now = performance.now();
    const deltaTime = now - drag.lastTime;
    const velocity = deltaTime > 0 ? (clientX - drag.lastX) / deltaTime : 0;
    drag.lastX = clientX;
    drag.lastTime = now;

    const stretch = 1 + Math.min(0.14, Math.abs(velocity) * 0.08);
    const origin: 'left center' | 'right center' | 'center' =
      Math.abs(offset) > 1 ? (offset > 0 ? 'left center' : 'right center') : 'center';

    applyPillTransform(left, drag.pillWidth, stretch, origin, true);

    const nextTarget = findNearestIndex(
      drag.items,
      left + drag.pillWidth / 2,
      activeIndexRef.current
    );
    if (nextTarget !== drag.currentTarget) {
      drag.currentTarget = nextTarget;
      setDragTarget(nextTarget);
    }
  }, [applyPillTransform]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;

    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      drag.active = true;
      setDragging(true);
      setDragTarget(drag.currentTarget);
      // Posiziona subito la pill sul punto di partenza senza transizione
      applyPillTransform(drag.baseLeft, drag.pillWidth, 1, 'center', true);
      try {
        barRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture non disponibile */
      }
    }

    if (event.cancelable) event.preventDefault();
    drag.pendingClientX = event.clientX;
    if (drag.rafId === null) {
      drag.rafId = window.requestAnimationFrame(flushDragFrame);
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const wasDragging = drag.active;

    try {
      if (barRef.current?.hasPointerCapture(event.pointerId)) {
        barRef.current.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* noop */
    }

    if (!wasDragging) {
      dragRef.current = null;
      return;
    }

    didDragRef.current = true;
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 50);

    const left = clamp(drag.baseLeft + (event.clientX - drag.startX), drag.minLeft, drag.maxLeft);
    const targetIndex = findNearestIndex(
      drag.items,
      left + drag.pillWidth / 2,
      activeIndexRef.current
    );
    const targetItem = drag.items[targetIndex];

    cleanupDrag();

    // Aggancia subito la pillola sull'item di destinazione con transizione GPU,
    // poi delega il cambio vista pesante al frame successivo in startTransition.
    if (targetItem) {
      applyPillTransform(targetItem.left, targetItem.width, 1, 'center', false);
    }

    const nextView = !cancelled ? NAV_ITEMS[targetIndex]?.view : undefined;
    if (nextView && nextView !== activeView) {
      window.requestAnimationFrame(() => {
        React.startTransition(() => {
          onChangeView(nextView);
        });
      });
    } else {
      window.requestAnimationFrame(() => measureActive());
    }
  };

  const handleItemClick = (view: MainViewType) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onChangeView(view);
  };

  const highlightedIndex = dragging ? (dragTarget ?? activeIndex) : activeIndex;

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
            dragRef.current = null;
            return;
          }
          if (!barRef.current?.hasPointerCapture(event.pointerId)) {
            cleanupDrag();
            window.requestAnimationFrame(() => measureActive());
          }
        }}
      >
        {/* Indicatore scorrevole: aggiornato via DOM/rAF per 60/120fps su iPhone */}
        <div
          ref={pillRef}
          className={`bottom-bar-pill${pillReady ? ' is-ready' : ''}`}
          aria-hidden="true"
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
});
