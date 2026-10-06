import React, { useCallback, useState } from 'react';
import { api, ApiError } from '../services/api';
import { PaginatedList, User } from '../types/api';
import { useConfirm } from '../hooks/useConfirm';
import { Icon } from './Icon';

interface PrunePanelProps {
  currentUserNamespace?: string;
  onPruned: () => void;
}

interface PruneCandidate {
  user: User;
  sessions: number;
  tokens: number;
}

interface PruneSummary {
  deleted: number;
  failed: Array<{ namespace: string; error: string }>;
}

interface PruneOptions {
  onlyWithoutPublished: boolean;
  includeAdmins: boolean;
}

const DEFAULT_OPTIONS: PruneOptions = {
  onlyWithoutPublished: true,
  includeAdmins: false,
};

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function isExpired(date?: string | null): boolean {
  return Boolean(date && new Date(date).getTime() < Date.now());
}

async function collectAllCredentials<T>(
  fetcher: (params: {
    namespace: string;
    cursor?: string;
    limit?: number;
  }) => Promise<PaginatedList<T>>,
  namespace: string,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const res = await fetcher(cursor ? { namespace, cursor, limit: 50 } : { namespace, limit: 50 });
    all.push(...(res?.data || []));
    const { hasMore, nextCursor } = res?.pagination ?? {};
    if (!hasMore) return all;
    // A missing or unchanged cursor means the feed cannot advance, and the
    // guard bounds runaway feeds: both abort with an error instead of
    // silently judging the account on partial credentials. The scan loop
    // catches this and skips the account.
    const next = nextCursor || undefined;
    if (!next || next === cursor || guard >= 1000) {
      throw new Error(`Credential pagination for @${namespace} did not advance.`);
    }
    cursor = next;
    guard += 1;
  } while (cursor);
  return all;
}

export const PrunePanel: React.FC<PrunePanelProps> = ({ currentUserNamespace, onPruned }) => {
  const { confirm, confirmDialog } = useConfirm();
  const [options, setOptions] = useState<PruneOptions>(DEFAULT_OPTIONS);
  const [dormant, setDormant] = useState<PruneCandidate[]>([]);
  const [scanned, setScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPruning, setIsPruning] = useState(false);
  const [pruneProgress, setPruneProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<PruneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAllUsers = useCallback(async (): Promise<User[]> => {
    const all: User[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const res = await api.getUsers(cursor ? { cursor, limit: 50 } : { limit: 50 });
      all.push(...(res?.data || []));
      cursor = res?.pagination?.hasMore ? res.pagination.nextCursor : null;
      guard += 1;
    } while (cursor && guard < 1000);
    return all;
  }, []);

  const visible = dormant.filter(
    (c) =>
      (options.includeAdmins || c.user.role !== 'admin') &&
      (!options.onlyWithoutPublished || !c.user.hasPublished),
  );

  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setSummary(null);
    setDormant([]);
    setSelected(new Set());
    try {
      const users = await fetchAllUsers();
      // The registry lists organizations through `/users` as well. One holds no
      // credentials of its own, so it would look permanently dormant here and
      // there is nothing this tool could do about it either way.
      const eligible = users.filter(
        (u) => u.kind !== 'organization' && u.namespace !== currentUserNamespace,
      );
      setScanProgress({ done: 0, total: eligible.length });

      const found: PruneCandidate[] = [];
      for (let i = 0; i < eligible.length; i += 1) {
        const target = eligible[i];
        try {
          // Page through every credential page before deciding dormancy.
          const [allSessions, allTokens] = await Promise.all([
            collectAllCredentials((params) => api.getSessions(params), target.namespace),
            collectAllCredentials((params) => api.getTokens(params), target.namespace),
          ]);
          // Only active (non-expired) credentials block a prune; accounts
          // holding solely expired sessions/tokens are still dormant.
          const sessions = allSessions.filter((s) => !isExpired(s.expiresAt)).length;
          const tokens = allTokens.filter((t) => !isExpired(t.expiresAt)).length;
          if (sessions === 0 && tokens === 0) {
            found.push({ user: target, sessions, tokens });
          }
        } catch {
          // Skip accounts whose activity could not be inspected.
        }
        setScanProgress({ done: i + 1, total: eligible.length });
      }

      setDormant(found);
      setSelected(new Set(found.map((c) => c.user.namespace)));
      setScanned(true);
    } catch (err: unknown) {
      setError(describeError(err, 'Failed to scan for dormant accounts'));
    } finally {
      setIsScanning(false);
    }
  }, [currentUserNamespace, fetchAllUsers]);

  const toggleSelected = (namespace: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(namespace)) next.delete(namespace);
      else next.add(namespace);
      return next;
    });
  };

  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => selected.has(c.user.namespace));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach((c) => next.delete(c.user.namespace));
      } else {
        visible.forEach((c) => next.add(c.user.namespace));
      }
      return next;
    });
  };

  const selectedTargets = visible.filter((c) => selected.has(c.user.namespace));

  const handlePrune = async () => {
    if (selectedTargets.length === 0) return;
    const confirmed = await confirm({
      title: 'Prune dormant accounts',
      message: (
        <>
          Permanently delete <strong>{selectedTargets.length}</strong>{' '}
          {selectedTargets.length === 1 ? 'account' : 'accounts'}? This removes their sessions,
          tokens, extensions, and versions. This action cannot be undone.
        </>
      ),
      confirmLabel: `Delete ${selectedTargets.length} ${selectedTargets.length === 1 ? 'account' : 'accounts'}`,
      variant: 'danger',
      requireText: 'PRUNE',
      requireTextLabel: `Type PRUNE to delete ${selectedTargets.length} dormant ${
        selectedTargets.length === 1 ? 'account' : 'accounts'
      }`,
    });
    if (!confirmed) return;

    setIsPruning(true);
    setError(null);
    setSummary(null);
    setPruneProgress({ done: 0, total: selectedTargets.length });

    let deleted = 0;
    const failed: PruneSummary['failed'] = [];
    for (let i = 0; i < selectedTargets.length; i += 1) {
      const target = selectedTargets[i];
      try {
        await api.deleteUser(target.user.namespace);
        deleted += 1;
        setDormant((prev) => prev.filter((c) => c.user.namespace !== target.user.namespace));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(target.user.namespace);
          return next;
        });
      } catch (err: unknown) {
        failed.push({
          namespace: target.user.namespace,
          error: describeError(err, 'Deletion failed'),
        });
      }
      setPruneProgress({ done: i + 1, total: selectedTargets.length });
    }

    setSummary({ deleted, failed });
    setIsPruning(false);
    onPruned();
  };

  const scanPercent =
    scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {confirmDialog}

      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Icon name="content_cut" className="text-lilac-600 dark:text-lilac-300" />
              <h3 className="text-sm font-semibold text-ink">Prune Dormant Accounts</h3>
            </div>
            <p className="text-meta text-ink-3 max-w-xl leading-relaxed">
              Find accounts that have no active web sessions and no automation tokens, then delete
              them in bulk. Deletion permanently removes the account and everything it owns.
            </p>
          </div>
          <button
            onClick={scan}
            disabled={isScanning || isPruning}
            className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"
          >
            <Icon name="refresh" className={`icon-sm ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan for Dormant Accounts'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 border-t border-line">
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.onlyWithoutPublished}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, onlyWithoutPublished: e.target.checked }))
              }
              className="rounded accent-lilac-500"
            />
            <span>Only accounts without published extensions</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeAdmins}
              onChange={(e) => setOptions((prev) => ({ ...prev, includeAdmins: e.target.checked }))}
              className="rounded accent-lilac-500"
            />
            <span>Include administrator accounts</span>
          </label>
        </div>

        {isScanning && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-meta text-ink-3">
              <span>
                Inspecting accounts... {scanProgress.done} of {scanProgress.total}
              </span>
              <span className="font-mono">{scanPercent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-wash dark:bg-raised overflow-hidden">
              <div
                className="h-full bg-lilac-500 transition-all"
                style={{ width: `${scanPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <Icon name="warning" className="text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div
          className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
            summary.failed.length > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          {summary.failed.length > 0 ? (
            <Icon name="warning" className="shrink-0" />
          ) : (
            <Icon name="check_circle" className="shrink-0" />
          )}
          <div className="space-y-1 min-w-0">
            <p>
              Pruned {summary.deleted} {summary.deleted === 1 ? 'account' : 'accounts'}
              {summary.failed.length > 0 ? `, ${summary.failed.length} failed.` : '.'}
            </p>
            {summary.failed.length > 0 && (
              <ul className="space-y-0.5">
                {summary.failed.map((f) => (
                  <li key={f.namespace} className="font-mono break-words">
                    @{f.namespace}: {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {isPruning && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-meta text-ink-3">
            <span>
              Deleting accounts... {pruneProgress.done} of {pruneProgress.total}
            </span>
            <span className="font-mono">
              {pruneProgress.total > 0
                ? Math.round((pruneProgress.done / pruneProgress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-wash dark:bg-raised overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all"
              style={{
                width: `${
                  pruneProgress.total > 0
                    ? Math.round((pruneProgress.done / pruneProgress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {scanned && !isScanning && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-ink-3">
              {`${visible.length} dormant ${visible.length === 1 ? 'account' : 'accounts'} matched`}
              {dormant.length !== visible.length ? ` (${dormant.length} total dormant)` : ''}
            </div>
            {visible.length > 0 && (
              <button
                onClick={toggleAllVisible}
                className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline font-medium"
              >
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="card p-10 text-center">
              <Icon name="check_circle" className="icon-2xl text-emerald-500 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-ink mb-1">Nothing to prune</h3>
              <p className="text-xs text-ink-3 max-w-sm mx-auto">
                No dormant accounts matched the current filters. Adjust the options above and scan
                again to widen the search.
              </p>
            </div>
          ) : (
            <>
              <div className="card divide-y divide-line overflow-hidden max-h-96 overflow-y-auto">
                {visible.map((candidate) => {
                  const isChecked = selected.has(candidate.user.namespace);
                  return (
                    <label
                      key={candidate.user.namespace}
                      className="p-3.5 flex items-center gap-3 text-xs cursor-pointer hover:bg-wash dark:hover:bg-raised transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(candidate.user.namespace)}
                        className="rounded accent-lilac-500"
                      />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-ink">@{candidate.user.namespace}</span>
                          {candidate.user.displayName && (
                            <span className="text-ink-2">({candidate.user.displayName})</span>
                          )}
                          {candidate.user.role === 'admin' && (
                            <span className="px-1.5 py-0.2 text-micro font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded">
                              Admin
                            </span>
                          )}
                          {candidate.user.hasPublished && (
                            <span className="px-1.5 py-0.2 text-micro font-medium bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border border-lilac-200 dark:border-lilac-800 rounded">
                              Published
                            </span>
                          )}
                        </div>
                        <div className="text-meta text-ink-3 flex flex-wrap items-center gap-2">
                          <span>{candidate.sessions} sessions</span>
                          <span>•</span>
                          <span>{candidate.tokens} tokens</span>
                          {candidate.user.createdAt && (
                            <>
                              <span>•</span>
                              <span>
                                Member since{' '}
                                {new Date(candidate.user.createdAt).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={handlePrune}
                  disabled={selectedTargets.length === 0 || isPruning}
                  className="btn btn-sm btn-danger disabled:opacity-50"
                >
                  <Icon name="delete" className="icon-sm" />
                  <span>
                    Prune {selectedTargets.length}{' '}
                    {selectedTargets.length === 1 ? 'account' : 'accounts'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
