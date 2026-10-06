import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { Quota } from '../types/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

interface QuotaModalProps {
  namespace: string;
  onClose: () => void;
  onSaved: () => void;
}

export const QuotaModal: React.FC<QuotaModalProps> = ({ namespace, onClose, onSaved }) => {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [megabytes, setMegabytes] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getUserQuota(namespace);
      setQuota(data);
      // `null` means "instance default", which has no concrete number to edit.
      setMegabytes(data.maxBlobBytes == null ? '' : String(data.maxBlobBytes / 1024 / 1024));
    } catch (err: unknown) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load the account quota');
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (maxBlobBytes: number | null) => {
    setSaving(true);
    setInputError(null);
    try {
      const updated = await api.setUserQuota(namespace, maxBlobBytes);
      setQuota(updated);
      setMegabytes(updated.maxBlobBytes == null ? '' : String(updated.maxBlobBytes / 1024 / 1024));
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to update the quota';
      setInputError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOverride = async () => {
    const trimmed = megabytes.trim();
    if (trimmed === '') {
      setInputError('Enter a size in MB, or press "Use site default".');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setInputError('Enter a positive number of megabytes.');
      return;
    }
    await save(Math.round(parsed * 1024 * 1024));
  };

  const usedPercent =
    quota && quota.maxBlobBytes
      ? Math.min(100, (quota.blobBytes / quota.maxBlobBytes) * 100)
      : null;

  return (
    <Modal onClose={onClose} size="md" ariaLabel={`Storage quota for @${namespace}`}>
      <div className="flex items-center justify-between p-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="storage" className="text-lilac-700 dark:text-lilac-300" />
            Storage quota
          </h2>
          <p className="font-mono text-meta text-ink-3 mt-0.5">@{namespace}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close quota dialog"
          className="p-1 text-ink-3 hover:text-ink rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loadError ? (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
            <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : loading ? (
          <div className="h-16 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
        ) : (
          quota && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">Used</span>
                  <span className="font-mono text-ink">
                    {formatBytes(quota.blobBytes)}
                    {quota.maxBlobBytes != null && (
                      <span className="text-ink-3"> / {formatBytes(quota.maxBlobBytes)}</span>
                    )}
                  </span>
                </div>
                {usedPercent !== null && (
                  <div className="h-1.5 bg-wash dark:bg-raised rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        usedPercent >= 90
                          ? 'bg-rose-500'
                          : usedPercent >= 70
                            ? 'bg-amber-500'
                            : 'bg-lilac-500'
                      }`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                )}
                {quota.maxBlobBytes == null && (
                  <p className="text-micro text-ink-3">
                    No per-account limit set. This account uses the site default.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="quota-mb" className="label text-ink-3">
                  Override (MB)
                </label>
                <div className="flex gap-2">
                  <input
                    id="quota-mb"
                    type="number"
                    min="1"
                    step="1"
                    value={megabytes}
                    onChange={(e) => {
                      setMegabytes(e.target.value);
                      setInputError(null);
                    }}
                    placeholder="site default"
                    className="input flex-1"
                  />
                  <button
                    onClick={handleSaveOverride}
                    disabled={saving}
                    className="btn btn-primary shrink-0"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                {inputError && (
                  <p className="text-meta text-rose-600 dark:text-rose-400">{inputError}</p>
                )}
              </div>

              <button
                onClick={() => save(null)}
                disabled={saving || quota.maxBlobBytes == null}
                className="btn btn-secondary w-full"
              >
                <Icon name="restart_alt" className="icon-sm" />
                <span>Use site default</span>
              </button>
            </>
          )
        )}
      </div>
    </Modal>
  );
};
