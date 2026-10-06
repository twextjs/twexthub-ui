import { useEffect } from 'react';

/**
 * Modals nest: a confirm dialog can open on top of the panel that asked for
 * it, and the command palette can sit above both. Counting locks means the
 * page stays put until the last one closes, and the page is only restored to
 * the styles it had before the first one opened.
 */
let lockCount = 0;
let release: (() => void) | null = null;

function acquire() {
  if (lockCount === 0) {
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    // Measure the scrollbar before hiding it. Removing it narrows the
    // viewport by its own width, which shifts the page sideways.
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }

    release = () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }
  lockCount += 1;
}

function free() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    release?.();
    release = null;
  }
}

/**
 * Stops the page behind a modal from scrolling while leaving the modal itself
 * free to scroll. The panel carries `overscroll-behavior: contain`, so a
 * scroll gesture that runs out of content in the modal does not chain onward
 * to the document.
 */
export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    acquire();
    return free;
  }, [enabled]);
}
