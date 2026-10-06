import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { AuditEntry, Pagination } from '../types/api';
import { Icon } from './Icon';

const ACTION_STYLES: Record<string, string> = {
  'version.publish':
    'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'version.approve':
    'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'version.reject':
    'bg-rose-50 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
  'version.yank':
    'bg-rose-50 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
  'version.deprecate':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'tag.set':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'tag.remove':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'owner.add':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'owner.remove':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'access.grant':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'access.revoke':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'quota.set': 'bg-wash dark:bg-raised text-ink-2 border-line',
  'role.change':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'extension.delete':
    'bg-rose-50 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
};

/** Plain-language names for the audit actions the server records. */
const ACTION_LABELS: Record<string, string> = {
  'version.publish': 'Published',
  'version.approve': 'Approved',
  'version.reject': 'Changes requested',
  'version.yank': 'Unpublished',
  'version.deprecate': 'Deprecated',
  'tag.set': 'Tag set',
  'tag.remove': 'Tag removed',
  'owner.add': 'Owner added',
  'owner.remove': 'Owner removed',
  'access.grant': 'Access given',
  'access.revoke': 'Access removed',
  'quota.set': 'Storage changed',
  'role.change': 'Permissions changed',
  'extension.delete': 'Extension deleted',
};

const targetLabel = (entry: AuditEntry) => {
  const { namespace, id, version } = entry.target || {};
  if (!namespace || !id) return null;
  const base = `@${namespace}/${id}`;
  return version ? `${base}@${version}` : base;
};

const detailSummary = (detail: Record<string, unknown>) => {
  const entries = Object.entries(detail || {}).filter(
    ([, value]) => value !== null && value !== undefined && typeof value !== 'object',
  );
  if (entries.length === 0) return '';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
};

interface AuditLogPanelProps {
  onNavigate: (route: string) => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ onNavigate }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLog(cursor ? { cursor, limit: 50 } : { limit: 50 });
      const page = res?.data || [];
      setEntries((prev) => (cursor ? [...prev, ...page] : page));
      setPagination(res?.pagination || { nextCursor: null, hasMore: false });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the audit log');
    } finally {
      if (cursor) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Icon name="monitoring" className="text-amber-600 dark:text-amber-400" />
            Site activity
          </h2>
          <p className="text-meta text-ink-3 mt-0.5 max-w-2xl">
            A record of publishes, review decisions, unpublishes, deprecations, tag and owner
            changes, storage limits, and access changes. Newest first.
          </p>
        </div>
        <button
          onClick={() => fetchEntries()}
          disabled={loading}
          aria-label="Refresh audit log"
          title="Refresh"
          className="p-1.5 text-ink-3 hover:text-ink border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors disabled:opacity-50 shrink-0"
        >
          <Icon name="refresh" className={`icon-sm ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
          <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-12 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
          <div className="h-12 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
        </div>
      ) : entries.length > 0 ? (
        <>
          <div className="divide-y divide-line border border-line rounded-lg">
            {entries.map((entry) => {
              const label = targetLabel(entry);
              const details = detailSummary(entry.detail);
              return (
                <div
                  key={entry.id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-surface dark:bg-raised"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`chip ${
                          ACTION_STYLES[entry.action] ??
                          'bg-wash dark:bg-raised text-ink-2 border-line'
                        }`}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="font-mono text-ink-2">
                        {entry.actor === 'system' ? 'system' : `@${entry.actor}`}
                      </span>
                    </div>
                    {details && <p className="text-meta text-ink-3 font-mono">{details}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-meta text-ink-3">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    {label && (
                      <button
                        onClick={() =>
                          onNavigate(`ext/${entry.target.namespace}/${entry.target.id}`)
                        }
                        title={`Open ${label}`}
                        aria-label={`Open ${label}`}
                        className="font-mono text-meta text-lilac-700 dark:text-lilac-300 hover:underline inline-flex items-center gap-0.5"
                      >
                        {label}
                        <Icon name="open_in_new" className="icon-xs" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {pagination.hasMore && pagination.nextCursor && (
            <button
              onClick={() => fetchEntries(pagination.nextCursor ?? undefined)}
              disabled={loadingMore}
              className="btn btn-secondary w-full"
            >
              <Icon name="expand_more" className="icon-sm" />
              <span>{loadingMore ? 'Loading...' : 'Load older entries'}</span>
            </button>
          )}
        </>
      ) : (
        <p className="text-meta text-ink-3 py-2">Nothing recorded yet.</p>
      )}
    </div>
  );
};
