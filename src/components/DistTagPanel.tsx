import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useConfirm } from '../hooks/useConfirm';
import { DistTags } from '../types/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

const TAG_PATTERN = /^[a-zA-Z0-9-]{1,30}$/;
const RESERVED_TAG = 'latest';

interface DistTagPanelProps {
  namespace: string;
  id: string;
  publishedVersions: string[];
  onClose: () => void;
}

export const DistTagPanel: React.FC<DistTagPanelProps> = ({
  namespace,
  id,
  publishedVersions,
  onClose,
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const [tags, setTags] = useState<DistTags>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [version, setVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTags(await api.getDistTags(namespace, id));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dist-tags');
    } finally {
      setLoading(false);
    }
  }, [namespace, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!version && publishedVersions.length > 0) {
      setVersion(publishedVersions[0]);
    }
  }, [publishedVersions, version]);

  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = tag.trim();
    if (!TAG_PATTERN.test(name)) {
      setFormError('Use 1-30 letters, digits, or hyphens.');
      return;
    }
    if (name === RESERVED_TAG) {
      setFormError(`"${RESERVED_TAG}" is reserved and always points at the newest version.`);
      return;
    }
    if (!version) {
      setFormError('Choose a published version.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await api.setDistTag(namespace, id, name, version);
      setTag('');
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save dist-tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    const confirmed = await confirm({
      title: 'Remove dist-tag',
      message: `Remove the "${name}" tag? Consumers resolving ${name} will fall back to the default version.`,
      confirmLabel: 'Remove tag',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingTag(name);
    setError(null);
    try {
      await api.deleteDistTag(namespace, id, name);
      setTags((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove dist-tag');
    } finally {
      setDeletingTag(null);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      ariaLabel={`Dist-tags for @${namespace}/${id}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="sell" className="text-lilac-500 dark:text-lilac-300" />
          Dist-tags —{' '}
          <span className="font-mono text-ink-2">
            @{namespace}/{id}
          </span>
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-wash transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
          <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="h-12 bg-wash dark:bg-raised rounded animate-pulse" />
      ) : entries.length > 0 ? (
        <div className="divide-y divide-line border border-line rounded-lg">
          {entries.map(([name, target]) => {
            const reserved = name === RESERVED_TAG;
            return (
              <div
                key={name}
                className="p-3 flex items-center justify-between gap-3 text-xs bg-surface dark:bg-raised"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="chip bg-wash dark:bg-raised border-line text-ink font-mono">
                    {name}
                  </span>
                  <span className="font-mono text-ink-2">v{target}</span>
                  {reserved && (
                    <span className="text-micro text-ink-3 uppercase tracking-wide">reserved</span>
                  )}
                </div>
                {!reserved && (
                  <button
                    onClick={() => handleDelete(name)}
                    disabled={deletingTag === name}
                    title={`Remove the ${name} tag`}
                    aria-label={`Remove tag ${name}`}
                    className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Icon name="delete" className="icon-sm" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-meta text-ink-3">No dist-tags yet.</p>
      )}

      <form onSubmit={handleSubmit} className="border border-line rounded-lg p-3 space-y-3">
        <div className="label">Point a tag at a published version</div>
        {publishedVersions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="dist-tag-name" className="text-meta text-ink-3">
                Tag
              </label>
              <input
                id="dist-tag-name"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="next"
                className="input font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor="dist-tag-version" className="text-meta text-ink-3">
                Version
              </label>
              <select
                id="dist-tag-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input font-mono text-xs"
              >
                {publishedVersions.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="text-meta text-ink-3">
            No published versions to tag yet. Publish a version first.
          </p>
        )}
        {formError && <p className="text-meta text-rose-700 dark:text-rose-400">{formError}</p>}
        <button
          type="submit"
          disabled={saving || publishedVersions.length === 0}
          className="btn btn-primary btn-sm"
        >
          <Icon name="sell" className="icon-sm" />
          <span>{saving ? 'Saving...' : 'Save tag'}</span>
        </button>
      </form>

      {confirmDialog}
    </Modal>
  );
};
