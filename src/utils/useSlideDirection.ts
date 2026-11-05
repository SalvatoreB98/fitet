import { useState } from 'react';

export type SlideDirection = 'slide-from-right-1' | 'slide-from-right-2' | 'slide-from-left-1' | 'slide-from-left-2' | '';

/**
 * Hook che restituisce la classe di animazione direzionale al cambio di vista.
 * Utilizza il pattern React "storing state from previous renders".
 * Alterna tra versione 1 e 2 per forzare il ricalcolo dell'animazione CSS
 * anche in caso di cambi consecutivi nella stessa direzione.
 */
export function useSlideDirection<T>(value: T, order: readonly T[]): string {
  const [state, setState] = useState<{
    prev: T;
    anim: SlideDirection;
    toggle: boolean;
  }>({
    prev: value,
    anim: '',
    toggle: false,
  });

  if (state.prev !== value) {
    const prevIdx = order.indexOf(state.prev);
    const currIdx = order.indexOf(value);

    let nextAnim: SlideDirection = '';
    const nextToggle = !state.toggle;

    if (prevIdx !== -1 && currIdx !== -1 && prevIdx !== currIdx) {
      const isRight = currIdx > prevIdx;
      const suffix = nextToggle ? '1' : '2';
      nextAnim = isRight ? `slide-from-right-${suffix}` : `slide-from-left-${suffix}`;
    }

    setState({
      prev: value,
      anim: nextAnim,
      toggle: nextToggle,
    });

    return nextAnim;
  }

  return state.anim;
}
