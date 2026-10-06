import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import type { ModerationStatus } from '../types/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface DeprecateVersionModalProps {
  namespace: string;
  id: string;
  version: string;
  currentMessage?: string | null;
  onClose: () => void;
  onSaved: (status: ModerationStatus, message: string | null) => void;
}

export const DeprecateVersionModal: React.FC<DeprecateVersionModalProps> = ({
  namespace,
  id,
  version,
  currentMessage,
  onClose,
  onSaved,
}) => {
  const [message, setMessage] = useState(currentMessage ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length === 0) {
      setError('Describe what users should use instead.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.deprecateVersion(namespace, id, version, message.trim());
      onSaved(updated.status, updated.deprecation ?? null);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to deprecate version');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      ariaLabel={`Deprecate v${version}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="warning" className="text-amber-600 dark:text-amber-400" />
          Deprecate v{version}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-wash transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      <p className="text-xs text-ink-2 leading-relaxed">
        Deprecated versions stay installable and listed, so existing projects keep working, but
        anyone inspecting this version sees your message.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="deprecation-message" className="label">
            Notice
          </label>
          <textarea
            id="deprecation-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Use 2.x instead; this version no longer receives fixes."
            className="input text-xs"
          />
        </div>
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
            <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
            <span>{saving ? 'Saving...' : 'Deprecate version'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-meta font-medium text-ink-3 hover:text-ink border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};
