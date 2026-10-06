import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';

const Trigger = () => {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Saved!')}>ok</button>
      <button onClick={() => toast.error('Something broke')}>err</button>
      <button onClick={() => toast.info('Sticky note', 0)}>sticky</button>
    </>
  );
};

const renderToasts = () =>
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('shows a toast and auto-dismisses it', () => {
    vi.useFakeTimers();
    renderToasts();

    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Saved!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  });

  it('marks error toasts as alerts', () => {
    vi.useFakeTimers();
    renderToasts();

    fireEvent.click(screen.getByRole('button', { name: 'err' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
  });

  it('keeps sticky toasts until dismissed manually', () => {
    vi.useFakeTimers();
    renderToasts();

    fireEvent.click(screen.getByRole('button', { name: 'sticky' }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Sticky note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Sticky note')).not.toBeInTheDocument();
  });
});
