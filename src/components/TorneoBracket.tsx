import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TorneoMatchItem } from '../types/fitet';
import { AthleteAvatar } from './AthleteAvatar';
import {
  computeBracketRows,
  findNextRoundMatchIndex,
  getMatchWinnerName,
  selectMainTabRounds,
  sortBracketRounds,
} from '../utils/bracketRounds';
import './TorneoBracket.css';

export interface BracketRoundData {
  tab?: number;
  turno?: number;
  roundLabel: string;
  matches: TorneoMatchItem[];
}

export interface TorneoBracketProps {
  rounds: BracketRoundData[];
  competitionName?: string;
  onOpenAtletaModal: (atletaId: string, nome: string) => void;
  onCloseFullscreen?: () => void;
  onToggleFullscreen?: (isFullscreen: boolean) => void;
  isModal?: boolean;
}

export const TorneoBracket: React.FC<TorneoBracketProps> = ({
  rounds,
  competitionName = 'Tabellone Eliminazione Diretta',
  onOpenAtletaModal,
  onCloseFullscreen,
  onToggleFullscreen,
  isModal = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(isModal);

  // Live Zoom & Pan State Refs (evita closure stale durante gesture a 60fps)
  const zoomRef = useRef<number>(1);
  const isDraggingRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomLevelRef = useRef<number>(1);
  const initialPinchMidRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafZoomUpdateRef = useRef<number | null>(null);

  // Normalizza e ordina i round dal primo turno (più partite) all'ultimo (la finale con 1 partita).
  // L'ordine si basa sul numero di turno FITeT (monotono), non sul numero di incontri:
  // con i bye due turni consecutivi possono avere lo stesso numero di partite.
  const sortedRounds = useMemo(() => {
    if (!rounds || rounds.length === 0) return [];

    // Se la gara ha più tabelloni (principal + consolazione) non vanno mescolati.
    const mainTabRounds = selectMainTabRounds(rounds);
    return sortBracketRounds(mainTabRounds);
  }, [rounds]);

  // Calcolo layout a due lati (Two-sides se primo round ha >= 8 incontri)
  const { isTwoSides, leftRounds, rightRounds, finalMatch, centerRoundLabel } = useMemo(() => {
    if (sortedRounds.length === 0) {
      return {
        isTwoSides: false,
        leftRounds: [],
        rightRounds: [],
        finalMatch: null,
        centerRoundLabel: 'Finale',
      };
    }

    // La finale è l'ultimo turno se ha un solo incontro; eventuali turni con
    // un solo match ma non conclusivi restano nelle colonne laterali.
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const hasFinal = lastRound.matches.length === 1;
    const sideSourceRounds = hasFinal ? sortedRounds.slice(0, -1) : sortedRounds;

    const firstMatchesCount = sideSourceRounds[0]?.matches.length ?? 0;
    const twoSides = firstMatchesCount >= 8;

    if (!twoSides) {
      return {
        isTwoSides: false,
        leftRounds: [],
        rightRounds: [],
        finalMatch: hasFinal ? lastRound.matches[0] : null,
        centerRoundLabel: hasFinal ? lastRound.roundLabel || 'Finale' : '',
      };
    }

    const left: BracketRoundData[] = [];
    const right: BracketRoundData[] = [];
    let final: TorneoMatchItem | null = hasFinal ? lastRound.matches[0] : null;
    const finalLabel = hasFinal ? lastRound.roundLabel || 'Finale' : 'Finale';

    sideSourceRounds.forEach((r) => {
      const m = r.matches || [];
      // Il lato sinistro rappresenta la metà alta del tabellone: con un numero
      // dispari di incontri il match "in più" resta a sinistra.
      const half = Math.ceil(m.length / 2);
      left.push({ ...r, matches: m.slice(0, half) });
      right.push({ ...r, matches: m.slice(half) });
    });

    return {
      isTwoSides: true,
      leftRounds: left,
      rightRounds: right,
      finalMatch: final,
      centerRoundLabel: finalLabel,
    };
  }, [sortedRounds]);

  // Righe delle card: tabellone pieno → spaziatura classica, con bye → genitori
  // centrati sui figli realmente presenti.
  const singleSideRows = useMemo(() => computeBracketRows(sortedRounds), [sortedRounds]);
  const leftSideRows = useMemo(() => computeBracketRows(leftRounds), [leftRounds]);
  const rightSideRows = useMemo(() => computeBracketRows(rightRounds), [rightRounds]);

  const getRoundRow = (rows: number[][], colIndex: number, matchIndex: number): number =>
    rows[colIndex]?.[matchIndex] ?? matchIndex * 2 + 1;

  const applyTransform = useCallback((zoom: number, ox: number, oy: number) => {
    if (gridRef.current) {
      gridRef.current.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    }
    if (scaleRef.current) {
      scaleRef.current.style.transform = `scale(${zoom})`;
    }
  }, []);

  const scheduleZoomStateSync = useCallback((nextZoom: number) => {
    if (rafZoomUpdateRef.current !== null) return;
    rafZoomUpdateRef.current = requestAnimationFrame(() => {
      rafZoomUpdateRef.current = null;
      setZoomLevel(zoomRef.current);
    });
  }, []);

  const centerGrid = useCallback(() => {
    if (!containerRef.current || !gridRef.current) return;
    const container = containerRef.current;
    const grid = gridRef.current;

    const cWidth = container.clientWidth;
    const gWidth = grid.scrollWidth;

    const ox = Math.max(0, (cWidth - gWidth) / 2);
    const oy = 0;

    offsetRef.current = { x: ox, y: oy };
    lastOffsetRef.current = { x: ox, y: oy };
    applyTransform(zoomRef.current, ox, oy);
  }, [applyTransform]);

  useEffect(() => {
    const timer = setTimeout(() => {
      centerGrid();
    }, 100);
    return () => clearTimeout(timer);
  }, [centerGrid, sortedRounds, isFullscreen]);

  useEffect(() => {
    return () => {
      if (rafZoomUpdateRef.current !== null) {
        cancelAnimationFrame(rafZoomUpdateRef.current);
      }
    };
  }, []);

  // Zoom Controls
  const zoomIn = (step = 0.15) => {
    const next = Math.min(2.5, Math.round((zoomRef.current + step) * 100) / 100);
    zoomRef.current = next;
    setZoomLevel(next);
    applyTransform(next, offsetRef.current.x, offsetRef.current.y);
  };

  const zoomOut = (step = 0.15) => {
    const next = Math.max(0.35, Math.round((zoomRef.current - step) * 100) / 100);
    zoomRef.current = next;
    setZoomLevel(next);
    applyTransform(next, offsetRef.current.x, offsetRef.current.y);
  };

  const resetZoom = () => {
    zoomRef.current = 1;
    setZoomLevel(1);
    offsetRef.current = { x: 0, y: 0 };
    lastOffsetRef.current = { x: 0, y: 0 };
    centerGrid();
  };

  // Wheel Zoom (centrato sul cursore su desktop)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    const prevZoom = zoomRef.current;
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.min(2.5, Math.max(0.35, Math.round((prevZoom + step) * 100) / 100));
    if (nextZoom === prevZoom) return;

    if (container) {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      const nx = offsetRef.current.x + px / nextZoom - px / prevZoom;
      const ny = offsetRef.current.y + py / nextZoom - py / prevZoom;
      offsetRef.current = { x: nx, y: ny };
      lastOffsetRef.current = { x: nx, y: ny };
    }

    zoomRef.current = nextZoom;
    setZoomLevel(nextZoom);
    applyTransform(nextZoom, offsetRef.current.x, offsetRef.current.y);
  };

  // Touch Events nativi (passive: false) per Pinch-to-Zoom fluido su .bracket-scale e Pan su mobile
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getTouchDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const getTouchMidRelCenter = (t1: Touch, t2: Touch) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return {
        x: (t1.clientX + t2.clientX) / 2 - cx,
        y: (t1.clientY + t2.clientY) / 2 - cy,
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('button') || target.closest('.bracket-controls'))) {
        return;
      }

      if (e.touches.length === 2) {
        e.preventDefault();
        isDraggingRef.current = false;
        container.classList.add('is-gesture-active');
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        initialPinchDistanceRef.current = Math.max(10, dist);
        initialZoomLevelRef.current = zoomRef.current;
        initialPinchMidRef.current = getTouchMidRelCenter(e.touches[0], e.touches[1]);
        initialPinchOffsetRef.current = { ...offsetRef.current };
      } else if (e.touches.length === 1) {
        initialPinchDistanceRef.current = null;
        isDraggingRef.current = true;
        hasMovedRef.current = false;
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastOffsetRef.current = { ...offsetRef.current };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistanceRef.current) {
        e.preventDefault();
        const newDist = getTouchDistance(e.touches[0], e.touches[1]);
        const scaleRatio = newDist / initialPinchDistanceRef.current;
        const nextZoom = Math.min(2.5, Math.max(0.35, initialZoomLevelRef.current * scaleRatio));

        const curMid = getTouchMidRelCenter(e.touches[0], e.touches[1]);
        const initMid = initialPinchMidRef.current;
        const initZoom = initialZoomLevelRef.current;

        // Mantiene il punto focale sotto le dita durante il pinch + trascinamento a 2 dita
        const nx = initialPinchOffsetRef.current.x + curMid.x / nextZoom - initMid.x / initZoom;
        const ny = initialPinchOffsetRef.current.y + curMid.y / nextZoom - initMid.y / initZoom;

        zoomRef.current = nextZoom;
        offsetRef.current = { x: nx, y: ny };
        lastOffsetRef.current = { x: nx, y: ny };

        applyTransform(nextZoom, nx, ny);
        scheduleZoomStateSync(nextZoom);
        return;
      }

      if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - dragStartRef.current.x;
        const dy = e.touches[0].clientY - dragStartRef.current.y;

        if (!hasMovedRef.current && Math.hypot(dx, dy) < 5) {
          return;
        }
        hasMovedRef.current = true;
        container.classList.add('is-gesture-active', 'dragging');
        e.preventDefault();

        const currentZoom = zoomRef.current || 1;
        const nx = lastOffsetRef.current.x + dx / currentZoom;
        const ny = lastOffsetRef.current.y + dy / currentZoom;

        offsetRef.current = { x: nx, y: ny };
        applyTransform(currentZoom, nx, ny);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistanceRef.current = null;
        setZoomLevel(zoomRef.current);
      }

      if (e.touches.length === 1) {
        // Transizione fluida da 2 dita a 1 dito senza salti di posizione
        isDraggingRef.current = true;
        hasMovedRef.current = true;
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastOffsetRef.current = { ...offsetRef.current };
      } else if (e.touches.length === 0) {
        isDraggingRef.current = false;
        container.classList.remove('is-gesture-active', 'dragging');
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyTransform, scheduleZoomStateSync]);

  // Pointer Events per Drag & Pan con mouse su Desktop (i touch sono gestiti dai listener nativi)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.bracket-controls') || target.closest('.bracket-player')) return;

    if (!containerRef.current) return;
    activePointerIdRef.current = e.pointerId;
    containerRef.current.setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    lastOffsetRef.current = { ...offsetRef.current };

    containerRef.current.classList.add('dragging', 'is-gesture-active');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isDraggingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    const currentZoom = zoomRef.current || 1;
    const dx = (e.clientX - dragStartRef.current.x) / currentZoom;
    const dy = (e.clientY - dragStartRef.current.y) / currentZoom;

    const nx = lastOffsetRef.current.x + dx;
    const ny = lastOffsetRef.current.y + dy;

    offsetRef.current = { x: nx, y: ny };
    applyTransform(currentZoom, nx, ny);
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.pointerType === 'touch') return;

    isDraggingRef.current = false;
    if (containerRef.current) {
      containerRef.current.classList.remove('dragging', 'is-gesture-active');
      if (e && activePointerIdRef.current !== null && e.pointerId === activePointerIdRef.current) {
        try {
          containerRef.current.releasePointerCapture(activePointerIdRef.current);
        } catch {}
      }
    }
    activePointerIdRef.current = null;
  };
  const [linePaths, setLinePaths] = useState<Array<{ id: string; d: string; isActive: boolean }>>([]);

  const getRightGridColumn = (colIndexFromZero: number, totalCols: number): number => {
    return totalCols - colIndexFromZero;
  };

  // Helper per calcolare il path SVG tra due match card con curve smussate
  const createConnectorPath = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    flowDirection: 'ltr' | 'rtl'
  ): string => {
    if (Math.abs(y1 - y2) < 2) {
      return `M ${x1} ${y1} H ${x2}`;
    }

    const xMid = (x1 + x2) / 2;
    const radius = 8;

    if (flowDirection === 'ltr') {
      const actualR = Math.min(radius, Math.max(0, Math.abs(x2 - x1) / 2), Math.abs(y2 - y1) / 2);
      if (actualR <= 1) {
        return `M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`;
      }

      if (y2 > y1) {
        return `M ${x1} ${y1} L ${xMid - actualR} ${y1} Q ${xMid} ${y1} ${xMid} ${y1 + actualR} L ${xMid} ${y2 - actualR} Q ${xMid} ${y2} ${xMid + actualR} ${y2} L ${x2} ${y2}`;
      } else {
        return `M ${x1} ${y1} L ${xMid - actualR} ${y1} Q ${xMid} ${y1} ${xMid} ${y1 - actualR} L ${xMid} ${y2 + actualR} Q ${xMid} ${y2} ${xMid + actualR} ${y2} L ${x2} ${y2}`;
      }
    } else {
      // Flowing right to left (x1 > x2)
      const actualR = Math.min(radius, Math.max(0, Math.abs(x1 - x2) / 2), Math.abs(y2 - y1) / 2);
      if (actualR <= 1) {
        return `M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`;
      }

      if (y2 > y1) {
        return `M ${x1} ${y1} L ${xMid + actualR} ${y1} Q ${xMid} ${y1} ${xMid} ${y1 + actualR} L ${xMid} ${y2 - actualR} Q ${xMid} ${y2} ${xMid - actualR} ${y2} L ${x2} ${y2}`;
      } else {
        return `M ${x1} ${y1} L ${xMid + actualR} ${y1} Q ${xMid} ${y1} ${xMid} ${y1 - actualR} L ${xMid} ${y2 + actualR} Q ${xMid} ${y2} ${xMid - actualR} ${y2} L ${x2} ${y2}`;
      }
    }
  };

  // Calcolo dinamico di tutte le linee di collegamento
  const updateLines = useCallback(() => {
    if (!gridRef.current) return;
    const grid = gridRef.current;
    const gridRect = grid.getBoundingClientRect();
    if (gridRect.width === 0 || gridRect.height === 0) return;

    const currentZoom = zoomRef.current || 1;

    const getBox = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        left: (r.left - gridRect.left) / currentZoom,
        top: (r.top - gridRect.top) / currentZoom,
        width: r.width / currentZoom,
        height: r.height / currentZoom,
      };
    };

    const newLines: Array<{ id: string; d: string; isActive: boolean }> = [];

    if (isTwoSides) {
      // 1. Linee Lato Sinistro
      for (let col = 0; col < leftRounds.length; col++) {
        const isLastCol = col === leftRounds.length - 1;
        const currentRound = leftRounds[col];
        const nextRound = !isLastCol ? leftRounds[col + 1] : null;

        currentRound.matches.forEach((m, matchIdx) => {
          const srcEl = grid.querySelector(`[data-bracket-id="L-${col}-${matchIdx}"]`) as HTMLElement | null;
          if (!srcEl) return;

          const winnerName = getMatchWinnerName(m);

          let dstEl: HTMLElement | null = null;
          let dstMatch: TorneoMatchItem | null = null;

          if (isLastCol) {
            dstEl = grid.querySelector('[data-bracket-id="FINAL"]') as HTMLElement | null;
            dstMatch = finalMatch;
          } else if (nextRound) {
            // Con i bye il match successivo non è sempre floor(idx / 2):
            // seguiamo il vincitore per trovare la card corretta.
            const targetIdx = findNextRoundMatchIndex(nextRound, winnerName, Math.floor(matchIdx / 2));
            dstEl = grid.querySelector(`[data-bracket-id="L-${col + 1}-${targetIdx}"]`) as HTMLElement | null;
            dstMatch = nextRound.matches[targetIdx] || null;
          }

          if (srcEl && dstEl) {
            const srcBox = getBox(srcEl);
            const dstBox = getBox(dstEl);

            const x1 = srcBox.left + srcBox.width;
            const y1 = srcBox.top + srcBox.height / 2;
            const x2 = dstBox.left;
            const y2 = dstBox.top + dstBox.height / 2;

            const d = createConnectorPath(x1, y1, x2, y2, 'ltr');

            const isActive = !!(
              winnerName &&
              dstMatch &&
              (dstMatch.atleta1 === winnerName || dstMatch.atleta2 === winnerName)
            );

            newLines.push({
              id: `L-${col}-${matchIdx}->${isLastCol ? 'FINAL' : `${col + 1}-${Math.floor(matchIdx / 2)}`}`,
              d,
              isActive,
            });
          }
        });
      }

      // 2. Linee Lato Destro
      for (let col = 0; col < rightRounds.length; col++) {
        const isLastCol = col === rightRounds.length - 1;
        const currentRound = rightRounds[col];
        const nextRound = !isLastCol ? rightRounds[col + 1] : null;

        currentRound.matches.forEach((m, matchIdx) => {
          const srcEl = grid.querySelector(`[data-bracket-id="R-${col}-${matchIdx}"]`) as HTMLElement | null;
          if (!srcEl) return;

          const winnerName = getMatchWinnerName(m);

          let dstEl: HTMLElement | null = null;
          let dstMatch: TorneoMatchItem | null = null;

          if (isLastCol) {
            dstEl = grid.querySelector('[data-bracket-id="FINAL"]') as HTMLElement | null;
            dstMatch = finalMatch;
          } else if (nextRound) {
            // Indice teorico del padre calcolato sull'intero turno (non sulla metà):
            // con un numero dispari di incontri a sinistra il semplice floor locale
            // sposterebbe il collegamento di una card.
            const leftCountCurrent = leftRounds[col]?.matches.length || 0;
            const leftCountNext = leftRounds[col + 1]?.matches.length || 0;
            const fallbackGlobal = Math.floor((leftCountCurrent + matchIdx) / 2);
            const fallbackLocal = Math.max(
              0,
              Math.min(fallbackGlobal - leftCountNext, nextRound.matches.length - 1)
            );
            const targetIdx = findNextRoundMatchIndex(nextRound, winnerName, fallbackLocal);
            dstEl = grid.querySelector(`[data-bracket-id="R-${col + 1}-${targetIdx}"]`) as HTMLElement | null;
            dstMatch = nextRound.matches[targetIdx] || null;
          }

          if (srcEl && dstEl) {
            const srcBox = getBox(srcEl);
            const dstBox = getBox(dstEl);

            const x1 = srcBox.left;
            const y1 = srcBox.top + srcBox.height / 2;
            const x2 = dstBox.left + dstBox.width;
            const y2 = dstBox.top + dstBox.height / 2;

            const d = createConnectorPath(x1, y1, x2, y2, 'rtl');

            const isActive = !!(
              winnerName &&
              dstMatch &&
              (dstMatch.atleta1 === winnerName || dstMatch.atleta2 === winnerName)
            );

            newLines.push({
              id: `R-${col}-${matchIdx}->${isLastCol ? 'FINAL' : `${col + 1}-${Math.floor(matchIdx / 2)}`}`,
              d,
              isActive,
            });
          }
        });
      }
    } else {
      // 3. Linee Lato Singolo
      for (let col = 0; col < sortedRounds.length - 1; col++) {
        const currentRound = sortedRounds[col];
        const nextRound = sortedRounds[col + 1];

        currentRound.matches.forEach((m, matchIdx) => {
          const srcEl = grid.querySelector(`[data-bracket-id="S-${col}-${matchIdx}"]`) as HTMLElement | null;
          if (!srcEl) return;

          const winnerName = getMatchWinnerName(m);
          const targetIdx = findNextRoundMatchIndex(nextRound, winnerName, Math.floor(matchIdx / 2));
          const dstEl = grid.querySelector(`[data-bracket-id="S-${col + 1}-${targetIdx}"]`) as HTMLElement | null;
          const dstMatch = nextRound.matches[targetIdx] || null;

          if (srcEl && dstEl) {
            const srcBox = getBox(srcEl);
            const dstBox = getBox(dstEl);

            const x1 = srcBox.left + srcBox.width;
            const y1 = srcBox.top + srcBox.height / 2;
            const x2 = dstBox.left;
            const y2 = dstBox.top + dstBox.height / 2;

            const d = createConnectorPath(x1, y1, x2, y2, 'ltr');

            const isActive = !!(
              winnerName &&
              dstMatch &&
              (dstMatch.atleta1 === winnerName || dstMatch.atleta2 === winnerName)
            );

            newLines.push({
              id: `S-${col}-${matchIdx}->${col + 1}-${targetIdx}`,
              d,
              isActive,
            });
          }
        });
      }
    }

    setLinePaths(newLines);
  }, [isTwoSides, leftRounds, rightRounds, finalMatch, sortedRounds]);

  // Osserva layout e resize per aggiornare le linee
  useEffect(() => {
    let animId = requestAnimationFrame(() => {
      updateLines();
    });

    const timer = setTimeout(() => {
      updateLines();
    }, 60);

    const handleResize = () => updateLines();
    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (gridRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateLines();
      });
      ro.observe(gridRef.current);
    }

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, [updateLines, sortedRounds, isTwoSides]);

  const renderMatchCard = (
    match: TorneoMatchItem,
    roundLabel: string,
    isRightSide = false,
    bracketId?: string
  ) => {
    const p1Winner = match.vincitore === 1;
    const p2Winner = match.vincitore === 2;

    return (
      <div className="bracket-match" data-bracket-id={bracketId}>
        <div className="bracket-round-label">
          <span>{roundLabel}</span>
          {match.sets && match.sets.length > 0 && (
            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
              {match.sets.length} set
            </span>
          )}
        </div>

        {/* Player 1 Slot */}
        <div
          className={`bracket-player ${p1Winner ? 'is-winner' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (match.atleta1Id || match.atleta1) {
              onOpenAtletaModal(match.atleta1Id || match.atleta1, match.atleta1);
            }
          }}
          title={match.societa1 ? `${match.atleta1} (${match.societa1})` : match.atleta1}
        >
          <AthleteAvatar
            atletaId={match.atleta1Id || undefined}
            nome={match.atleta1 || ''}
            size={22}
          />
          <span className="bracket-player-name">{match.atleta1 || 'Bye / —'}</span>
          <span className="bracket-player-score">{match.set1}</span>
        </div>

        {/* Player 2 Slot */}
        <div
          className={`bracket-player ${p2Winner ? 'is-winner' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (match.atleta2Id || match.atleta2) {
              onOpenAtletaModal(match.atleta2Id || match.atleta2, match.atleta2);
            }
          }}
          title={match.societa2 ? `${match.atleta2} (${match.societa2})` : match.atleta2}
        >
          <AthleteAvatar
            atletaId={match.atleta2Id || undefined}
            nome={match.atleta2 || ''}
            size={22}
          />
          <span className="bracket-player-name">{match.atleta2 || 'Bye / —'}</span>
          <span className="bracket-player-score">{match.set2}</span>
        </div>

        {/* Partial sets display */}
        {match.sets && match.sets.length > 0 && (
          <div className="bracket-sets-strip">
            {match.sets.map((s, si) => (
              <span key={si}>
                {s.p1}-{s.p2}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (sortedRounds.length === 0) {
    return (
      <div className="bracket-container">
        <div className="bracket-empty-state">
          <i className="bi bi-diagram-3-fill"></i>
          <h3>Tabellone non disponibile</h3>
          <p>Non ci sono ancora turni registrati per questa eliminazione diretta.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bracket-container ${isFullscreen ? 'is-modal-fullscreen' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Top Header info */}
      <div className="bracket-header-info">
        <h3 className="bracket-title">
          <i className="bi bi-diagram-3-fill me-2 text-warning"></i>
          {competitionName}
        </h3>
        <div className="bracket-subtitle">
          {sortedRounds.length} turni disputati • Trascina per scorrere • Rotella o pinch per zoom
        </div>
      </div>

      {/* Floating Zoom / Fullscreen Controls */}
      <div className="bracket-controls">
        <button type="button" onClick={() => zoomOut()} title="Rimpicciolisci (−)">
          −
        </button>
        <span className="zoom-indicator">{zoomLevel.toFixed(1)}x</span>
        <button type="button" onClick={() => zoomIn()} title="Ingrandisci (+)">
          +
        </button>
        <button type="button" onClick={resetZoom} title="Centra / Reset Zoom">
          <i className="bi bi-arrows-angle-contract" style={{ fontSize: '11px' }}></i>
        </button>
        <button
          type="button"
          className="bracket-fullscreen-btn"
          onClick={() => {
            const next = !isFullscreen;
            if (!next && onCloseFullscreen) {
              onCloseFullscreen();
            }
            setIsFullscreen(next);
            if (onToggleFullscreen) {
              onToggleFullscreen(next);
            }
            window.dispatchEvent(
              new CustomEvent('tornei-modal-fullscreen', {
                detail: { isFullscreen: next },
              })
            );
          }}
          title={isFullscreen ? 'Riduci a finestra' : 'Espandi a schermo intero'}
        >
          <i className={`bi ${isFullscreen ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`} style={{ fontSize: '11px' }}></i>
        </button>
      </div>

      {/* Scale Layer */}
      <div ref={scaleRef} className="bracket-scale">
        {/* Translation Layer */}
        <div ref={gridRef} className="bracket-grid-wrapper">
          {/* SVG Line Layer */}
          <svg className="bracket-svg-layer" aria-hidden="true">
            {linePaths.map((line) => (
              <path
                key={line.id}
                d={line.d}
                className={`bracket-line-path ${line.isActive ? 'is-active' : ''}`}
              />
            ))}
          </svg>

          {isTwoSides ? (
            /* Layout a Due Lati */
            <div className="two-sides">
              {/* LATO SINISTRO */}
              <div className="side left">
                <div className="bracket-grid">
                  {leftRounds.map((round, colIndex) =>
                    round.matches.map((match, matchIndex) => (
                      <div
                        key={`left-${colIndex}-${matchIndex}`}
                        style={{
                          gridColumn: colIndex + 1,
                          gridRow: getRoundRow(leftSideRows, colIndex, matchIndex),
                          position: 'relative',
                        }}
                      >
                        {renderMatchCard(
                          match,
                          round.roundLabel || `Turno ${colIndex + 1}`,
                          false,
                          `L-${colIndex}-${matchIndex}`
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* GAP CENTRALE: MATCH DELLA FINALE */}
              <div className="center-gap">
                {finalMatch && (
                  <div className="final-wrap">
                    <i className="bi bi-trophy-fill final-crown"></i>
                    {renderMatchCard(finalMatch, centerRoundLabel, false, 'FINAL')}
                  </div>
                )}
              </div>

              {/* LATO DESTRO */}
              <div className="side right">
                <div className="bracket-grid">
                  {rightRounds.map((round, colIndex) =>
                    round.matches.map((match, matchIndex) => (
                      <div
                        key={`right-${colIndex}-${matchIndex}`}
                        style={{
                          gridColumn: getRightGridColumn(colIndex, rightRounds.length),
                          gridRow: getRoundRow(rightSideRows, colIndex, matchIndex),
                          position: 'relative',
                        }}
                      >
                        {renderMatchCard(
                          match,
                          round.roundLabel || `Turno ${colIndex + 1}`,
                          true,
                          `R-${colIndex}-${matchIndex}`
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Layout Classico a Lato Singolo */
            <div className="single-side-grid">
              {sortedRounds.map((round, colIndex) =>
                round.matches.map((match, matchIndex) => (
                  <div
                    key={`single-${colIndex}-${matchIndex}`}
                    style={{
                      gridColumn: colIndex + 1,
                      gridRow: getRoundRow(singleSideRows, colIndex, matchIndex),
                      position: 'relative',
                    }}
                  >
                    {renderMatchCard(
                      match,
                      round.roundLabel || `Turno ${colIndex + 1}`,
                      false,
                      `S-${colIndex}-${matchIndex}`
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
