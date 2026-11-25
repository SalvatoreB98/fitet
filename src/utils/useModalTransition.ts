import { useCallback, useEffect, useRef, useState } from 'react';

export const MODAL_CLOSE_DURATION_MS = 180;

export function useModalTransition(
  onClose: () => void,
  isOpen = true,
  durationMs = MODAL_CLOSE_DURATION_MS
) {
  const [shouldRender, setShouldRender] = useState<boolean>(isOpen);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef<boolean>(false);
  const onCloseRef = useRef<() => void>(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isClosingRef.current = false;
      setIsClosing(false);
      setShouldRender(true);
    } else if (shouldRender && !isClosingRef.current) {
      isClosingRef.current = true;
      setIsClosing(true);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        isClosingRef.current = false;
        setIsClosing(false);
        setShouldRender(false);
      }, durationMs);
    }
  }, [isOpen, shouldRender, durationMs]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      isClosingRef.current = false;
      setIsClosing(false);
      setShouldRender(false);
      onCloseRef.current();
    }, durationMs);
  }, [durationMs]);

  return {
    shouldRender,
    isClosing,
    requestClose,
  };
}
