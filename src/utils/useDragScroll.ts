import React, { useEffect, useRef, useState } from 'react';

/**
 * Enables smooth desktop mouse drag-to-scroll (like mobile touch scrolling,
 * without snap jumps) on any horizontally scrollable container.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  });
  const momentumRafRef = useRef<number | null>(null);
  const suppressBackdropUntilRef = useRef<number>(0);

  useEffect(() => {
    const cancelMomentum = () => {
      if (momentumRafRef.current !== null) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
    };

    const handleWindowMouseMove = (e: MouseEvent) => {
      const state = dragRef.current;
      const el = ref.current;
      if (!state.isDown || !el) return;

      const now = performance.now();
      const dxTotal = e.pageX - state.startX;
      if (Math.abs(dxTotal) > 5) {
        state.moved = true;
      }

      const dt = now - state.lastTime;
      if (dt > 0) {
        const instantVel = (e.pageX - state.lastX) / dt;
        state.velocity = state.velocity * 0.65 + instantVel * 0.35;
      }
      state.lastX = e.pageX;
      state.lastTime = now;

      el.scrollLeft = state.scrollLeft - dxTotal;
    };

    const handleWindowMouseUp = () => {
      const state = dragRef.current;
      const el = ref.current;
      if (!state.isDown) return;
      state.isDown = false;
      setIsDragging(false);
      suppressBackdropUntilRef.current = Date.now() + 200;

      if (!el || !state.moved) return;

      // Gentle inertial glide like native mobile scroll (no snap jumps)
      let velocity = state.velocity * 16; // px per ~16ms frame
      if (Math.abs(velocity) < 0.8) return;

      cancelMomentum();
      const step = () => {
        if (!ref.current) return;
        ref.current.scrollLeft -= velocity;
        velocity *= 0.92;
        if (Math.abs(velocity) >= 0.4) {
          momentumRafRef.current = requestAnimationFrame(step);
        } else {
          momentumRafRef.current = null;
        }
      };
      momentumRafRef.current = requestAnimationFrame(step);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      cancelMomentum();
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent<T>) => {
    if (e.button !== 0 || !ref.current) return;
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    dragRef.current = {
      isDown: true,
      startX: e.pageX,
      scrollLeft: ref.current.scrollLeft,
      moved: false,
      lastX: e.pageX,
      lastTime: performance.now(),
      velocity: 0,
    };
    setIsDragging(true);
  };

  const onClickCapture = (e: React.MouseEvent<T>) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  const onDragStart = (e: React.DragEvent<T>) => {
    e.preventDefault();
  };

  return {
    ref,
    isDragging,
    wasDraggingRecently: () => Date.now() < suppressBackdropUntilRef.current,
    dragProps: {
      onMouseDown,
      onClickCapture,
      onDragStart,
    },
  };
}
