import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

type BadgeField = 'version' | 'downloads' | 'license';

const SPLIT_FIELDS: { field: BadgeField; label: string }[] = [
  { field: 'version', label: 'Version' },
  { field: 'downloads', label: 'Downloads' },
  { field: 'license', label: 'License' },
];

const MARKDOWN_LABELS: Record<BadgeField, string> = {
  version: 'version',
  downloads: 'downloads',
  license: 'license',
};

interface BadgePanelProps {
  namespace: string;
  id: string;
  onClose: () => void;
}

export const BadgePanel: React.FC<BadgePanelProps> = ({ namespace, id, onClose }) => {
  const [selected, setSelected] = useState<BadgeField[]>(['version', 'downloads']);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const base = api.getPublicBaseUrl();
  const encNs = encodeURIComponent(namespace);
  const encId = encodeURIComponent(id);

  const badgeUrl = useMemo(() => {
    const path =
      selected.length === 1
        ? `${base}/badge/@${encNs}/${encId}/${selected[0]}`
        : `${base}/badge/@${encNs}/${encId}`;
    return label.trim() ? `${path}?label=${encodeURIComponent(label.trim())}` : path;
  }, [base, encNs, encId, selected, label]);

  const markdown = useMemo(() => {
    if (selected.length === 0) return '';
    // The combined endpoint already packs every fact into a single pill, so it
    // is emitted once. Repeating that URL per fact would just duplicate the
    // same image in the rendered Markdown.
    if (selected.length > 1) {
      return `![${selected.map((field) => MARKDOWN_LABELS[field]).join(' + ')}](${badgeUrl})`;
    }
    return `![${MARKDOWN_LABELS[selected[0]]}](${badgeUrl})`;
  }, [selected, badgeUrl]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be denied; the text stays selectable.
    }
  };

  const toggleField = (field: BadgeField) => {
    setSelected((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  return (
    <Modal
      onClose={onClose}
      size="xl"
      ariaLabel={`Badge embed for @${namespace}/${id}`}
      className="p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="image" className="text-lilac-500 dark:text-lilac-300" />
          Badges —{' '}
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

      <fieldset className="space-y-1.5">
        <legend className="label mb-1">Facts</legend>
        <div className="flex flex-wrap gap-1.5">
          {SPLIT_FIELDS.map(({ field, label: fieldLabel }) => (
            <label
              key={field}
              className={`chip cursor-pointer transition-colors ${
                selected.includes(field)
                  ? 'bg-lilac-100 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-300 dark:border-lilac-700'
                  : 'bg-wash dark:bg-raised border-line text-ink-3 hover:text-ink-2'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(field)}
                onChange={() => toggleField(field)}
              />
              {fieldLabel}
            </label>
          ))}
        </div>
        <p className="text-meta text-ink-3">
          One fact renders that fact's compact ~90-140px badge. Two or more switches to the combined
          badge, which packs all three facts into a single ~250px pill.
        </p>
      </fieldset>

      <div>
        <label htmlFor="badge-label" className="label">
          Left-pill text (optional)
        </label>
        <input
          id="badge-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="defaults to the extension id"
          className="input text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <div className="label">Preview</div>
        <div className="flex flex-wrap items-center gap-2 p-3 border border-line rounded-lg bg-wash dark:bg-raised min-h-[44px]">
          {selected.length > 0 ? (
            <img
              src={badgeUrl}
              alt={`Badge for @${namespace}/${id}`}
              className="h-6 align-middle"
            />
          ) : (
            <span className="text-meta text-ink-3">Select at least one fact to preview.</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Markdown</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-meta font-mono text-ink bg-surface dark:bg-surface border border-line rounded px-2 py-1.5 break-all">
            {markdown}
          </code>
          <button
            onClick={() => copy(markdown, 'markdown')}
            disabled={selected.length === 0}
            className="btn btn-secondary btn-sm shrink-0"
          >
            {copied === 'markdown' ? (
              <Icon name="check" className="icon-xs" />
            ) : (
              <Icon name="content_copy" className="icon-xs" />
            )}
            <span>{copied === 'markdown' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Direct image URL</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-meta font-mono text-ink bg-surface dark:bg-surface border border-line rounded px-2 py-1.5 break-all">
            {badgeUrl}
          </code>
          <button
            onClick={() => copy(badgeUrl, 'url')}
            disabled={selected.length === 0}
            className="btn btn-secondary btn-sm shrink-0"
          >
            {copied === 'url' ? (
              <Icon name="check" className="icon-xs" />
            ) : (
              <Icon name="content_copy" className="icon-xs" />
            )}
            <span>{copied === 'url' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
