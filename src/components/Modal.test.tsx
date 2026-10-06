import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('locks page scrolling while open and restores it on close', () => {
    const { rerender } = render(
      <Modal open ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal open={false} ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the page locked until the last of several nested modals closes', () => {
    const { rerender } = render(
      <>
        <Modal open ariaLabel="Outer">
          <button>Outer</button>
        </Modal>
        <Modal open ariaLabel="Inner">
          <button>Inner</button>
        </Modal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    // A confirm dialog opening on top of a panel must not unlock the page
    // when it closes.
    rerender(
      <>
        <Modal open ariaLabel="Outer">
          <button>Outer</button>
        </Modal>
        <Modal open={false} ariaLabel="Inner">
          <button>Inner</button>
        </Modal>
      </>,
    );

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('leaves the page scrollable when nothing is open', () => {
    render(
      <Modal open={false} ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts the scroll container on the panel, not the page', () => {
    render(
      <Modal open ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('modal-panel');
    expect(panel.parentElement?.className).toContain('modal-overlay');
  });

  /*
   * The scrolling and the entrance animation both live in index.css, which
   * jsdom never applies, so the rules are asserted against the source.
   */
  it('declares the panel as a scroll container and gives it an entrance', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `missing rule for ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };

    const panel = rule('.modal-panel');
    expect(panel).toContain('overflow-y: auto');
    expect(panel).toContain('max-height: 85vh');
    // A gesture that runs past the end of the panel stops there instead of
    // carrying on into the document behind it.
    expect(panel).toContain('overscroll-behavior: contain');
    expect(panel).toMatch(/animation: modal-panel-in/);

    const overlay = rule('.modal-overlay');
    expect(overlay).toContain('overscroll-behavior: contain');
    expect(overlay).toMatch(/animation: modal-overlay-in/);

    // Full-screen dialogs are their own surface: no backdrop, nothing to
    // scroll around.
    const fullscreen = rule('.modal-panel-fullscreen');
    expect(fullscreen).toContain('position: fixed');
    expect(fullscreen).toContain('overflow: hidden');
    expect(fullscreen).toMatch(/animation-name: modal-fullscreen-in/);

    // Respect the OS setting rather than animating regardless.
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation: none');
  });

  it('closes on Escape and on a press on the backdrop, but not from inside', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    const panel = screen.getByRole('dialog');
    const overlay = panel.parentElement as HTMLElement;

    fireEvent.mouseDown(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes only the topmost of several stacked modals on Escape', () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    const { rerender } = render(
      <>
        <Modal open onClose={onCloseOuter} ariaLabel="Outer">
          <button>Outer</button>
        </Modal>
        <Modal open onClose={onCloseInner} ariaLabel="Inner">
          <button>Inner</button>
        </Modal>
      </>,
    );

    // Every dialog listens on document in the capture phase, so a keypress
    // reaches the one underneath as well unless the stack filters it out.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();

    // With the inner dialog gone the outer one takes the keypress again.
    rerender(
      <>
        <Modal open onClose={onCloseOuter} ariaLabel="Outer">
          <button>Outer</button>
        </Modal>
        <Modal open={false} onClose={onCloseInner} ariaLabel="Inner">
          <button>Inner</button>
        </Modal>
      </>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseOuter).toHaveBeenCalledTimes(1);
  });

  it('keeps the stack order when a lower dialog re-renders with a new onClose', () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    const stacked = (outerOnClose: () => void) => (
      <>
        <Modal open onClose={outerOnClose} ariaLabel="Outer">
          <button>Outer</button>
        </Modal>
        <Modal open onClose={onCloseInner} ariaLabel="Inner">
          <button>Inner</button>
        </Modal>
      </>
    );
    const { rerender } = render(stacked(onCloseOuter));

    // An inline arrow is a new function each render, and re-registering the
    // token used to move the outer dialog back to the top of the stack.
    rerender(stacked(vi.fn()));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();
  });

  it('stays open when it has no close handler', () => {
    render(
      <Modal open ariaLabel="Example">
        <button>Inside</button>
      </Modal>,
    );

    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(overlay);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('names the dialog from a heading when one is given', () => {
    render(
      <Modal open labelledById="title">
        <h2 id="title">Reject this version</h2>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Reject this version' })).toBeInTheDocument();
  });

  it('renders a full-screen variant without a backdrop', () => {
    render(
      <Modal open variant="fullscreen" ariaLabel="Editor">
        <button>Inside</button>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('modal-panel-fullscreen');
    // No backdrop is rendered, so the dialog is the outermost element rendered.
    expect(dialog.closest('.modal-overlay')).toBeNull();
  });
});

describe('useBodyScrollLock gutter compensation', () => {
  // Headless browsers draw overlay scrollbars, so the width the lock has to
  // compensate for is stubbed here rather than measured in a real viewport.
  function withGutter(width: number, run: () => void) {
    const original = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    const clientWidth = vi
      .spyOn(document.documentElement, 'clientWidth', 'get')
      .mockReturnValue(1000 - width);
    try {
      run();
    } finally {
      clientWidth.mockRestore();
      if (original) Object.defineProperty(window, 'innerWidth', original);
    }
  }

  it('adds the scrollbar width as padding so the page does not shift', () => {
    withGutter(15, () => {
      const { unmount } = render(
        <Modal open ariaLabel="Example">
          <button>Inside</button>
        </Modal>,
      );

      expect(document.body.style.paddingRight).toBe('15px');

      unmount();
      expect(document.body.style.paddingRight).toBe('');
    });
  });

  it('leaves padding alone when the browser has no scrollbar gutter', () => {
    withGutter(0, () => {
      const { unmount } = render(
        <Modal open ariaLabel="Example">
          <button>Inside</button>
        </Modal>,
      );

      expect(document.body.style.paddingRight).toBe('');

      unmount();
    });
  });
});
