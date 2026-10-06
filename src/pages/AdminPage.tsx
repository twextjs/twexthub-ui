import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../services/api';
import { SourceReviewModal } from '../components/SourceReviewModal';
import { UserActivityModal } from '../components/UserActivityModal';
import { MarkdownEditorModal } from '../components/MarkdownEditorModal';
import { MarkdownView } from '../components/MarkdownView';
import { PrunePanel } from '../components/PrunePanel';
import { AuditPanel } from '../components/AuditPanel';
import { AuditLogPanel } from '../components/AuditLogPanel';
import { QuotaModal } from '../components/QuotaModal';
import { BroadcastPanel } from '../components/BroadcastPanel';
import { MetricsModal } from '../components/MetricsModal';
import { ExportPanel } from '../components/ExportPanel';
import { OrganizationsPanel } from '../components/OrganizationsPanel';
import { ServerConfigPanel } from '../components/ServerConfigPanel';
import { useConfirm } from '../hooks/useConfirm';
import { toSameOriginImageUrl } from '../lib/profile-image';
import {
  PendingVersion,
  ExtensionSummary,
  User,
  InstanceStats,
  Pagination,
  TermsDoc,
  PrivacyDoc,
  UserRole,
} from '../types/api';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';

interface AdminPageProps {
  onNavigate: (route: string) => void;
}

type AdminTab =
  | 'moderation'
  | 'catalog'
  | 'users'
  | 'organizations'
  | 'policies'
  | 'audit'
  | 'maintenance'
  | 'server';

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>('moderation');
  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Moderation state
  const [pendingVersions, setPendingVersions] = useState<PendingVersion[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isLoadingMorePending, setIsLoadingMorePending] = useState(false);
  const [pendingPagination, setPendingPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });
  const [reviewingVersionId, setReviewingVersionId] = useState<string | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<PendingVersion | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedPendingDetail, setSelectedPendingDetail] = useState<PendingVersion | null>(null);

  // Catalog state
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(false);
  const [isLoadingMoreExtensions, setIsLoadingMoreExtensions] = useState(false);
  const [catalogPagination, setCatalogPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });
  const [catalogSearch, setCatalogSearch] = useState('');

  // Users state
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingMoreUsers, setIsLoadingMoreUsers] = useState(false);
  const [usersPagination, setUsersPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });
  const [userSearch, setUserSearch] = useState('');
  const [updatingUserNamespace, setUpdatingUserNamespace] = useState<string | null>(null);
  const [activityUser, setActivityUser] = useState<User | null>(null);
  const [quotaUser, setQuotaUser] = useState<User | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);

  // Policy docs state
  const [termsDoc, setTermsDoc] = useState<TermsDoc | null>(null);
  const [privacyDoc, setPrivacyDoc] = useState<PrivacyDoc | null>(null);
  const [termsText, setTermsText] = useState('');
  const [privacyText, setPrivacyText] = useState('');
  const [isSavingTerms, setIsSavingTerms] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [policyEditor, setPolicyEditor] = useState<'terms' | 'privacy' | null>(null);

  // Load stats
  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const data = await api.getStats();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Load moderation queue
  const fetchPending = useCallback(
    async (cursor?: string) => {
      if (cursor) setIsLoadingMorePending(true);
      else setIsLoadingPending(true);
      try {
        const res = await api.listVersionsForReview(cursor ? { cursor } : undefined);
        const page = res?.data || [];
        setPendingVersions((prev) => (cursor ? [...prev, ...page] : page));
        setPendingPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to fetch pending versions';
        toastError(msg);
      } finally {
        if (cursor) setIsLoadingMorePending(false);
        else setIsLoadingPending(false);
      }
    },
    [toastError],
  );

  // Load extensions
  const fetchExtensions = useCallback(
    async (query = '', cursor?: string) => {
      if (cursor) setIsLoadingMoreExtensions(true);
      else setIsLoadingExtensions(true);
      try {
        const res = query
          ? await api.searchExtensions(query, cursor ? { cursor, limit: 50 } : { limit: 50 })
          : await api.getExtensions(cursor ? { cursor, limit: 50 } : { limit: 50 });
        const page = res?.data || [];
        setExtensions((prev) => (cursor ? [...prev, ...page] : page));
        setCatalogPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to fetch extensions';
        toastError(msg);
      } finally {
        if (cursor) setIsLoadingMoreExtensions(false);
        else setIsLoadingExtensions(false);
      }
    },
    [toastError],
  );

  // Load users
  const fetchUsers = useCallback(
    async (cursor?: string) => {
      if (cursor) setIsLoadingMoreUsers(true);
      else setIsLoadingUsers(true);
      try {
        const res = await api.getUsers(cursor ? { cursor, limit: 50 } : { limit: 50 });
        // The registry lists organizations through `/users` too, since a
        // namespace is either. They have no role, Terms, sessions or quota, so
        // the account controls mean nothing for them; they are on their own tab.
        const page = (res?.data || []).filter((row) => row.kind !== 'organization');
        setUsersList((prev) => (cursor ? [...prev, ...page] : page));
        setUsersPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to fetch users';
        toastError(msg);
      } finally {
        if (cursor) setIsLoadingMoreUsers(false);
        else setIsLoadingUsers(false);
      }
    },
    [toastError],
  );

  // Load policies
  const fetchPolicies = useCallback(async () => {
    try {
      const [terms, privacy] = await Promise.all([
        api.getTerms().catch(() => null),
        api.getPrivacy().catch(() => null),
      ]);
      if (terms) {
        setTermsDoc(terms);
        setTermsText(terms.body);
      }
      if (privacy) {
        setPrivacyDoc(privacy);
        setPrivacyText(privacy.body);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchPending();
      fetchExtensions();
      fetchUsers();
      fetchPolicies();
    }
  }, [isAdmin, fetchStats, fetchPending, fetchExtensions, fetchUsers, fetchPolicies]);

  // Handle Review: Approve
  const handleApprove = async (item: PendingVersion) => {
    const targetNs = item.ownerNamespace || item.namespace;
    setReviewingVersionId(item.id + item.version);
    try {
      await api.reviewVersion(targetNs, item.id, item.version, {
        status: 'approved',
      });
      toastSuccess(
        `Version v${item.version} of @${targetNs}/${item.id} has been approved and published!`,
      );
      setPendingVersions((prev) =>
        prev.filter((p) => !(p.id === item.id && p.version === item.version)),
      );
      fetchStats();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to approve version';
      toastError(msg);
    } finally {
      setReviewingVersionId(null);
    }
  };

  // Handle Review: Reject
  const handleRejectConfirm = async () => {
    if (!rejectModalItem) return;
    const item = rejectModalItem;
    const targetNs = item.ownerNamespace || item.namespace;
    setReviewingVersionId(item.id + item.version);
    try {
      await api.reviewVersion(targetNs, item.id, item.version, {
        status: 'rejected',
        reason: rejectReason.trim() || 'Submission does not meet registry guidelines.',
      });
      toastSuccess(`Version v${item.version} of @${targetNs}/${item.id} was rejected.`);
      setPendingVersions((prev) =>
        prev.filter((p) => !(p.id === item.id && p.version === item.version)),
      );
      setRejectModalItem(null);
      setRejectReason('');
      fetchStats();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to reject version';
      toastError(msg);
    } finally {
      setReviewingVersionId(null);
    }
  };

  // Handle Yank Version
  const handleYankVersion = async (ext: ExtensionSummary, version: string) => {
    const confirmed = await confirm({
      title: 'Unpublish version',
      message: `Unpublish version ${version} of @${ext.namespace}/${ext.id}? It will be hidden from listings and can no longer be installed.`,
      confirmLabel: 'Unpublish version',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.yankVersion(ext.namespace, ext.id, version);
      toastSuccess(`Unpublished version ${version} of @${ext.namespace}/${ext.id}.`);
      fetchExtensions(catalogSearch);
      fetchStats();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Could not remove the version';
      toastError(msg);
    }
  };

  // Handle Delete Extension
  const handleDeleteExtension = async (ext: ExtensionSummary) => {
    const packageName = `@${ext.namespace}/${ext.id}`;
    const confirmed = await confirm({
      title: 'Delete extension',
      message: `Permanently delete ${packageName} and all of its versions from the registry. This cannot be undone.`,
      confirmLabel: 'Permanently delete',
      variant: 'danger',
      requireText: packageName,
      requireTextLabel: `Type ${packageName} to confirm deletion`,
    });
    if (!confirmed) return;
    try {
      await api.deleteExtension(ext.namespace, ext.id);
      toastSuccess(`Extension @${ext.namespace}/${ext.id} has been permanently deleted.`);
      setExtensions((prev) =>
        prev.filter((e) => !(e.namespace === ext.namespace && e.id === ext.id)),
      );
      fetchStats();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete extension';
      toastError(msg);
    }
  };

  // Handle Change User Role
  const handleToggleUserRole = async (targetUser: User) => {
    const newRole: UserRole = targetUser.role === 'admin' ? 'normal' : 'admin';
    if (targetUser.namespace === user?.namespace && newRole === 'normal') {
      const confirmed = await confirm({
        title: 'Remove your admin access',
        message: 'You are about to give up administrator access on your own account. Continue?',
        confirmLabel: 'Remove access',
        variant: 'danger',
      });
      if (!confirmed) return;
    } else {
      const confirmed = await confirm({
        title: newRole === 'admin' ? 'Give admin access' : 'Remove admin access',
        message:
          newRole === 'admin'
            ? `Give @${targetUser.namespace} access to help manage the site?`
            : `Remove @${targetUser.namespace}'s access to manage the site?`,
        confirmLabel: newRole === 'admin' ? 'Give access' : 'Remove access',
        variant: newRole === 'admin' ? 'default' : 'danger',
      });
      if (!confirmed) return;
    }

    setUpdatingUserNamespace(targetUser.namespace);
    try {
      const updated = await api.updateUserRole(targetUser.namespace, { role: newRole });
      setUsersList((prev) =>
        prev.map((u) =>
          u.namespace === targetUser.namespace ? { ...u, role: updated.role || newRole } : u,
        ),
      );
      toastSuccess(
        newRole === 'admin'
          ? `@${targetUser.namespace} can now help manage the site.`
          : `@${targetUser.namespace}'s admin access was removed.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Could not update this account';
      toastError(msg);
    } finally {
      setUpdatingUserNamespace(null);
    }
  };

  // Handle Delete Account
  const handleDeleteUser = async (targetUser: User) => {
    const confirmed = await confirm({
      title: 'Delete account',
      message: `Permanently delete @${targetUser.namespace}, their extensions, and all of their versions. This cannot be undone.`,
      confirmLabel: 'Permanently delete',
      variant: 'danger',
      requireText: targetUser.namespace,
      requireTextLabel: `Type ${targetUser.namespace} to confirm account deletion`,
    });
    if (!confirmed) return;
    setUpdatingUserNamespace(targetUser.namespace);
    try {
      await api.deleteUser(targetUser.namespace);
      toastSuccess(`Account @${targetUser.namespace} has been permanently deleted.`);
      setUsersList((prev) => prev.filter((u) => u.namespace !== targetUser.namespace));
      fetchStats();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete account';
      toastError(msg);
    } finally {
      setUpdatingUserNamespace(null);
    }
  };

  // Handle Save Terms
  const handleSaveTerms = async (body: string) => {
    setIsSavingTerms(true);
    try {
      const updated = await api.updateTerms(body);
      setTermsDoc(updated);
      setTermsText(updated.body);
      toastSuccess(`Terms of Service updated to revision #${updated.version}.`);
    } finally {
      setIsSavingTerms(false);
    }
  };

  // Handle Save Privacy
  const handleSavePrivacy = async (body: string) => {
    setIsSavingPrivacy(true);
    try {
      const updated = await api.updatePrivacyPolicy(body);
      setPrivacyDoc(updated);
      setPrivacyText(updated.body);
      toastSuccess(`Privacy Policy updated to revision #${updated.version}.`);
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  // The listing endpoint takes no query, so the search narrows what has been
  // loaded. The organizations tab searches the same way, and says nothing
  // false about it.
  const userNeedle = userSearch.trim().toLowerCase();
  const visibleUsers = userNeedle
    ? usersList.filter(
        (u) =>
          u.namespace.toLowerCase().includes(userNeedle) ||
          (u.displayName || '').toLowerCase().includes(userNeedle),
      )
    : usersList;

  // Permission check
  if (!isAuthLoading && (!isAuthenticated || !isAdmin)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-4 border border-rose-200 dark:border-rose-900/50">
          <Icon name="lock" className="icon-xl" />
        </div>
        <h1 className="text-xl font-display font-semibold text-ink mb-2">Administrators only</h1>
        <p className="text-sm text-ink-3 mb-6 leading-relaxed">
          This area is for administrators. Sign in with an administrator account to review
          submissions, extensions, and accounts.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => onNavigate('home')} className="btn btn-secondary">
            Back to home
          </button>
          {!isAuthenticated && (
            <button onClick={() => onNavigate('login')} className="btn btn-primary">
              Sign in
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Admin Header & Live System Status */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-display font-semibold text-ink">Administration</h1>
            <p className="text-xs text-ink-3">
              Signed in as <strong className="text-ink">@{user?.namespace}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchStats();
                if (activeTab === 'moderation') fetchPending();
                if (activeTab === 'catalog') fetchExtensions(catalogSearch);
                if (activeTab === 'users') fetchUsers();
                if (activeTab === 'policies') fetchPolicies();
              }}
              disabled={isLoadingStats || isLoadingPending || isLoadingExtensions}
              className="btn btn-secondary btn-sm"
            >
              <Icon name="refresh" className={`icon-sm ${isLoadingStats ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* System Metric Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-line border border-line rounded-lg overflow-hidden mt-6">
          <div className="bg-surface p-3.5">
            <div className="label text-ink-3">Pending</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink">
              {stats?.pending ?? pendingVersions.length}
            </div>
          </div>

          <div className="bg-surface p-3.5">
            <div className="label text-ink-3">Published</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink">
              {stats?.published ?? extensions.length}
            </div>
          </div>

          <div className="bg-surface p-3.5">
            <div className="label text-ink-3">Authors</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink">
              {stats?.authors ?? usersList.length}
            </div>
          </div>

          <div className="bg-surface p-3.5">
            <div className="label text-ink-3">Downloads</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink">
              {(stats?.downloads ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-surface p-3.5">
            <div className="label text-ink-3">Terms</div>
            <div className="mt-1 font-mono text-lg font-semibold text-ink">
              v{termsDoc?.version ?? 1}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex border-b border-line gap-2">
        <button
          onClick={() => setActiveTab('moderation')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'moderation'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="schedule" />
          <span>Awaiting review</span>
          {pendingVersions.length > 0 && (
            <span className="px-1.5 py-0.2 text-micro rounded-full bg-amber-500 text-white font-mono font-bold">
              {pendingVersions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'catalog'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="inventory_2" />
          <span>Extensions</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'users'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="group" />
          <span>Accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('organizations')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'organizations'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="business" />
          <span>Organizations</span>
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'policies'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="tune" />
          <span>Policies</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="monitoring" />
          <span>Activity</span>
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'maintenance'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="build" />
          <span>Maintenance</span>
        </button>

        <button
          onClick={() => setActiveTab('server')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'server'
              ? 'border-lilac-500 dark:border-lilac-300 text-lilac-700 dark:text-lilac-300'
              : 'border-transparent text-ink-3 hover:text-ink'
          }`}
        >
          <Icon name="dns" />
          <span>Server</span>
        </button>
      </div>

      {/* Tab 1: Moderation Queue */}
      {activeTab === 'moderation' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-ink-3">
              {pendingVersions.length} new version{pendingVersions.length === 1 ? '' : 's'} waiting
              for review.
            </div>
            <button
              onClick={() => fetchPending()}
              disabled={isLoadingPending}
              className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline flex items-center gap-1 font-medium"
            >
              <Icon
                name="refresh"
                className={`icon-xs ${isLoadingPending ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>

          {isLoadingPending ? (
            <div className="space-y-3">
              <div className="h-24 card animate-pulse" />
              <div className="h-24 card animate-pulse" />
            </div>
          ) : pendingVersions.length === 0 ? (
            <div className="card p-12 text-center">
              <Icon name="check_circle" className="icon-3xl text-emerald-500 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-ink mb-1">You're all caught up</h3>
              <p className="text-xs text-ink-3 max-w-sm mx-auto">
                Nothing is waiting for review right now. New submissions will appear here as soon as
                they arrive.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingVersions.map((item) => {
                const ns = item.ownerNamespace || item.namespace;
                const isWorking = reviewingVersionId === item.id + item.version;
                return (
                  <div
                    key={`${ns}/${item.id}/${item.version}`}
                    className="card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:border-lilac-400 dark:hover:border-lilac-700"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-ink">{item.name || item.id}</span>
                        <span className="font-mono text-xs text-ink-3">
                          @{ns}/{item.id}
                        </span>
                        <span className="chip bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800 font-mono text-meta">
                          v{item.version}
                        </span>
                        {item.license && (
                          <span className="text-micro uppercase font-mono bg-wash dark:bg-raised text-ink-2 px-1.5 py-0.5 rounded border border-line">
                            {item.license}
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-xs text-ink-2 line-clamp-2">{item.description}</p>
                      )}

                      <div className="text-meta text-ink-3 flex items-center gap-3">
                        <span>
                          Submitted by <strong className="text-ink-2">@{ns}</strong>
                        </span>
                        {item.createdAt && (
                          <span>• {new Date(item.createdAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedPendingDetail(item)}
                        className="btn btn-sm btn-secondary"
                        title="Inspect source code"
                      >
                        <Icon name="visibility" className="icon-sm" />
                        <span>Inspect</span>
                      </button>

                      <button
                        onClick={() => setRejectModalItem(item)}
                        disabled={isWorking}
                        className="px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 rounded-md font-medium flex items-center gap-1 transition-colors"
                      >
                        <Icon name="cancel" className="icon-sm" />
                        <span>Reject</span>
                      </button>

                      <button
                        onClick={() => handleApprove(item)}
                        disabled={isWorking}
                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                      >
                        <Icon name="check_circle" className="icon-sm" />
                        <span>{isWorking ? 'Approving...' : 'Approve'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pendingPagination.hasMore && (
            <div className="pt-2 text-center">
              <button
                onClick={() => fetchPending(pendingPagination.nextCursor || undefined)}
                disabled={isLoadingMorePending}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {isLoadingMorePending ? 'Loading...' : 'Load more submissions'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Extension Catalog Governance */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchExtensions(catalogSearch);
              }}
              className="relative w-full sm:w-80"
            >
              <input
                type="text"
                placeholder="Search extensions..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="input pl-8 pr-3 py-1.5 text-xs"
              />
              <Icon
                name="search"
                className="icon-sm text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
            </form>

            <button
              onClick={() => fetchExtensions(catalogSearch)}
              className="text-xs text-lilac-700 dark:text-lilac-300 font-medium flex items-center gap-1"
            >
              <Icon name="refresh" className="icon-xs" />
              <span>Refresh</span>
            </button>
          </div>

          {isLoadingExtensions ? (
            <div className="space-y-2">
              <div className="h-16 bg-wash dark:bg-raised border border-line rounded animate-pulse" />
              <div className="h-16 bg-wash dark:bg-raised border border-line rounded animate-pulse" />
            </div>
          ) : extensions.length === 0 ? (
            <div className="p-8 text-center bg-surface dark:bg-surface border border-line rounded-lg text-xs text-ink-3">
              No extensions found matching your search.
            </div>
          ) : (
            <div className="divide-y divide-line border border-line rounded-lg bg-surface dark:bg-surface overflow-hidden">
              {extensions.map((ext) => (
                <div
                  key={`${ext.namespace}/${ext.id}`}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink">{ext.name}</span>
                      <span className="font-mono text-ink-3">
                        @{ext.namespace}/{ext.id}
                      </span>
                      {ext.version && (
                        <span className="px-1.5 py-0.2 font-mono text-micro bg-wash dark:bg-raised text-ink-2 rounded border border-line">
                          v{ext.version}
                        </span>
                      )}
                    </div>
                    {ext.description && (
                      <p className="text-ink-2 line-clamp-1 max-w-xl">{ext.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onNavigate(`ext/${ext.namespace}/${ext.id}`)}
                      className="px-2.5 py-1 text-ink-2 bg-wash dark:bg-raised hover:bg-line dark:hover:bg-wash border border-line rounded-md font-medium flex items-center gap-1 transition-colors"
                    >
                      <Icon name="open_in_new" className="icon-xs" />
                      <span>View</span>
                    </button>

                    {ext.version && (
                      <button
                        onClick={() => handleYankVersion(ext, ext.version!)}
                        className="px-2.5 py-1 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 rounded-md font-medium"
                        title="Unpublish the latest version"
                      >
                        Unpublish v{ext.version}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteExtension(ext)}
                      className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                      title="Permanently Delete Extension"
                    >
                      <Icon name="delete" className="icon-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {catalogPagination.hasMore && (
            <div className="pt-2 text-center">
              <button
                onClick={() =>
                  fetchExtensions(catalogSearch, catalogPagination.nextCursor || undefined)
                }
                disabled={isLoadingMoreExtensions}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {isLoadingMoreExtensions ? 'Loading...' : 'Load more extensions'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: User Accounts */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="Search accounts..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="input pl-8 pr-3 py-1.5 text-xs"
              />
              <Icon
                name="search"
                className="icon-sm text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
            </div>

            <button
              onClick={() => fetchUsers()}
              className="text-xs text-lilac-700 dark:text-lilac-300 font-medium flex items-center gap-1"
            >
              <Icon name="refresh" className="icon-xs" />
              <span>Refresh</span>
            </button>
          </div>

          {isLoadingUsers ? (
            <div className="space-y-2">
              <div className="h-14 card animate-pulse" />
              <div className="h-14 card animate-pulse" />
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="card p-6 text-center text-xs text-ink-3">
              {userSearch.trim()
                ? `No account here is called ${userSearch.trim()}.`
                : 'No accounts on this registry yet.'}
            </div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {visibleUsers.map((u) => {
                const isTargetAdmin = u.role === 'admin';
                const isMe = u.namespace === user?.namespace;
                const isUpdating = updatingUserNamespace === u.namespace;

                return (
                  <div key={u.namespace} className="p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={
                            toSameOriginImageUrl(
                              u.avatarUrl || `${api.getBaseUrl()}/users/${u.namespace}/avatar`,
                              api.getBaseUrl(),
                            ) ?? undefined
                          }
                          alt={`Avatar for @${u.namespace}`}
                          className="w-8 h-8 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-ink">@{u.namespace}</span>
                            {u.displayName && <span className="text-ink-2">({u.displayName})</span>}
                            {isTargetAdmin && (
                              <span className="px-1.5 py-0.2 text-micro font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded">
                                Admin
                              </span>
                            )}
                            {isMe && <span className="text-micro text-ink-3 italic">(You)</span>}
                          </div>
                          <div className="text-meta text-ink-3">
                            <span
                              className={
                                u.termsAcceptedVersion
                                  ? undefined
                                  : 'text-amber-700 dark:text-amber-300'
                              }
                            >
                              {u.termsAcceptedVersion
                                ? `Terms accepted (v${u.termsAcceptedVersion})`
                                : 'Terms not accepted'}
                            </span>
                            {u.createdAt && (
                              <span className="ml-2">
                                Created {new Date(u.createdAt).toLocaleDateString()}
                              </span>
                            )}
                            {u.github && <span className="ml-2">GitHub @{u.github}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isMe ? (
                          <button
                            onClick={() => onNavigate('settings')}
                            title="Manage your account in Settings"
                            aria-label="Manage your account in Settings"
                            className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                          >
                            <Icon name="settings" className="icon-sm" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setActivityUser(u)}
                            title={`Account activity for @${u.namespace}`}
                            aria-label={`Account activity for @${u.namespace}`}
                            className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                          >
                            <Icon name="monitoring" className="icon-sm" />
                          </button>
                        )}
                        <button
                          onClick={() => setQuotaUser(u)}
                          title={`Storage for @${u.namespace}`}
                          aria-label={`Storage for @${u.namespace}`}
                          className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                        >
                          <Icon name="storage" className="icon-sm" />
                        </button>
                        <button
                          onClick={() => handleToggleUserRole(u)}
                          disabled={isUpdating}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                            isTargetAdmin
                              ? 'text-ink-2 bg-surface dark:bg-raised border-line hover:bg-wash dark:hover:bg-wash'
                              : 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100'
                          } disabled:opacity-50`}
                        >
                          {isUpdating ? 'Saving...' : isTargetAdmin ? 'Remove admin' : 'Make admin'}
                        </button>

                        {!isMe && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={isUpdating}
                            title={`Permanently delete @${u.namespace}`}
                            aria-label={`Permanently delete @${u.namespace}`}
                            className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors disabled:opacity-50"
                          >
                            <Icon name="delete" className="icon-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {usersPagination.hasMore && (
            <div className="pt-2 text-center">
              <button
                onClick={() => fetchUsers(usersPagination.nextCursor || undefined)}
                disabled={isLoadingMoreUsers}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                {isLoadingMoreUsers ? 'Loading...' : 'Load more accounts'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Organizations */}
      {activeTab === 'organizations' && <OrganizationsPanel onNavigate={onNavigate} />}

      {/* Tab 4: Platform Policies */}
      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Terms of Service */}
          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-ink">
                  Terms of Service (v{termsDoc?.version ?? 1})
                </h3>
                <p className="text-meta text-ink-3">
                  Publishing a new revision may prompt users to re-accept the updated terms.
                </p>
                {termsDoc?.updatedAt && (
                  <p className="text-meta text-ink-3">
                    Last updated {new Date(termsDoc.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPolicyEditor('terms')}
                className="btn btn-primary btn-sm shrink-0"
              >
                <Icon name="edit_note" className="icon-sm" />
                <span>Open Editor</span>
              </button>
            </div>

            <div className="h-72 overflow-auto border border-line rounded-lg bg-wash dark:bg-raised p-4">
              {termsText ? (
                <MarkdownView content={termsText} />
              ) : (
                <p className="text-xs text-ink-3 italic">No terms of service published yet.</p>
              )}
            </div>
          </div>

          {/* Privacy Policy */}
          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-ink">
                  Privacy Policy (v{privacyDoc?.version ?? 1})
                </h3>
                <p className="text-meta text-ink-3">
                  Public privacy statement explaining data retention and user privacy commitments.
                </p>
                {privacyDoc?.updatedAt && (
                  <p className="text-meta text-ink-3">
                    Last updated {new Date(privacyDoc.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPolicyEditor('privacy')}
                className="btn btn-primary btn-sm shrink-0"
              >
                <Icon name="edit_note" className="icon-sm" />
                <span>Open Editor</span>
              </button>
            </div>

            <div className="h-72 overflow-auto border border-line rounded-lg bg-wash dark:bg-raised p-4">
              {privacyText ? (
                <MarkdownView content={privacyText} />
              ) : (
                <p className="text-xs text-ink-3 italic">No privacy policy published yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {policyEditor === 'terms' && (
        <MarkdownEditorModal
          title="Terms of Service"
          version={termsDoc?.version ?? 1}
          value={termsText}
          isSaving={isSavingTerms}
          onClose={() => setPolicyEditor(null)}
          onSave={handleSaveTerms}
        />
      )}

      {policyEditor === 'privacy' && (
        <MarkdownEditorModal
          title="Privacy Policy"
          version={privacyDoc?.version ?? 1}
          value={privacyText}
          isSaving={isSavingPrivacy}
          onClose={() => setPolicyEditor(null)}
          onSave={handleSavePrivacy}
        />
      )}

      {/* Tab 5: Maintenance */}
      {activeTab === 'audit' && <AuditLogPanel onNavigate={onNavigate} />}

      {metricsOpen && <MetricsModal onClose={() => setMetricsOpen(false)} />}

      {quotaUser && (
        <QuotaModal
          namespace={quotaUser.namespace}
          onClose={() => setQuotaUser(null)}
          onSaved={() => toastSuccess(`Updated the storage quota for @${quotaUser.namespace}.`)}
        />
      )}

      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <BroadcastPanel />
          <AuditPanel />
          <ExportPanel />
          <div className="card p-5 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-ink">Feeds and stats</h2>
              <button onClick={() => setMetricsOpen(true)} className="btn btn-secondary btn-sm">
                <Icon name="monitoring" className="icon-sm" />
                <span>View stats</span>
              </button>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed max-w-2xl">
              Follow newly published versions in your feed reader, or open the live server
              statistics.
            </p>
            <div className="pt-1">
              <a
                href={api.getAtomFeedUrl()}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline inline-flex items-center gap-1"
              >
                Atom feed
                <Icon name="open_in_new" className="icon-xs" />
              </a>
            </div>
          </div>
          <PrunePanel
            currentUserNamespace={user?.namespace}
            onPruned={() => {
              fetchUsers();
              fetchStats();
            }}
          />
        </div>
      )}

      {activeTab === 'server' && (
        <div className="space-y-4">
          <ServerConfigPanel />
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalItem && (
        <Modal
          onClose={() => setRejectModalItem(null)}
          size="md"
          labelledById="reject-version-title"
          className="p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
              <Icon name="cancel" />
              <h2 id="reject-version-title" className="font-display">
                Reject this version
              </h2>
            </div>
            <button
              onClick={() => setRejectModalItem(null)}
              className="text-ink-3 hover:text-ink"
              aria-label="Close rejection dialog"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-ink-2">
            You are rejecting version{' '}
            <strong className="text-ink">v{rejectModalItem.version}</strong> of{' '}
            <strong className="text-ink">
              @{rejectModalItem.ownerNamespace || rejectModalItem.namespace}/{rejectModalItem.id}
            </strong>
            . Provide feedback to the author so they know what needs improvement.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="reject-reason" className="label block">
              Feedback for the author:
            </label>
            <textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="For example: the icon is missing, or the code reaches the network without saying so."
              className="input font-mono p-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => setRejectModalItem(null)} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button onClick={handleRejectConfirm} className="btn btn-danger btn-sm">
              Reject version
            </button>
          </div>
        </Modal>
      )}

      {/* Detail / Source Review Modal */}
      {selectedPendingDetail && (
        <SourceReviewModal
          item={selectedPendingDetail}
          onClose={() => setSelectedPendingDetail(null)}
          onApprove={(itm) => {
            setSelectedPendingDetail(null);
            handleApprove(itm);
          }}
          onReject={(itm) => {
            setSelectedPendingDetail(null);
            setRejectModalItem(itm);
          }}
        />
      )}

      {activityUser && (
        <UserActivityModal
          namespace={activityUser.namespace}
          onClose={() => setActivityUser(null)}
        />
      )}

      {confirmDialog}
    </div>
  );
};
