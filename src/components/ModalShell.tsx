import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

/* ==========================================================================
   MODAL LAYER MANAGER
   Keeps track of every open modal so that:
   - z-index is always assigned by stack depth (no more modals under others)
   - only the top-most modal reacts to ESC
   - only the top-most modal traps keyboard focus
   ========================================================================== */

type ModalLayerEntry = {
  id: symbol;
  close: () => void;
};

const modalLayers: ModalLayerEntry[] = [];
const layerListeners = new Set<() => void>();
let layerVersion = 0;

function emitLayerChange() {
  layerVersion += 1;
  layerListeners.forEach((listener) => listener());
}

function subscribeLayers(listener: () => void) {
  layerListeners.add(listener);
  return () => {
    layerListeners.delete(listener);
  };
}

function getLayerVersion() {
  return layerVersion;
}

const MODAL_Z_BASE = 1050;
const MODAL_Z_STEP = 20;

export function useModalLayer(onClose: () => void, enabled = true) {
  const layerIdRef = useRef<symbol>();
  if (!layerIdRef.current) layerIdRef.current = Symbol('fitet-modal');

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useSyncExternalStore(subscribeLayers, getLayerVersion, getLayerVersion);

  const index = modalLayers.findIndex((layer) => layer.id === layerIdRef.current);
  const depth = index >= 0 ? index : modalLayers.length;
  const isTop = index === modalLayers.length - 1;

  useEffect(() => {
    if (!enabled) return;

    const entry: ModalLayerEntry = {
      id: layerIdRef.current as symbol,
      close: () => closeRef.current(),
    };
    modalLayers.push(entry);
    emitLayerChange();

    return () => {
      const currentIndex = modalLayers.indexOf(entry);
      if (currentIndex !== -1) {
        modalLayers.splice(currentIndex, 1);
        emitLayerChange();
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modalLayers[modalLayers.length - 1]?.id !== layerIdRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);

  return {
    isTop,
    depth,
    zIndex: MODAL_Z_BASE + depth * MODAL_Z_STEP,
  };
}

/* ==========================================================================
   MODAL CLOSE BUTTON
   Single, consistent "X" used by every modal in the app.
   ========================================================================== */

export interface ModalCloseButtonProps {
  onClick: () => void;
  label?: string;
  title?: string;
  className?: string;
}

export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({
  onClick,
  label = 'Chiudi finestra',
  title = 'Chiudi finestra (ESC)',
  className = '',
}) => (
  <button
    type="button"
    className={`modal-close-btn${className ? ` ${className}` : ''}`}
    onClick={onClick}
    title={title}
    aria-label={label}
  >
    <i className="bi bi-x-lg" aria-hidden="true" />
  </button>
);

/* ==========================================================================
   MODAL HEADER
   Shared layout for modal headers. The content (icon, title, actions) can
   still differ per modal, but spacing, typography and close button are
   identical everywhere.
   ========================================================================== */

export interface ModalHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleId?: string;
  icon?: React.ReactNode;
  iconVariant?: 'default' | 'amber' | 'white' | 'none';
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  className?: string;
  closeLabel?: string;
  closeTitle?: string;
  showCloseButton?: boolean;
  titleAs?: 'h2' | 'h3';
  titleClassName?: string;
  onBack?: () => void;
  backLabel?: string;
  backTitle?: string;
}

export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(
  (
    {
      title,
      subtitle,
      titleId,
      icon,
      iconVariant = 'default',
      leading,
      actions,
      onClose,
      className = '',
      closeLabel,
      closeTitle,
      showCloseButton = true,
      titleAs = 'h3',
      titleClassName = 'modal-header-title-serif',
      onBack,
      backLabel = 'Indietro',
      backTitle = 'Torna indietro',
    },
    ref
  ) => {
    const TitleTag = titleAs;

    return (
      <div ref={ref} className={`modal-header-simple${className ? ` ${className}` : ''}`}>
        <div className="modal-header-main">
          {onBack && (
            <button
              type="button"
              className="modal-back-btn"
              onClick={onBack}
              title={backTitle}
              aria-label={backLabel}
            >
              <i className="bi bi-arrow-left" aria-hidden="true" />
            </button>
          )}
          {leading ??
            (icon && iconVariant !== 'none' ? (
              <div
                className={`modal-header-icon-box${
                  iconVariant === 'amber'
                    ? ' is-amber'
                    : iconVariant === 'white'
                      ? ' is-white'
                      : ''
                }`}
                aria-hidden="true"
              >
                {icon}
              </div>
            ) : null)}
          <div className="modal-header-text">
            <TitleTag id={titleId} className={titleClassName}>
              {title}
            </TitleTag>
            {subtitle ? <div className="modal-header-subtext">{subtitle}</div> : null}
          </div>
        </div>

        <div className="modal-header-actions">
          {actions}
          {showCloseButton ? (
            <ModalCloseButton onClick={onClose} label={closeLabel} title={closeTitle} />
          ) : null}
        </div>
      </div>
    );
  }
);

ModalHeader.displayName = 'ModalHeader';

/* ==========================================================================
   MODAL SHELL
   Portal + unified backdrop + unified card + layer management.
   ========================================================================== */

export interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Extra classes applied to the modal card. */
  className?: string;
  /** Extra classes applied to the backdrop. */
  backdropClassName?: string;
  /** Extra inline styles applied to the modal card. */
  style?: React.CSSProperties;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  cardRef?: React.RefObject<HTMLDivElement>;
  onCardScroll?: React.UIEventHandler<HTMLDivElement>;
  /** Disable the automatic focus management (rarely needed). */
  disableAutoFocus?: boolean;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  onClose,
  children,
  className = '',
  backdropClassName = '',
  style,
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  cardRef,
  onCardScroll,
  disableAutoFocus = false,
}) => {
  useBodyScrollLock(true);

  const internalCardRef = useRef<HTMLDivElement>(null);
  const resolvedCardRef = cardRef ?? internalCardRef;
  const backdropMouseDownTargetRef = useRef<EventTarget | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const { isTop, zIndex } = useModalLayer(onClose, closeOnEscape);

  // Focus the modal on open and restore the previous focus on close.
  useEffect(() => {
    if (disableAutoFocus) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      const card = resolvedCardRef.current;
      if (!card) return;
      const autofocusTarget = card.querySelector<HTMLElement>('[data-autofocus="true"]');
      (autofocusTarget ?? card).focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const previous = previouslyFocusedRef.current;
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [disableAutoFocus, resolvedCardRef]);

  // Trap focus inside the top-most modal.
  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Tab' || !isTop) return;

      const card = resolvedCardRef.current;
      if (!card) return;

      const focusable = Array.from(
        card.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (focusable.length === 0) {
        event.preventDefault();
        card.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !card.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !card.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [isTop, resolvedCardRef]
  );

  const handleBackdropMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    backdropMouseDownTargetRef.current = event.target;
  }, []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdrop) return;
      if (event.target !== event.currentTarget) return;
      if (backdropMouseDownTargetRef.current !== event.currentTarget) return;
      onClose();
    },
    [closeOnBackdrop, onClose]
  );

  const backdropStyle = useMemo(() => ({ zIndex }), [zIndex]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`modal-backdrop-simple${backdropClassName ? ` ${backdropClassName}` : ''}`}
      style={backdropStyle}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <div
        ref={resolvedCardRef}
        className={`modal-card-simple${className ? ` ${className}` : ''}`}
        style={style}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleCardKeyDown}
        onScroll={onCardScroll}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ModalShell;
