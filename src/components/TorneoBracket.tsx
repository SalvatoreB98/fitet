import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TorneoMatchItem } from '../types/fitet';
import { AthleteAvatar } from './AthleteAvatar';
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
  isModal?: boolean;
}

export const TorneoBracket: React.FC<TorneoBracketProps> = ({
  rounds,
  competitionName = 'Tabellone Eliminazione Diretta',
  onOpenAtletaModal,
  onCloseFullscreen,
  isModal = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(isModal);

  // Drag & Pan State Refs
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const activePointersRef = useRef<Map<number, PointerEvent>>(new Map());
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomLevelRef = useRef<number>(1);

  // Normalizza e ordina i round dal primo turno (più partite) all'ultimo (la finale con 1 partita)
  const sortedRounds = useMemo(() => {
    if (!rounds || rounds.length === 0) return [];
    const valid = rounds.filter((r) => r.matches && r.matches.length > 0);
    // Ordina dal turno con più incontri (es. 16/8 match) a quello con meno (es. finale con 1 match)
    return [...valid].sort((a, b) => b.matches.length - a.matches.length);
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

    const firstMatchesCount = sortedRounds[0].matches.length;
    const twoSides = firstMatchesCount >= 8;

    if (!twoSides) {
      return {
        isTwoSides: false,
        leftRounds: [],
        rightRounds: [],
        finalMatch: null,
        centerRoundLabel: '',
      };
    }

    const left: BracketRoundData[] = [];
    const right: BracketRoundData[] = [];
    let final: TorneoMatchItem | null = null;
    let finalLabel = 'Finale';

    sortedRounds.forEach((r) => {
      const m = r.matches || [];
      if (m.length === 1) {
        final = m[0];
        finalLabel = r.roundLabel || 'Finale';
      } else {
        const half = Math.floor(m.length / 2);
        left.push({ ...r, matches: m.slice(0, half) });
        right.push({ ...r, matches: m.slice(half) });
      }
    });

    return {
      isTwoSides: true,
      leftRounds: left,
      rightRounds: right,
      finalMatch: final,
      centerRoundLabel: finalLabel,
    };
  }, [sortedRounds]);

  const applyTransform = useCallback((zoom: number, ox: number, oy: number) => {
    if (gridRef.current) {
      gridRef.current.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    }
    if (scaleRef.current) {
      scaleRef.current.style.transform = `scale(${zoom})`;
    }
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
    applyTransform(zoomLevel, ox, oy);
  }, [zoomLevel, applyTransform]);

  useEffect(() => {
    const timer = setTimeout(() => {
      centerGrid();
    }, 100);
    return () => clearTimeout(timer);
  }, [centerGrid, sortedRounds]);

  // Zoom Controls
  const zoomIn = (step = 0.15) => {
    setZoomLevel((prev) => {
      const next = Math.min(2.0, Math.round((prev + step) * 100) / 100);
      applyTransform(next, offsetRef.current.x, offsetRef.current.y);
      return next;
    });
  };

  const zoomOut = (step = 0.15) => {
    setZoomLevel((prev) => {
      const next = Math.max(0.4, Math.round((prev - step) * 100) / 100);
      applyTransform(next, offsetRef.current.x, offsetRef.current.y);
      return next;
    });
  };

  const resetZoom = () => {
    setZoomLevel(1);
    offsetRef.current = { x: 0, y: 0 };
    lastOffsetRef.current = { x: 0, y: 0 };
    centerGrid();
  };

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn(0.1);
    } else {
      zoomOut(0.1);
    }
  };

  // Distance helper per pinch
  const getPinchDistance = (p1: PointerEvent, p2: PointerEvent) => {
    return Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
  };

  // Pointer Events per Drag & Pan
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, e.nativeEvent);

    if (activePointersRef.current.size === 2) {
      const [p1, p2] = Array.from(activePointersRef.current.values());
      initialPinchDistanceRef.current = getPinchDistance(p1, p2);
      initialZoomLevelRef.current = zoomLevel;
      isDraggingRef.current = false;
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.bracket-controls')) return;

    if (!containerRef.current) return;
    activePointerIdRef.current = e.pointerId;
    containerRef.current.setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    lastOffsetRef.current = { ...offsetRef.current };

    containerRef.current.classList.add('dragging');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, e.nativeEvent);
    }

    // Gestione pinch
    if (activePointersRef.current.size === 2) {
      const [p1, p2] = Array.from(activePointersRef.current.values());
      const newDistance = getPinchDistance(p1, p2);
      if (initialPinchDistanceRef.current) {
        const scaleChange = newDistance / initialPinchDistanceRef.current;
        const newZoom = Math.min(2.0, Math.max(0.4, initialZoomLevelRef.current * scaleChange));
        setZoomLevel(newZoom);
        applyTransform(newZoom, offsetRef.current.x, offsetRef.current.y);
      }
      return;
    }

    if (!isDraggingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const nx = lastOffsetRef.current.x + dx;
    const ny = lastOffsetRef.current.y + dy;

    offsetRef.current = { x: nx, y: ny };
    if (gridRef.current) {
      gridRef.current.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e) {
      activePointersRef.current.delete(e.pointerId);
    }
    if (activePointersRef.current.size < 2) {
      initialPinchDistanceRef.current = null;
    }

    isDraggingRef.current = false;
    if (containerRef.current) {
      containerRef.current.classList.remove('dragging');
      if (e && activePointerIdRef.current !== null && e.pointerId === activePointerIdRef.current) {
        try {
          containerRef.current.releasePointerCapture(activePointerIdRef.current);
        } catch {}
      }
    }
    activePointerIdRef.current = null;
  };
  const [linePaths, setLinePaths] = useState<Array<{ id: string; d: string; isActive: boolean }>>([]);

  const getGridRow = (colIndex: number, matchIndex: number): number => {
    const spacing = Math.pow(2, colIndex);
    return matchIndex * spacing * 2 + spacing;
  };

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

    const currentZoom = zoomLevel || 1;

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

          let dstEl: HTMLElement | null = null;
          let dstMatch: TorneoMatchItem | null = null;

          if (isLastCol) {
            dstEl = grid.querySelector('[data-bracket-id="FINAL"]') as HTMLElement | null;
            dstMatch = finalMatch;
          } else if (nextRound) {
            const targetIdx = Math.floor(matchIdx / 2);
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

            const winnerName = m.vincitore === 1 ? m.atleta1 : m.vincitore === 2 ? m.atleta2 : null;
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

          let dstEl: HTMLElement | null = null;
          let dstMatch: TorneoMatchItem | null = null;

          if (isLastCol) {
            dstEl = grid.querySelector('[data-bracket-id="FINAL"]') as HTMLElement | null;
            dstMatch = finalMatch;
          } else if (nextRound) {
            const targetIdx = Math.floor(matchIdx / 2);
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

            const winnerName = m.vincitore === 1 ? m.atleta1 : m.vincitore === 2 ? m.atleta2 : null;
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

          const targetIdx = Math.floor(matchIdx / 2);
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

            const winnerName = m.vincitore === 1 ? m.atleta1 : m.vincitore === 2 ? m.atleta2 : null;
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
  }, [isTwoSides, leftRounds, rightRounds, finalMatch, sortedRounds, zoomLevel]);

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
          onClick={() => {
            if (isFullscreen && onCloseFullscreen) {
              onCloseFullscreen();
            }
            setIsFullscreen((prev) => !prev);
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
                          gridRow: getGridRow(colIndex, matchIndex),
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
                          gridRow: getGridRow(colIndex, matchIndex),
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
                      gridRow: getGridRow(colIndex, matchIndex),
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
