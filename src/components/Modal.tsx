import { useModalDialog } from '../hooks/useModalDialog';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

/** Widths match the max-w-* values the modals used before they shared a shell. */
const SIZES = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-6xl',
} as const;

export type ModalSize = keyof typeof SIZES;

interface ModalProps {
  children: React.ReactNode;
  /** Omit to make the dialog non-dismissable: no Escape, no backdrop press. */
  onClose?: () => void;
  /** Full-screen dialogs, such as the Markdown editor, have no backdrop. */
  variant?: 'center' | 'fullscreen';
  size?: ModalSize;
  /** id of the element (usually the heading) naming the dialog. */
  labelledById?: string;
  /** Accessible name for dialogs without a labelling element. */
  ariaLabel?: string;
  /** Extra classes on the panel, for width and layout a size cannot cover. */
  className?: string;
  /** Overrides the default "first focusable element" focus target. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Modals that stack on top of another modal need to outrank it. */
  zIndex?: number;
  /** Whether the dialog is shown. Persistent components pass their open flag. */
  open?: boolean;
}

/**
 * Shared dialog shell: backdrop, panel, accessible name, focus trap, Escape,
 * focus restoration, entrance animation, and page scroll lock.
 *
 * The panel is the scroll container. The page behind it is locked, and
 * `overscroll-behavior` on the panel stops a gesture that runs past the end of
 * the content from continuing into the document.
 */
export function Modal({
  children,
  onClose,
  variant = 'center',
  size = 'md',
  labelledById,
  ariaLabel,
  className = '',
  initialFocusRef,
  zIndex = 50,
  open = true,
}: ModalProps) {
  const { dialogProps } = useModalDialog<HTMLDivElement>({
    labelledById,
    ariaLabel,
    onClose,
    enabled: open,
    initialFocusRef,
  });
  useBodyScrollLock(open);

  if (!open) return null;

  if (variant === 'fullscreen') {
    return (
      <div {...dialogProps} className={`modal-panel-fullscreen ${className}`} style={{ zIndex }}>
        {children}
      </div>
    );
  }

  return (
    <div
      role="presentation"
      className="modal-overlay"
      style={{ zIndex }}
      onMouseDown={(e) => {
        // Only a press that starts on the backdrop itself dismisses, so a
        // drag that starts inside the panel and ends on the backdrop does not.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div {...dialogProps} className={`modal-panel ${SIZES[size]} ${className}`}>
        {children}
      </div>
    </div>
  );
}
