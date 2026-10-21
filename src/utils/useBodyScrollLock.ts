import { useEffect } from 'react';

let activeModalCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

/**
 * Custom hook that locks document.body and html scrolling when a modal is mounted.
 * Supports nested/sequential modals via reference counting, ensuring the body
 * is only unlocked when the last active modal is closed.
 */
export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (activeModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
    activeModalCount++;

    return () => {
      activeModalCount--;
      if (activeModalCount <= 0) {
        activeModalCount = 0;
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
      }
    };
  }, [isLocked]);
}
