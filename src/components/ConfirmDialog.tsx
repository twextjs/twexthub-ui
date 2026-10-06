import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

export interface ConfirmDialogOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  /** When set, the confirm button stays disabled until the user types this exact text. */
  requireText?: string;
  /** Hint shown above the input. Defaults to `Type "<requireText>" to confirm`. */
  requireTextLabel?: string;
}

interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmDialogOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  options,
  onConfirm,
  onCancel,
}) => {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    requireText,
    requireTextLabel,
  } = options;

  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const canConfirm = !requireText || typed === requireText;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      zIndex={60}
      labelledById="confirm-dialog-title"
      initialFocusRef={requireText ? inputRef : confirmRef}
      className="p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex items-center gap-2 font-semibold text-sm ${
            variant === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-ink'
          }`}
        >
          {variant === 'danger' && <Icon name="warning" className="shrink-0" />}
          <h2 id="confirm-dialog-title" className="font-display">
            {title}
          </h2>
        </div>
        <button
          onClick={onCancel}
          aria-label="Close dialog"
          className="text-ink-3 hover:text-ink transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      {message && <div className="text-xs text-ink-2 leading-relaxed">{message}</div>}

      {requireText && (
        <div className="space-y-1.5">
          <label className="label block" htmlFor="confirm-dialog-input">
            {requireTextLabel || `Type "${requireText}" to confirm`}
          </label>
          <input
            id="confirm-dialog-input"
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireText}
            autoComplete="off"
            spellCheck={false}
            className="input font-mono"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onCancel} className="btn btn-ghost btn-sm">
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          onClick={onConfirm}
          disabled={!canConfirm}
          className={`btn btn-sm ${variant === 'danger' ? 'btn-danger' : 'btn-primary'} disabled:opacity-50`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
