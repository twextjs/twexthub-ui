import { useEffect } from 'react';

type MaybeRef = React.RefObject<HTMLElement | null> | null | undefined;

/**
 * Calls `onDismiss` on Escape or a pointer press that lands outside `ref`.
 *
 * `alsoInside` covers elements that sit next to the popover rather than inside
 * it -- a menu trigger, for example. Without it, pressing the trigger would both
 * dismiss and toggle, leaving the popover open when the user asked to close it.
 *
 * The listener is registered in the capture phase and attached to `pointerdown`
 * rather than `click`, so dismissal does not wait for a full press-release cycle
 * and cannot leave the handler running against a tree that is being torn down.
 */
export function useDismissable(
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
  alsoInside?: MaybeRef,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (alsoInside?.current?.contains(target)) return;
      onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [ref, alsoInside, onDismiss, enabled]);
}
