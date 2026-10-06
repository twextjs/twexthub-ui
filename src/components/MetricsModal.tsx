import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../services/api';
import {
  MetricFamily,
  ParsedMetrics,
  formatLabels,
  formatValue,
  parsePrometheusText,
} from '../lib/prometheus';
import { CodeEditor } from './CodeEditor';
import { Icon } from './Icon';
import { Modal } from './Modal';

const TYPE_CHIP: Record<string, string> = {
  gauge:
    'bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800',
  counter:
    'bg-sky-50 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  histogram:
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  summary:
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

/**
 * Labels the rendered view never shows, so the numbers stay about the whole
 * site rather than breaking down individual accounts or roles. The raw-text
 * view still shows everything the server sent.
 */
const HIDDEN_LABELS = new Set(['role', 'namespace']);

/**
 * Strips the hidden labels, then folds samples that become identical into a
 * single total so hiding the labels never leaves duplicate rows behind.
 */
const summarise = (family: MetricFamily): MetricFamily => {
  const rows = new Map<string, { labels: Record<string, string>; value: number }>();
  for (const sample of family.samples) {
    const labels = Object.fromEntries(
      Object.entries(sample.labels).filter(([key]) => !HIDDEN_LABELS.has(key)),
    );
    const key = JSON.stringify(labels);
    const row = rows.get(key);
    if (row) row.value += sample.value;
    else rows.set(key, { labels, value: sample.value });
  }
  return {
    ...family,
    samples: [...rows.values()].map((row) => ({
      name: family.samples[0].name,
      labels: row.labels,
      value: row.value,
    })),
  };
};

const FamilyTable: React.FC<{ family: MetricFamily }> = ({ family }) => (
  <div className="border border-line rounded-lg overflow-hidden">
    <div className="px-3 py-2 bg-wash dark:bg-raised border-b border-line flex items-center gap-2 flex-wrap">
      <span className="font-mono text-meta text-ink">{family.name}</span>
      {family.type && (
        <span
          className={`chip font-mono text-micro ${
            TYPE_CHIP[family.type] ?? 'bg-wash dark:bg-raised text-ink-3 border-line'
          }`}
        >
          {family.type}
        </span>
      )}
    </div>
    {family.help && <p className="px-3 pt-2 text-meta text-ink-3 leading-relaxed">{family.help}</p>}
    <div className="p-3 space-y-1.5">
      {family.samples.map((sample, index) => {
        const labels = formatLabels(sample.labels);
        return (
          <div
            key={`${labels}-${index}`}
            className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 text-meta"
          >
            <span className="font-mono text-ink-3 break-all">
              {labels ? labels : <em className="not-italic">no labels</em>}
            </span>
            <span className="font-mono text-ink font-semibold tabular-nums shrink-0">
              {formatValue(sample.name, sample.value)}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

export const MetricsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      setText(await api.getAdminMetrics());
    } catch (err: unknown) {
      setUnauthorized(err instanceof ApiError && (err.status === 401 || err.status === 403));
      setError(err instanceof ApiError ? err.message : "Couldn't load the statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parsed: ParsedMetrics | null = useMemo(
    () => (text ? parsePrometheusText(text) : null),
    [text],
  );

  const labelled = useMemo(
    () =>
      parsed?.families
        .filter((f) => Object.keys(f.samples[0]?.labels ?? {}).length > 0)
        .map(summarise) ?? [],
    [parsed],
  );
  const unlabelled = useMemo(
    () =>
      parsed?.families.filter((f) => Object.keys(f.samples[0]?.labels ?? {}).length === 0) ?? [],
    [parsed],
  );

  const handleCopy = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setCopyError('Clipboard is not available. Select the text and copy manually.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setCopyError('Could not access the clipboard. Select the text and copy manually.');
    }
  };

  return (
    <Modal variant="fullscreen" labelledById="admin-metrics-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="space-y-0.5 min-w-0">
          <h2
            id="admin-metrics-title"
            className="text-base font-display font-semibold text-ink flex items-center gap-2"
          >
            <Icon name="monitoring" className="text-amber-600 dark:text-amber-400" />
            Site statistics
          </h2>
          <p className="text-meta text-ink-3">Live numbers from the server.</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh metrics"
            title="Refresh"
            className="p-1 text-ink-3 hover:text-ink transition-colors disabled:opacity-50"
          >
            <Icon name="refresh" className={` ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink transition-colors"
            aria-label="Close metrics"
          >
            <Icon name="close" className="icon-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
            <div className="h-40 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <Icon name="gpp_maybe" className="text-rose-600 shrink-0" />
              <div>
                <strong>Couldn't load the statistics:</strong> {error}
              </div>
            </div>
            {unauthorized && (
              <p className="text-meta text-ink-3 leading-relaxed max-w-2xl">
                Only administrators can view these numbers. Sign in with an administrator account
                and try again.
              </p>
            )}
          </div>
        ) : showRaw ? (
          <CodeEditor
            label="Raw statistics (read-only)"
            language="bash"
            value={text}
            onChange={() => {}}
            readOnly
          />
        ) : parsed && parsed.families.length > 0 ? (
          <>
            <p className="text-meta text-ink-3">
              {parsed.families.length} stats • {parsed.sampleCount} data points
            </p>

            {unlabelled.length > 0 && (
              <div className="space-y-2">
                <h3 className="label text-ink-3 flex items-center gap-1.5">
                  <Icon name="speed" className="icon-xs" />
                  Current values
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {unlabelled.map((family) => {
                    const sample = family.samples[0];
                    return (
                      <div key={family.name} className="card p-3">
                        <div className="font-mono text-micro text-ink-3 break-all">
                          {family.name}
                        </div>
                        <div className="font-mono text-xl font-semibold text-ink tabular-nums mt-0.5">
                          {formatValue(sample.name, sample.value)}
                        </div>
                        {family.help && (
                          <p className="text-micro text-ink-3 leading-relaxed mt-1">
                            {family.help}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {labelled.length > 0 && (
              <div className="space-y-2">
                <h3 className="label text-ink-3">Breakdown</h3>
                <div className="space-y-3">
                  {labelled.map((family) => (
                    <FamilyTable key={family.name} family={family} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-meta text-ink-3">No statistics to show yet.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-2 border-t border-line bg-wash dark:bg-raised text-meta text-ink-3 font-mono">
        <div className="min-w-0">
          <span>
            {parsed ? `${parsed.sampleCount} readings` : 'no data'}
            {copyError && (
              <span role="alert" className="ml-3 text-rose-600 dark:text-rose-400 font-sans">
                {copyError}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowRaw((prev) => !prev)}
            disabled={!text}
            className="hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
          >
            <span>{showRaw ? 'Rendered view' : 'Raw text'}</span>
          </button>
          <button
            onClick={() => void handleCopy()}
            disabled={!text}
            className="text-lilac-700 dark:text-lilac-300 hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
          >
            {copied ? (
              <>
                <Icon name="check" className="icon-xs text-emerald-600" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Icon name="content_copy" className="icon-xs" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
