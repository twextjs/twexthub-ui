import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../services/api';
import { AutomationToken, PaginatedList, Session, User } from '../types/api';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../context/ToastContext';
import { Icon, IconName } from './Icon';

interface AuditItem {
  id: string;
  namespace: string;
  label: string;
}

interface AuditReport {
  scannedUsers: number;
  scannedAt: string;
  expiredSessions: AuditItem[];
  idleSessions: AuditItem[];
  expiredTokens: AuditItem[];
  expiringTokens: AuditItem[];
  pendingTerms: Array<{ namespace: string; accepted: number | null; latest: number }>;
  dormantUsers: Array<{ namespace: string; hasPublished: boolean }>;
}

const IDLE_DAYS = 90;
const EXPIRING_SOON_DAYS = 30;
const MAX_ITEMS_SHOWN = 25;
const SCAN_CONCURRENCY = 6;

async function collectAll<T>(
  fetcher: (params?: { cursor?: string; limit?: number }) => Promise<PaginatedList<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const res = await fetcher(cursor ? { cursor, limit: 50 } : { limit: 50 });
    all.push(...(res?.data || []));
    cursor = res?.pagination?.hasMore ? res.pagination.nextCursor || undefined : undefined;
    guard += 1;
  } while (cursor && guard < 1000);
  return all;
}

function isExpired(date?: string | null): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function isIdle(date?: string | null): boolean {
  if (!date) return false;
  return Date.now() - new Date(date).getTime() > IDLE_DAYS * 24 * 60 * 60 * 1000;
}

const AuditList: React.FC<{ items: AuditItem[] }> = ({ items }) => (
  <ul className="mt-2 border border-line rounded-lg divide-y divide-line max-h-48 overflow-y-auto">
    {items.slice(0, MAX_ITEMS_SHOWN).map((item) => (
      <li key={item.id} className="px-3 py-2 text-meta flex items-center justify-between gap-3">
        <span className="font-mono text-ink-2 truncate">@{item.namespace}</span>
        <span className="text-ink-3 truncate">{item.label}</span>
      </li>
    ))}
    {items.length > MAX_ITEMS_SHOWN && (
      <li className="px-3 py-2 text-meta text-ink-3">+{items.length - MAX_ITEMS_SHOWN} more...</li>
    )}
  </ul>
);

const FindingCard: React.FC<{
  icon: IconName;
  title: string;
  count: number;
  description: string;
  tone?: 'warning' | 'danger' | 'info';
  action?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon, title, count, description, tone = 'info', action, children }) => {
  const toneClass =
    count === 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'danger'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-lilac-600 dark:text-lilac-300';
  return (
    <div className="border border-line rounded-lg p-3.5 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name={icon} className={toneClass} />
          <span className="text-xs font-semibold text-ink">{title}</span>
          <span
            className={`text-micro font-mono font-bold px-1.5 py-0.2 rounded-full ${
              count === 0
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
            }`}
          >
            {count}
          </span>
        </div>
        {count > 0 && action}
      </div>
      <p className="text-meta text-ink-3 leading-relaxed">{description}</p>
      {count > 0 && children}
    </div>
  );
};

export const AuditPanel: React.FC = () => {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setReport(null);
    try {
      const [users, terms] = await Promise.all([
        collectAll<User>((p) => api.getUsers(p)),
        api.getTerms().catch(() => null),
      ]);
      const latestTerms = terms?.version ?? 0;

      const expiredSessions: AuditItem[] = [];
      const idleSessions: AuditItem[] = [];
      const expiredTokens: AuditItem[] = [];
      const expiringTokens: AuditItem[] = [];
      const pendingTerms: AuditReport['pendingTerms'] = [];
      const dormantUsers: AuditReport['dormantUsers'] = [];

      // Organizations come back from `/users` too, and hold neither Terms nor
      // credentials, so every check below would report them wrongly.
      const accounts = users.filter((u) => u.kind !== 'organization');

      if (mountedRef.current) setProgress({ done: 0, total: accounts.length });

      const processUser = async (user: User) => {
        const accepted = user.termsAcceptedVersion ?? null;
        if (latestTerms > 0 && (accepted === null || accepted < latestTerms)) {
          pendingTerms.push({ namespace: user.namespace, accepted, latest: latestTerms });
        }

        try {
          const [sessionRes, tokenRes] = await Promise.all([
            api.getSessions({ namespace: user.namespace }),
            api.getTokens({ namespace: user.namespace }),
          ]);
          const sessions: Session[] = sessionRes?.data || [];
          const tokens: AutomationToken[] = tokenRes?.data || [];

          for (const session of sessions) {
            const label = session.lastUsedAt
              ? `Last used ${new Date(session.lastUsedAt).toLocaleDateString()}`
              : `Created ${new Date(session.createdAt).toLocaleDateString()}`;
            if (isExpired(session.expiresAt)) {
              expiredSessions.push({ id: session.id, namespace: user.namespace, label });
            } else if (isIdle(session.lastUsedAt) || isIdle(session.createdAt)) {
              idleSessions.push({ id: session.id, namespace: user.namespace, label });
            }
          }

          for (const token of tokens) {
            const label = token.name;
            if (isExpired(token.expiresAt)) {
              expiredTokens.push({ id: token.id, namespace: user.namespace, label });
            } else if (token.expiresAt && daysUntil(token.expiresAt) <= EXPIRING_SOON_DAYS) {
              expiringTokens.push({
                id: token.id,
                namespace: user.namespace,
                label: `${token.name} — ${daysUntil(token.expiresAt)}d left`,
              });
            }
          }

          if (sessions.length === 0 && tokens.length === 0) {
            dormantUsers.push({ namespace: user.namespace, hasPublished: user.hasPublished });
          }
        } catch {
          // Skip accounts whose activity could not be inspected.
        }
      };

      // Bounded worker pool: at most SCAN_CONCURRENCY accounts in flight, with
      // parallel getSessions/getTokens requests per account.
      let done = 0;
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < accounts.length) {
          const user = accounts[nextIndex];
          nextIndex += 1;
          await processUser(user);
          done += 1;
          if (mountedRef.current) setProgress({ done, total: accounts.length });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(SCAN_CONCURRENCY, accounts.length) }, () => worker()),
      );

      if (mountedRef.current) {
        setReport({
          scannedUsers: accounts.length,
          scannedAt: new Date().toISOString(),
          expiredSessions,
          idleSessions,
          expiredTokens,
          expiringTokens,
          pendingTerms,
          dormantUsers,
        });
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof ApiError ? err.message : 'Failed to run the health check');
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, []);

  const revokeExpiredSessions = async () => {
    if (!report || report.expiredSessions.length === 0) return;
    const confirmed = await confirm({
      title: 'Revoke expired sessions',
      message: `Revoke ${report.expiredSessions.length} expired session(s)? Those users will need to sign in again.`,
      confirmLabel: 'Revoke sessions',
      variant: 'danger',
    });
    if (!confirmed) return;

    setBusyAction('sessions');
    const revokedIds = new Set<string>();
    for (const item of report.expiredSessions) {
      try {
        await api.revokeSession(item.id);
        revokedIds.add(item.id);
      } catch {
        // ignore individual failures
      }
    }
    if (mountedRef.current) {
      setReport((prev) =>
        prev
          ? {
              ...prev,
              expiredSessions: prev.expiredSessions.filter(
                (session) => !revokedIds.has(session.id),
              ),
            }
          : prev,
      );
      setBusyAction(null);
    }
    toast.success(`Revoked ${revokedIds.size} expired session(s).`);
  };

  const deleteExpiredTokens = async () => {
    if (!report || report.expiredTokens.length === 0) return;
    const confirmed = await confirm({
      title: 'Delete expired tokens',
      message: `Delete ${report.expiredTokens.length} expired automation token(s)? CI jobs using them already cannot authenticate.`,
      confirmLabel: 'Delete tokens',
      variant: 'danger',
    });
    if (!confirmed) return;

    setBusyAction('tokens');
    const deletedIds = new Set<string>();
    for (const item of report.expiredTokens) {
      try {
        await api.deleteToken(item.id);
        deletedIds.add(item.id);
      } catch {
        // ignore individual failures
      }
    }
    if (mountedRef.current) {
      setReport((prev) =>
        prev
          ? {
              ...prev,
              expiredTokens: prev.expiredTokens.filter((token) => !deletedIds.has(token.id)),
            }
          : prev,
      );
      setBusyAction(null);
    }
    toast.success(`Deleted ${deletedIds.size} expired token(s).`);
  };

  const scanPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="card p-5 space-y-4">
      {confirmDialog}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon name="gpp_maybe" className="text-lilac-600 dark:text-lilac-300" />
          <div>
            <h3 className="text-sm font-semibold text-ink">Health check</h3>
            <p className="text-meta text-ink-3 max-w-xl leading-relaxed">
              Scans every account for expired sign-ins, unused access keys, unaccepted terms, and
              dormant accounts. Findings are informational unless an action is offered.
            </p>
          </div>
        </div>
        <button
          onClick={scan}
          disabled={scanning || busyAction !== null}
          className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"
        >
          <Icon name="refresh" className={`icon-sm ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Checking...' : 'Check now'}</span>
        </button>
      </div>

      {scanning && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-meta text-ink-3">
            <span>
              Inspecting accounts... {progress.done} of {progress.total}
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

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <Icon name="warning" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && !scanning && (
        <div className="space-y-3">
          <div className="text-meta text-ink-3">
            Audited {report.scannedUsers} account(s) at{' '}
            {new Date(report.scannedAt).toLocaleTimeString()}.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FindingCard
              icon="laptop"
              title="Expired sessions"
              count={report.expiredSessions.length}
              tone="danger"
              description="Sessions past their expiry that are still listed. Safe to revoke."
              action={
                <button
                  onClick={revokeExpiredSessions}
                  disabled={busyAction !== null}
                  className="btn btn-danger btn-sm disabled:opacity-50"
                >
                  {busyAction === 'sessions' ? (
                    <Icon name="progress_activity" className="icon-sm animate-spin" />
                  ) : (
                    <Icon name="delete" className="icon-sm" />
                  )}
                  <span>Revoke all</span>
                </button>
              }
            >
              <AuditList items={report.expiredSessions} />
            </FindingCard>

            <FindingCard
              icon="key"
              title="Expired tokens"
              count={report.expiredTokens.length}
              tone="danger"
              description="Automation tokens past their expiry. Safe to delete."
              action={
                <button
                  onClick={deleteExpiredTokens}
                  disabled={busyAction !== null}
                  className="btn btn-danger btn-sm disabled:opacity-50"
                >
                  {busyAction === 'tokens' ? (
                    <Icon name="progress_activity" className="icon-sm animate-spin" />
                  ) : (
                    <Icon name="delete" className="icon-sm" />
                  )}
                  <span>Delete all</span>
                </button>
              }
            >
              <AuditList items={report.expiredTokens} />
            </FindingCard>

            <FindingCard
              icon="schedule"
              title="Idle sessions"
              count={report.idleSessions.length}
              tone="warning"
              description={`Sign-ins untouched for over ${IDLE_DAYS} days. Review and revoke if unexpected.`}
            >
              <AuditList items={report.idleSessions} />
            </FindingCard>

            <FindingCard
              icon="key"
              title={`Tokens expiring within ${EXPIRING_SOON_DAYS} days`}
              count={report.expiringTokens.length}
              tone="warning"
              description="Remind owners to rotate these before they lapse."
            >
              <AuditList items={report.expiringTokens} />
            </FindingCard>

            <FindingCard
              icon="monitoring"
              title="Terms not accepted"
              count={report.pendingTerms.length}
              tone="warning"
              description="Accounts that have not accepted the current terms revision."
            >
              <ul className="mt-2 border border-line rounded-lg divide-y divide-line max-h-48 overflow-y-auto">
                {report.pendingTerms.slice(0, MAX_ITEMS_SHOWN).map((item) => (
                  <li
                    key={item.namespace}
                    className="px-3 py-2 text-meta flex items-center justify-between gap-3"
                  >
                    <span className="font-mono text-ink-2">@{item.namespace}</span>
                    <span className="text-ink-3">
                      {item.accepted === null ? 'never accepted' : `v${item.accepted}`} → v
                      {item.latest}
                    </span>
                  </li>
                ))}
              </ul>
            </FindingCard>

            <FindingCard
              icon="monitoring"
              title="Dormant accounts"
              count={report.dormantUsers.length}
              tone="info"
              description="No sessions and no tokens. Use the Prune tool below to remove them."
            >
              <ul className="mt-2 border border-line rounded-lg divide-y divide-line max-h-48 overflow-y-auto">
                {report.dormantUsers.slice(0, MAX_ITEMS_SHOWN).map((item) => (
                  <li
                    key={item.namespace}
                    className="px-3 py-2 text-meta flex items-center justify-between gap-3"
                  >
                    <span className="font-mono text-ink-2">@{item.namespace}</span>
                    {item.hasPublished && <span className="text-ink-3">has published</span>}
                  </li>
                ))}
              </ul>
            </FindingCard>
          </div>

          {report.expiredSessions.length === 0 &&
            report.expiredTokens.length === 0 &&
            report.idleSessions.length === 0 &&
            report.expiringTokens.length === 0 &&
            report.pendingTerms.length === 0 &&
            report.dormantUsers.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <Icon name="check_circle" />
                <span>No issues found. The registry looks healthy.</span>
              </div>
            )}
        </div>
      )}
    </div>
  );
};
