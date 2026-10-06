import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon, IconName } from '../components/Icon';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: React.ReactNode;
  duration: number;
}

interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Use 0 to require manual dismissal. */
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: React.ReactNode, options?: ToastOptions) => number;
  success: (message: React.ReactNode, duration?: number) => number;
  error: (message: React.ReactNode, duration?: number) => number;
  info: (message: React.ReactNode, duration?: number) => number;
  dismissToast: (id: number) => void;
}

const DEFAULT_DURATION = 4500;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200',
  error:
    'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200',
  info: 'bg-surface dark:bg-raised border-line text-ink',
};

const VARIANT_ICON: Record<ToastVariant, IconName> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: React.ReactNode, options?: ToastOptions) => {
      const id = (idRef.current += 1);
      const duration = options?.duration ?? DEFAULT_DURATION;
      const variant = options?.variant ?? 'info';
      setToasts((prev) => [...prev, { id, variant, message, duration }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismissToast(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  const success = useCallback(
    (message: React.ReactNode, duration = DEFAULT_DURATION) =>
      showToast(message, { variant: 'success', duration }),
    [showToast],
  );

  const error = useCallback(
    (message: React.ReactNode, duration = 7000) =>
      showToast(message, { variant: 'error', duration }),
    [showToast],
  );

  const info = useCallback(
    (message: React.ReactNode, duration = DEFAULT_DURATION) =>
      showToast(message, { variant: 'info', duration }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, dismissToast }}>
      {children}
      <div
        className="fixed top-16 right-4 z-[70] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto card p-3 pr-2 flex items-start gap-2 text-xs border shadow-lg ${VARIANT_STYLES[toast.variant]}`}
            >
              <Icon name={VARIANT_ICON[toast.variant]} className="shrink-0" />
              <div className="flex-1 min-w-0 leading-relaxed break-words">{toast.message}</div>
              <button
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <Icon name="close" className="icon-sm" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
