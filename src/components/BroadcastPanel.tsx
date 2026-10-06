import React, { useState } from 'react';
import { api, ApiError } from '../services/api';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../context/ToastContext';
import { Icon } from './Icon';

const MAX_LENGTH = 280;

export const BroadcastPanel: React.FC = () => {
  const { confirm, confirmDialog } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();

  const send = async () => {
    if (!trimmed) {
      setError('Enter a message first.');
      return;
    }
    // Fan-out happens at insert time and cannot be recalled, so confirm hard.
    const ok = await confirm({
      title: 'Send to every account',
      message: `This writes a notification row for every account on this registry. It cannot be recalled. Send "${trimmed}"?`,
      confirmLabel: 'Send broadcast',
      variant: 'danger',
    });
    if (!ok) return;

    setSending(true);
    setError(null);
    try {
      const created = await api.broadcastNotification(trimmed);
      setMessage('');
      toastSuccess(`Broadcast delivered to ${created} account${created === 1 ? '' : 's'}.`);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to send the broadcast';
      setError(msg);
      toastError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="campaign" className="text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-ink">Send an announcement</h2>
      </div>
      <p className="text-xs text-ink-2 leading-relaxed max-w-2xl">
        Sends a notice to every account's inbox — everyone signed up at the moment of sending. Use
        it for maintenance or policy changes. This cannot be recalled.
      </p>

      <div className="space-y-2">
        <label htmlFor="broadcast-message" className="label block text-ink-3">
          Message{' '}
          <span className="normal-case">
            ({trimmed.length}/{MAX_LENGTH})
          </span>
        </label>
        <textarea
          id="broadcast-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setError(null);
          }}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="Scheduled maintenance on Sunday 02:00 UTC..."
          className="input resize-y"
        />
        {error && <p className="text-meta text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      <button
        onClick={send}
        disabled={sending || !trimmed}
        className="btn btn-primary disabled:opacity-50"
      >
        <Icon name="campaign" className="icon-sm" />
        <span>{sending ? 'Sending...' : 'Send to all accounts'}</span>
      </button>
      {confirmDialog}
    </div>
  );
};
