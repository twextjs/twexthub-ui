import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Enabled dialogs in the order they opened, so the last entry is the one on
 * top. Every dialog listens on `document` in the capture phase, and siblings on
 * the same target all run even once one calls `stopPropagation`, so without this
 * a single Escape would dismiss a confirm dialog and the panel beneath it.
 */
const openDialogs: symbol[] = [];

interface UseModalDialogOptions {
  /** id of the element (usually the h2) naming the dialog. */
  labelledById?: string;
  /** Accessible name for dialogs without a labelling element. */
  ariaLabel?: string;
  /** Optional Escape handler; omit if the modal manages Escape itself. */
  onClose?: () => void;
  /**
   * Whether the dialog is currently shown. Focus capture, trapping, Escape,
   * and focus restoration run only while enabled. Defaults to true for modals
   * that mount only while open; pass the open flag for persistent components.
   */
  enabled?: boolean;
  /**
   * Element to focus on open. Defaults to the first focusable child, which is
   * usually the close button rather than what the dialog is actually for.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Wires up modal dialog semantics: dialog role, accessible name, initial
 * focus, Tab trapping, Escape handling, and focus restoration to the trigger
 * that opened it.
 */
export function useModalDialog<T extends HTMLElement>({
  labelledById,
  ariaLabel,
  onClose,
  enabled = true,
  initialFocusRef,
}: UseModalDialogOptions) {
  const dialogRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // The stack effect re-registers only when `enabled` changes, so the handler
  // reads the current `onClose` through a ref instead of closing over the one
  // from the render that turned the dialog on. An inline arrow is a new
  // function every render, and depending on it directly would push the token
  // back onto the end of `openDialogs` each time, promoting a lower dialog
  // above one that opened after it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (initialFocusRef?.current ?? firstFocusable ?? dialog).focus();
    }
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [enabled, initialFocusRef]);

  useEffect(() => {
    if (!enabled) return;
    const token = Symbol();
    openDialogs.push(token);
    const isTopmost = () => openDialogs.at(-1) === token;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const at = openDialogs.indexOf(token);
      if (at !== -1) openDialogs.splice(at, 1);
    };
  }, [enabled]);

  const dialogProps = {
    role: 'dialog' as const,
    'aria-modal': true,
    ...(labelledById
      ? { 'aria-labelledby': labelledById }
      : ariaLabel
        ? { 'aria-label': ariaLabel }
        : {}),
    ref: dialogRef,
    tabIndex: -1,
  };

  return { dialogProps };
}

export type ModalDialogProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement | null>;
};
