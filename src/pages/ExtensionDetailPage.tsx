import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../hooks/useConfirm';
import { useRecentExtensions, useSavedExtensions } from '../hooks/useCollections';
import {
  Extension,
  ExtensionOwner,
  ExtensionOwnerInvite,
  ExtensionTransfer,
  ExtensionVersion,
  ModerationStatus,
  User,
  VersionInfo,
} from '../types/api';
import { StatusBadge } from '../components/StatusBadge';
import { VersionCompareModal } from '../components/VersionCompareModal';
import { WebhookPanel } from '../components/WebhookPanel';
import { BadgePanel } from '../components/BadgePanel';
import { DistTagPanel } from '../components/DistTagPanel';
import { OwnersPanel } from '../components/OwnersPanel';
import { TransferPanel } from '../components/TransferPanel';
import { DeprecateVersionModal } from '../components/DeprecateVersionModal';
import { Icon } from '../components/Icon';
import { toSameOriginImageUrl } from '../lib/profile-image';

interface ExtensionDetailPageProps {
  namespace: string;
  id: string;
  onNavigate: (route: string) => void;
}

export const ExtensionDetailPage: React.FC<ExtensionDetailPageProps> = ({
  namespace,
  id,
  onNavigate,
}) => {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const { isSaved, toggle } = useSavedExtensions();
  const { record } = useRecentExtensions();
  const [extension, setExtension] = useState<Extension | null>(null);
  const [authorProfile, setAuthorProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [yankingVersion, setYankingVersion] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<VersionInfo | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [versionDetailError, setVersionDetailError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [ownersOpen, setOwnersOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [owners, setOwners] = useState<ExtensionOwner[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ExtensionOwnerInvite[]>([]);
  const [answeringInvite, setAnsweringInvite] = useState<string | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<ExtensionTransfer[]>([]);
  const [answeringTransfer, setAnsweringTransfer] = useState<string | null>(null);
  const [deprecateTarget, setDeprecateTarget] = useState<ExtensionVersion | null>(null);
  const versionRequestRef = useRef<string | null>(null);

  // An invitation is worth nothing until it is accepted, and the only place a
  // caller can accept one is here, so a pending one is announced on the page it
  // was sent for rather than left in the notification alone. An organization
  // holds no inbox of its own, so an account acting for one finds it this way.
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingInvites([]);
      return;
    }
    let isMounted = true;
    api
      .getPendingExtensionOwnerInvites(namespace, id)
      .then((rows) => {
        if (isMounted) setPendingInvites(rows || []);
      })
      .catch(() => {
        // A caller who may not read the inbox simply has no invitations here.
        if (isMounted) setPendingInvites([]);
      });
    return () => {
      isMounted = false;
    };
  }, [namespace, id, isAuthenticated]);

  // A transfer moves the address only once the destination agrees, and the
  // destination can only agree here, so a pending offer is announced on the page
  // it was sent for rather than left in the notification alone.
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingTransfers([]);
      return;
    }
    let isMounted = true;
    api
      .getExtensionTransfers(namespace, id)
      .then((rows) => {
        if (isMounted) setPendingTransfers(rows || []);
      })
      .catch(() => {
        // A caller with no offers to answer simply has none to show.
        if (isMounted) setPendingTransfers([]);
      });
    return () => {
      isMounted = false;
    };
  }, [namespace, id, isAuthenticated]);

  useEffect(() => {
    let isMounted = true;
    setOwners([]);
    api
      .getExtensionOwners(namespace, id)
      .then((rows) => {
        if (isMounted) setOwners(rows || []);
      })
      .catch(() => {
        if (isMounted) setOwners([]);
      });
    return () => {
      isMounted = false;
    };
  }, [namespace, id]);

  const answerTransfer = async (transfer: ExtensionTransfer) => {
    setAnsweringTransfer(transfer.to);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.acceptExtensionTransfer(namespace, id, transfer.to);
      // The extension now lives under the accepting namespace, so follow it
      // rather than leave the page pointed at the address that just moved.
      onNavigate(`ext/${transfer.to}/${id}`);
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Could not accept that transfer.');
      setAnsweringTransfer(null);
    }
  };

  const answerInvite = async (invite: ExtensionOwnerInvite, accept: boolean) => {
    setAnsweringInvite(invite.namespace);
    setActionError(null);
    try {
      if (accept) {
        await api.acceptExtensionOwner(namespace, id, invite.namespace);
        setOwners((await api.getExtensionOwners(namespace, id)) || []);
        setActionSuccess(
          `${invite.kind === 'organization' ? 'The organization' : 'The account'} @${invite.namespace} can now manage this extension.`,
        );
      } else {
        await api.removeExtensionOwner(namespace, id, invite.namespace);
        setActionSuccess(`Invitation to @${invite.namespace} withdrawn.`);
      }
      setPendingInvites((prev) => prev.filter((row) => row.namespace !== invite.namespace));
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Could not answer that invitation.');
    } finally {
      setAnsweringInvite(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchExtension = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getExtension(namespace, id);
        if (isMounted) {
          setExtension(data);
          record(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof ApiError ? err.message : 'Failed to load extension details';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchExtension();
    return () => {
      isMounted = false;
    };
  }, [namespace, id, record]);

  const ownerNamespace = extension?.namespace || namespace;
  const authorNamespace =
    typeof extension?.author === 'object' && extension.author !== null
      ? extension.author.namespace || ownerNamespace
      : ownerNamespace;

  // The manifest's `author` is a free-form string, so the name and face shown
  // here are the ones the account set for itself, not whatever the publisher
  // typed into twext.yml. Until (or unless) that account resolves, the
  // namespace stands in.
  useEffect(() => {
    let isMounted = true;
    setAuthorProfile(null);
    api
      .getUser(authorNamespace)
      .then((profile) => {
        if (isMounted) setAuthorProfile(profile);
      })
      .catch(() => {
        if (isMounted) setAuthorProfile(null);
      });
    return () => {
      isMounted = false;
    };
  }, [authorNamespace]);

  const authorDisplayName = authorProfile?.displayName || authorNamespace;

  const latestVersion =
    extension?.latestVersion || (extension?.versions && extension.versions[0]?.version) || '1.0.0';

  const moderationStatus = extension?.status || 'published';
  const isPending = moderationStatus === 'pending';

  const publishedVersion =
    extension?.versions?.find((v) => v.status === 'published')?.version || extension?.latestVersion;
  const publishedVersionList = (extension?.versions || [])
    .filter((v) => v.status === 'published' || v.status === 'deprecated')
    .map((v) => v.version);
  const loadUrl =
    moderationStatus === 'published' && publishedVersion
      ? `${api.getPublicBaseUrl()}/@${namespace}/${id}/versions/${encodeURIComponent(publishedVersion)}/download`
      : null;

  // TurboWarp only accepts a URL for sandboxed extensions; an unsandboxed one
  // has to be loaded from a file, so the URL shortcut is offered but inert.
  const unsandboxed = extension?.isUnsandboxed === true;
  const unsandboxedHint = "Unsandboxed extensions can't be loaded with a URL. Download it instead.";

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setActionError('Failed to copy to the clipboard.');
    }
  };

  const handleToggleVersion = async (version: string) => {
    if (expandedVersion === version) {
      setExpandedVersion(null);
      versionRequestRef.current = null;
      return;
    }
    setExpandedVersion(version);
    setVersionDetail(null);
    setVersionDetailError(null);
    setLoadingVersion(true);
    versionRequestRef.current = version;
    const requestedVersion = version;
    try {
      const detail = await api.getVersion(namespace, id, version);
      // A newer toggle may have superseded this request; discard stale results.
      if (versionRequestRef.current !== requestedVersion) return;
      setVersionDetail(detail);
    } catch (err: unknown) {
      if (versionRequestRef.current !== requestedVersion) return;
      setVersionDetailError(
        err instanceof ApiError ? err.message : 'Failed to load version metadata',
      );
    } finally {
      if (versionRequestRef.current === requestedVersion) {
        setLoadingVersion(false);
      }
    }
  };

  const handleYankVersion = async (version: string) => {
    if (!extension) return;
    const confirmed = await confirm({
      title: 'Unpublish version',
      message: `Unpublish version ${version} of @${extension.namespace}/${extension.id}? It will be hidden from the site and can no longer be installed.`,
      confirmLabel: 'Unpublish version',
      variant: 'danger',
    });
    if (!confirmed) return;

    setYankingVersion(version);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.yankVersion(extension.namespace, extension.id, version);
      // The detail endpoint only returns published versions, so update the local
      // copy optimistically instead of refetching (which would drop the row and,
      // if it was the last published version, turn the page into a 404).
      setExtension((prev) =>
        prev
          ? {
              ...prev,
              versions: prev.versions?.map((v) =>
                v.version === version ? { ...v, status: 'yanked' as const } : v,
              ),
            }
          : prev,
      );
      setActionSuccess(`Version ${version} has been unpublished.`);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Could not remove the version';
      setActionError(msg);
    } finally {
      setYankingVersion(null);
    }
  };

  const handleUndeprecateVersion = async (ver: ExtensionVersion) => {
    if (!extension) return;
    const confirmed = await confirm({
      title: 'Clear deprecation',
      message: `Clear the deprecation notice on v${ver.version}? It goes back to being an ordinary published version.`,
      confirmLabel: 'Clear deprecation',
    });
    if (!confirmed) return;

    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await api.deprecateVersion(
        extension.namespace,
        extension.id,
        ver.version,
        null,
      );
      setExtension((prev) =>
        prev
          ? {
              ...prev,
              versions: prev.versions?.map((v) =>
                v.version === ver.version
                  ? { ...v, status: updated.status, deprecation: updated.deprecation }
                  : v,
              ),
            }
          : prev,
      );
      if (expandedVersion === ver.version) {
        setVersionDetail(updated);
      }
      setActionSuccess(`Deprecation cleared for version ${ver.version}.`);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to clear deprecation';
      setActionError(msg);
    }
  };

  const handleDeprecationSaved = (
    version: string,
    status: ModerationStatus,
    message: string | null,
  ) => {
    setExtension((prev) =>
      prev
        ? {
            ...prev,
            versions: prev.versions?.map((v) =>
              v.version === version
                ? { ...v, status: status as VersionInfo['status'], deprecation: message }
                : v,
            ),
          }
        : prev,
    );
    setDeprecateTarget(null);
    setActionSuccess(`Version ${version} is now marked deprecated.`);
  };

  const handleDeleteExtension = async () => {
    if (!extension) return;
    const packageName = `@${extension.namespace}/${extension.id}`;
    const confirmed = await confirm({
      title: 'Delete extension',
      message: `Permanently delete ${packageName} and all of its versions. This cannot be undone.`,
      confirmLabel: 'Permanently delete',
      variant: 'danger',
      requireText: packageName,
      requireTextLabel: `Type ${packageName} to confirm deletion`,
    });
    if (!confirmed) return;

    setDeleting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.deleteExtension(extension.namespace, extension.id);
      onNavigate('dashboard');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete extension';
      setActionError(msg);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="h-6 w-32 bg-wash dark:bg-raised rounded animate-pulse" />
        <div className="h-32 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
          <div className="h-64 bg-wash dark:bg-raised border border-line rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !extension) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="warning" className="icon-3xl text-rose-600 dark:text-rose-400 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Extension Not Found</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          {error || `The extension @${namespace}/${id} could not be found on this site.`}
        </p>
        <div className="pt-2">
          <button onClick={() => onNavigate('search')} className="btn btn-secondary">
            ← Back to Explore
          </button>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(
    isAuthenticated &&
    user &&
    (user.namespace === extension.namespace ||
      owners.some((owner) => owner.namespace === user.namespace)),
  );
  const canManage = isOwner || isAdmin;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back button */}
      <button
        onClick={() => onNavigate('search')}
        className="text-xs text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
      >
        <Icon name="arrow_back" className="icon-sm" />
        Back to search results
      </button>

      {/* Action notifications */}
      {actionError && (
        <div data-tone="danger" className="alert items-center text-xs">
          <Icon name="error" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div data-tone="success" className="alert items-center text-xs">
          <Icon name="check_circle" className="shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Moderation Warning if Pending */}
      {pendingInvites.length > 0 && (
        <div data-tone="info" className="alert">
          <Icon name="person_add" className="icon-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="font-semibold block text-sm">
              Waiting on a co-ownership invitation
            </strong>
            <ul className="mt-2 space-y-2">
              {pendingInvites.map((invite) => (
                <li
                  key={invite.namespace}
                  className="flex flex-wrap items-center gap-2 text-xs"
                  data-testid="pending-owner-invite"
                >
                  <span className="text-ink-2">
                    <span className="font-mono">@{invite.namespace}</span>
                    {invite.displayName && (
                      <span className="text-ink-3 ml-1.5">{invite.displayName}</span>
                    )}
                    {invite.kind === 'organization' && (
                      <span className="chip bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60 ml-1.5">
                        organization
                      </span>
                    )}
                    {invite.invitedBy && (
                      <span className="text-ink-3 ml-1.5">invited by @{invite.invitedBy}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => answerInvite(invite, true)}
                      disabled={answeringInvite === invite.namespace}
                      className="btn btn-primary btn-sm"
                    >
                      <Icon name="check" className="icon-sm" />
                      <span>{answeringInvite === invite.namespace ? 'Working...' : 'Accept'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => answerInvite(invite, false)}
                      disabled={answeringInvite === invite.namespace}
                      className="btn btn-secondary btn-sm"
                    >
                      <span>Decline</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-ink-3 leading-relaxed">
              An organization has no session of its own, so accepting here speaks for every account
              on its owner list. Nothing is granted until it is accepted.
            </p>
          </div>
        </div>
      )}

      {/* A transfer moves the address, and only the destination can agree to it. */}
      {pendingTransfers.length > 0 && (
        <div data-tone="info" className="alert">
          <Icon name="swap_horiz" className="icon-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="font-semibold block text-sm">
              Waiting on you to accept a transfer
            </strong>
            <ul className="mt-2 space-y-2">
              {pendingTransfers.map((transfer) => (
                <li
                  key={transfer.to}
                  className="flex flex-wrap items-center gap-2 text-xs"
                  data-testid="pending-transfer"
                >
                  <span className="text-ink-2">
                    <span className="font-mono">@{transfer.to}</span>
                    {transfer.displayName && (
                      <span className="text-ink-3 ml-1.5">{transfer.displayName}</span>
                    )}
                    {transfer.kind === 'organization' && (
                      <span className="chip bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60 ml-1.5">
                        organization
                      </span>
                    )}
                    {transfer.requestedBy && (
                      <span className="text-ink-3 ml-1.5">offered by @{transfer.requestedBy}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => answerTransfer(transfer)}
                    disabled={answeringTransfer === transfer.to}
                    className="btn btn-primary btn-sm"
                  >
                    <Icon name="swap_horiz" className="icon-sm" />
                    <span>
                      {answeringTransfer === transfer.to ? 'Moving...' : 'Accept transfer'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-ink-3 leading-relaxed">
              Accepting moves this extension to the namespace above and points the old address at
              it. The versions, dist-tags, owners, webhooks and download history move with it.
            </p>
          </div>
        </div>
      )}

      {isPending && (
        <div data-tone="warn" className="alert">
          <Icon name="schedule" className="icon-lg shrink-0" />
          <div>
            <strong className="font-semibold block text-sm">Pending Moderation Review</strong>
            <p className="mt-0.5 leading-relaxed">
              This extension (or its latest version) is currently awaiting review by a Twext
              administrator. It is accessible directly via its URL, but will not appear in the
              general public registry search until approved.
            </p>
          </div>
        </div>
      )}

      {/* Main Header Card */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-xs text-ink-3 mb-1">
              <span>@{extension.namespace}</span>
              <span>/</span>
              <span className="font-semibold text-ink-2">{extension.id}</span>
            </div>
            <h1 className="text-2xl font-display font-semibold text-ink">{extension.name}</h1>
            <p className="text-xs text-ink-2 mt-1 max-w-2xl leading-relaxed">
              {extension.shortDescription || extension.description || 'No description provided.'}
            </p>
          </div>

          {/* Badges & Meta */}
          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {moderationStatus !== 'published' && (
                <StatusBadge status={moderationStatus} size="md" />
              )}
              <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono">
                v{latestVersion}
              </span>
              <button
                type="button"
                onClick={() => toggle(extension)}
                aria-pressed={isSaved(extension.namespace, extension.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  isSaved(extension.namespace, extension.id)
                    ? 'border-lilac-300 dark:border-lilac-700 text-lilac-700 dark:text-lilac-300 bg-lilac-50 dark:bg-lilac-950'
                    : 'border-line text-ink-2 hover:bg-wash dark:hover:bg-raised'
                }`}
              >
                <Icon
                  name="bookmark"
                  className="icon-sm"
                  filled={isSaved(extension.namespace, extension.id)}
                />
                <span>{isSaved(extension.namespace, extension.id) ? 'Saved' : 'Save'}</span>
              </button>
            </div>
            {extension.updatedAt && (
              <span className="text-meta text-ink-3 flex items-center gap-1">
                <Icon name="calendar_today" className="icon-xs" />
                Updated {new Date(extension.updatedAt).toLocaleDateString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => setBadgesOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
            >
              <Icon name="image" className="icon-sm" />
              Embed badges
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Main Content & Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Releases */}
        <div className="lg:col-span-2">
          <div className="card p-6 min-h-[320px] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Version History</h2>
              {extension.versions && extension.versions.length >= 2 && (
                <button
                  onClick={() => setCompareOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <Icon name="compare_arrows" className="icon-sm" />
                  Compare versions
                </button>
              )}
            </div>
            {extension.versions && extension.versions.length > 0 ? (
              <div className="divide-y divide-line border border-line rounded-lg">
                {extension.versions.map((ver) => (
                  <div key={ver.version} className="bg-surface dark:bg-raised">
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-ink">
                            v{ver.version}
                          </span>
                          {ver.status !== 'published' && (
                            <StatusBadge status={ver.status} size="sm" />
                          )}
                        </div>
                        {ver.changelog && (
                          <p className="text-xs text-ink-2 mt-1">{ver.changelog}</p>
                        )}
                        {ver.status === 'deprecated' && ver.deprecation && (
                          <p
                            data-tone="warn"
                            className="tone-text text-meta mt-1 flex items-start gap-1"
                          >
                            <Icon name="warning" className="icon-xs shrink-0" />
                            <span>{ver.deprecation}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-meta text-ink-3">
                          {ver.createdAt
                            ? new Date(ver.createdAt).toLocaleDateString()
                            : 'Initial release'}
                        </span>
                        <button
                          onClick={() => handleToggleVersion(ver.version)}
                          title={`Show metadata for v${ver.version}`}
                          aria-label={`Metadata for v${ver.version}`}
                          aria-expanded={expandedVersion === ver.version}
                          className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                        >
                          <Icon name="info" className="icon-sm" />
                        </button>
                        {canManage && ver.status === 'published' && (
                          <button
                            onClick={() => handleYankVersion(ver.version)}
                            disabled={yankingVersion === ver.version}
                            title={`Unpublish v${ver.version}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-meta font-medium text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
                          >
                            <Icon name="block" className="icon-xs" />
                            {yankingVersion === ver.version ? 'Unpublishing...' : 'Unpublish'}
                          </button>
                        )}
                        {canManage &&
                          (ver.status === 'published' || ver.status === 'deprecated') && (
                            <button
                              onClick={() =>
                                ver.status === 'deprecated'
                                  ? handleUndeprecateVersion(ver)
                                  : setDeprecateTarget(ver)
                              }
                              title={
                                ver.status === 'deprecated'
                                  ? `Clear the deprecation on v${ver.version}`
                                  : `Mark v${ver.version} as deprecated`
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-meta font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                            >
                              <Icon name="warning" className="icon-xs" />
                              {ver.status === 'deprecated' ? 'Undeprecate' : 'Deprecate'}
                            </button>
                          )}
                      </div>
                    </div>

                    {expandedVersion === ver.version && (
                      <div className="px-4 pb-4">
                        <div className="border border-line rounded-lg bg-wash dark:bg-raised p-3 text-meta space-y-1.5">
                          {loadingVersion ? (
                            <p className="text-ink-3">Loading version metadata...</p>
                          ) : versionDetailError ? (
                            <p className="text-rose-700 dark:text-rose-400">{versionDetailError}</p>
                          ) : versionDetail ? (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-ink-3">
                                  Status:{' '}
                                  <strong className="text-ink-2 font-mono">
                                    {versionDetail.status}
                                  </strong>
                                </span>
                                {versionDetail.license && (
                                  <span className="text-ink-3">
                                    License:{' '}
                                    <strong className="text-ink-2 font-mono">
                                      {versionDetail.license}
                                    </strong>
                                  </span>
                                )}
                                {versionDetail.author && (
                                  <span className="text-ink-3">
                                    Author:{' '}
                                    <strong className="text-ink-2">{versionDetail.author}</strong>
                                  </span>
                                )}
                                {versionDetail.createdAt && (
                                  <span className="text-ink-3">
                                    Created:{' '}
                                    <strong className="text-ink-2">
                                      {new Date(versionDetail.createdAt).toLocaleString()}
                                    </strong>
                                  </span>
                                )}
                                {versionDetail.publishedAt && (
                                  <span className="text-ink-3">
                                    Published:{' '}
                                    <strong className="text-ink-2">
                                      {new Date(versionDetail.publishedAt).toLocaleString()}
                                    </strong>
                                  </span>
                                )}
                              </div>
                              {versionDetail.dist?.downloadUrl && (
                                <div className="pt-1">
                                  <div className="text-ink-3 mb-1">Download URL</div>
                                  <div className="flex items-center gap-2">
                                    <code className="flex-1 min-w-0 truncate text-ink bg-surface dark:bg-surface border border-line rounded px-2 py-1">
                                      {versionDetail.dist.downloadUrl}
                                    </code>
                                    <button
                                      onClick={() => handleCopy(versionDetail.dist!.downloadUrl)}
                                      className="btn btn-secondary btn-sm shrink-0"
                                    >
                                      {copiedUrl ? (
                                        <Icon name="check" className="icon-xs" />
                                      ) : (
                                        <Icon name="content_copy" className="icon-xs" />
                                      )}
                                      <span>Copy</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 border border-line rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-ink">v{latestVersion}</span>
                  {moderationStatus !== 'published' && (
                    <StatusBadge status={moderationStatus} size="sm" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-meta text-ink-3">Current version</span>
                  {canManage && moderationStatus === 'published' && (
                    <button
                      onClick={() => handleYankVersion(latestVersion)}
                      disabled={yankingVersion === latestVersion}
                      title={`Unpublish v${latestVersion}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-meta font-medium text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50"
                    >
                      <Icon name="block" className="icon-xs" />
                      {yankingVersion === latestVersion ? 'Unpublishing...' : 'Unpublish'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Load & Author Details */}
        <div className="space-y-6">
          {/* TurboWarp Load Snippet */}
          {loadUrl && (
            <div className="card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Icon name="open_in_new" className="text-lilac-500 dark:text-lilac-300" />
                <h2 className="label">Load in TurboWarp</h2>
              </div>
              <p className="text-xs text-ink-2 leading-relaxed">
                Paste this URL into TurboWarp under{' '}
                <strong>Add Extension → Custom Extension</strong>:
              </p>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={loadUrl}
                  className="input font-mono pl-3 pr-9 py-2 text-xs select-all"
                />
                <button
                  onClick={() => handleCopy(loadUrl)}
                  className="absolute right-1.5 top-1.5 p-1 text-ink-3 hover:text-ink rounded-md hover:bg-wash transition-colors"
                  title="Copy URL"
                >
                  {copiedUrl ? (
                    <Icon name="check" className="icon-sm text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Icon name="content_copy" className="icon-sm" />
                  )}
                </button>
              </div>

              <div className="pt-1 space-y-2">
                {unsandboxed ? (
                  <span title={unsandboxedHint} className="block">
                    <button
                      type="button"
                      disabled
                      className="btn btn-primary w-full opacity-50 cursor-not-allowed"
                    >
                      <span>Open directly in TurboWarp</span>
                      <Icon name="open_in_new" className="icon-sm" />
                    </button>
                  </span>
                ) : (
                  <a
                    href={`https://turbowarp.org/editor?extension=${encodeURIComponent(loadUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary w-full"
                  >
                    <span>Open directly in TurboWarp</span>
                    <Icon name="open_in_new" className="icon-sm" />
                  </a>
                )}
                <a
                  href={loadUrl}
                  download={`${namespace}-${id}-${publishedVersion}.js`}
                  className="btn btn-secondary w-full"
                >
                  <span>Download instead</span>
                  <Icon name="download" className="icon-sm" />
                </a>
              </div>
            </div>
          )}

          {/* Author Card */}
          <div className="card p-5 space-y-3">
            <h2 className="label">Author</h2>
            <div className="flex items-center gap-3">
              <img
                src={
                  toSameOriginImageUrl(
                    authorProfile?.avatarUrl ||
                      `${api.getBaseUrl()}/users/${authorNamespace}/avatar`,
                    api.getBaseUrl(),
                  ) ?? undefined
                }
                alt={`Avatar for @${authorNamespace}`}
                className="w-10 h-10 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
              />
              <div>
                <h3 className="text-sm font-semibold text-ink">{authorDisplayName}</h3>
                <div className="text-xs text-ink-3 font-mono">@{authorNamespace}</div>
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <button
                onClick={() => onNavigate(`author/${encodeURIComponent(authorNamespace)}`)}
                className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline font-medium flex items-center gap-1"
              >
                <Icon name="person" className="icon-sm" />
                View all packages by @{authorNamespace}
              </button>
            </div>
          </div>

          {/* Manage Card (owners & admins) */}
          {canManage && (
            <div className="card p-5 space-y-3 border-rose-200 dark:border-rose-900/60">
              <div className="flex items-center gap-2">
                <Icon name="gpp_maybe" className="text-rose-600 dark:text-rose-400" />
                <h2 className="label">Manage Extension</h2>
              </div>
              <p className="text-xs text-ink-2 leading-relaxed">
                {isOwner ? 'You own' : 'You administer'} @{extension.namespace}/{extension.id}.
                Unpublishing a version hides it from new installs; deleting the extension
                permanently removes every version and its compiled code.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTagsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <Icon name="sell" className="icon-sm" />
                  Dist-tags
                </button>
                <button
                  onClick={() => setOwnersOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <Icon name="group" className="icon-sm" />
                  Owners
                </button>
                <button
                  onClick={() => setTransferOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <Icon name="swap_horiz" className="icon-sm" />
                  Transfer
                </button>
                <button
                  onClick={() => setWebhooksOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <Icon name="webhook" className="icon-sm" />
                  Manage webhooks
                </button>
                <button
                  onClick={handleDeleteExtension}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Icon name="delete" className="icon-sm" />
                  {deleting ? 'Deleting...' : 'Delete extension'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {compareOpen && extension.versions && extension.versions.length >= 2 && (
        <VersionCompareModal
          namespace={extension.namespace}
          id={extension.id}
          versions={extension.versions}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {webhooksOpen && (
        <WebhookPanel
          namespace={extension.namespace}
          id={extension.id}
          onClose={() => setWebhooksOpen(false)}
        />
      )}

      {badgesOpen && (
        <BadgePanel
          namespace={extension.namespace}
          id={extension.id}
          onClose={() => setBadgesOpen(false)}
        />
      )}

      {ownersOpen && (
        <OwnersPanel
          namespace={extension.namespace}
          id={extension.id}
          canManage={canManage}
          onClose={() => setOwnersOpen(false)}
        />
      )}

      {transferOpen && (
        <TransferPanel
          namespace={extension.namespace}
          id={extension.id}
          onClose={() => setTransferOpen(false)}
        />
      )}

      {tagsOpen && (
        <DistTagPanel
          namespace={extension.namespace}
          id={extension.id}
          publishedVersions={publishedVersionList}
          onClose={() => setTagsOpen(false)}
        />
      )}

      {deprecateTarget && (
        <DeprecateVersionModal
          namespace={extension.namespace}
          id={extension.id}
          version={deprecateTarget.version}
          currentMessage={deprecateTarget.deprecation}
          onClose={() => setDeprecateTarget(null)}
          onSaved={(status, message) =>
            handleDeprecationSaved(deprecateTarget.version, status, message)
          }
        />
      )}

      {confirmDialog}
    </div>
  );
};
