import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../hooks/useConfirm';
import {
  Organization,
  OrganizationOwner,
  ProfileImages,
  UpdateOrganizationPayload,
} from '../types/api';
import { Icon } from '../components/Icon';
import { ImageUploadField } from '../components/ImageUploadField';
import { WebhookPanel } from '../components/WebhookPanel';
import { toSameOriginImageUrl } from '../lib/profile-image';

interface OrganizationSettingsPageProps {
  namespace: string;
  onNavigate: (route: string) => void;
}

// Avatar/banner/website values are referenced by the registry, so they must be fetchable.
const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Mirrors the registry's GitHub check: a username, never a URL.
const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

/** The registry's namespace rule, so a bad name is refused before the round trip. */
const NAMESPACE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * Everything an owner of an organization can change.
 *
 * The namespace itself is fixed once the organization exists, and the members
 * are changed through the owner list rather than the profile form, so the
 * account settings screen has no counterpart here. An account cannot be an
 * owner of another organization, which the add form says rather than sending
 * a request that would come back a `422`.
 */
export const OrganizationSettingsPage: React.FC<OrganizationSettingsPageProps> = ({
  namespace,
  onNavigate,
}) => {
  const { user, isAuthenticated, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [owners, setOwners] = useState<OrganizationOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [github, setGithub] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [addingOwner, setAddingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  // The list is public, so it only fails on its own. Until it has answered, or
  // if it did not, the refusal below cannot be trusted either way.
  const [ownersKnown, setOwnersKnown] = useState(false);
  const [removingOwner, setRemovingOwner] = useState<string | null>(null);
  const [showWebhooks, setShowWebhooks] = useState(false);

  const applyProfile = useCallback((next: Organization) => {
    setOrganization(next);
    setDisplayName(next.displayName || '');
    setBio(next.bio || '');
    setWebsite(next.website || '');
    setGithub(next.github || '');
    setAvatarUrl(next.avatarUrl || '');
    setBannerUrl(next.bannerUrl || '');
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      setOwners((await api.getOrganizationOwners(namespace)) || []);
      setOwnersKnown(true);
    } catch {
      setOwners([]);
      setOwnersKnown(false);
    }
  }, [namespace]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      onNavigate('login');
    }
  }, [isAuthLoading, isAuthenticated, onNavigate]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const profile = await api.getOrganization(namespace);
        if (isMounted) applyProfile(profile);
      } catch (err: unknown) {
        if (isMounted) {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load organization');
        }
        return;
      } finally {
        if (isMounted) setLoading(false);
      }
      if (isMounted) await loadOwners();
    };
    if (isAuthenticated) load();
    return () => {
      isMounted = false;
    };
  }, [namespace, isAuthenticated, applyProfile, loadOwners]);

  const isOwner = user !== null && owners.some((owner) => owner.namespace === user.namespace);
  // An admin may act for any organization even without being on its list.
  const canManage = isOwner || isAdmin;
  // With no answer, neither the settings nor the refusal is shown: a failed list
  // would otherwise lock out the very owner who is asking.
  const accessKnown = canManage || ownersKnown;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    // The registry validates these server-side; reject the obvious mistakes
    // first so the user gets an inline message instead of a round trip. The
    // limits mirror PATCH /orgs/{namespace} exactly.
    for (const [field, value] of [
      ['Avatar image URL', avatarUrl],
      ['Banner image URL', bannerUrl],
      ['Website', website],
    ] as const) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.length > 400) {
        toastError(`${field} must be 400 characters or fewer.`);
        return;
      }
      if (!isHttpUrl(trimmed)) {
        toastError(`${field} must be an http:// or https:// URL.`);
        return;
      }
    }
    if (displayName.length > 80) {
      toastError('Display name must be 80 characters or fewer.');
      return;
    }
    if (bio.length > 280) {
      toastError('Description must be 280 characters or fewer.');
      return;
    }
    if (github.trim() && !GITHUB_USERNAME.test(github.trim())) {
      toastError('GitHub must be a username, not a URL.');
      return;
    }

    const update: UpdateOrganizationPayload = {};
    if (displayName !== organization.displayName) update.displayName = displayName;
    // Empty means "clear this field", so send null rather than omitting it.
    for (const [key, value, original] of [
      ['bio', bio, organization.bio || ''],
      ['website', website, organization.website || ''],
      ['github', github, organization.github || ''],
      ['avatarUrl', avatarUrl, organization.avatarUrl || ''],
      ['bannerUrl', bannerUrl, organization.bannerUrl || ''],
    ] as const) {
      if (value.trim() !== original) update[key] = value.trim() === '' ? null : value.trim();
    }
    if (Object.keys(update).length === 0) return;

    setSavingProfile(true);
    try {
      applyProfile(await api.updateOrganization(organization.namespace, update));
      toastSuccess('Organization profile updated.');
    } catch (err: unknown) {
      toastError(
        err instanceof ApiError ? err.message : 'Failed to update the organization profile.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleImageUploaded = useCallback(
    (updated: ProfileImages) => {
      setOrganization((prev) =>
        prev
          ? { ...prev, avatarUrl: updated.avatarUrl ?? null, bannerUrl: updated.bannerUrl ?? null }
          : prev,
      );
      toastSuccess('Image updated.');
    },
    [toastSuccess],
  );

  const handleAddOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = ownerInput.trim().toLowerCase().replace(/^@/, '');
    if (!NAMESPACE.test(target)) {
      setOwnerError('Enter a namespace: letters, digits and inner hyphens.');
      return;
    }
    setAddingOwner(true);
    setOwnerError(null);
    try {
      // Idempotent upstream, so a retry needs no bookkeeping here.
      await api.addOrganizationOwner(namespace, target);
      setOwnerInput('');
      await loadOwners();
      toastSuccess(`@${target} can now act for @${namespace}.`);
    } catch (err: unknown) {
      setOwnerError(err instanceof ApiError ? err.message : 'Could not add that owner.');
    } finally {
      setAddingOwner(false);
    }
  };

  const handleRemoveOwner = async (owner: OrganizationOwner) => {
    // The registry refuses to remove the last owner, so the control is not
    // offered for it rather than letting the request come back a 409.
    if (owners.length <= 1) return;
    const confirmed = await confirm({
      title: 'Remove owner',
      message: `@${owner.namespace} loses the right to act for @${namespace}. Anything they published stays, and they are notified.`,
      confirmLabel: 'Remove owner',
      variant: 'danger',
    });
    if (!confirmed) return;

    setRemovingOwner(owner.namespace);
    setOwnerError(null);
    try {
      await api.removeOrganizationOwner(namespace, owner.namespace);
      if (owner.namespace === user?.namespace && !isAdmin) {
        onNavigate(`org/${namespace}`);
      } else {
        await loadOwners();
      }
      toastSuccess(`Removed @${owner.namespace} from @${namespace}.`);
    } catch (err: unknown) {
      setOwnerError(err instanceof ApiError ? err.message : 'Could not remove that owner.');
    } finally {
      setRemovingOwner(null);
    }
  };

  const handleDelete = async () => {
    if (!organization) return;
    const confirmed = await confirm({
      title: 'Delete organization',
      message: `Permanently delete @${organization.namespace} and every extension, version, image and webhook under it. This cannot be undone.`,
      confirmLabel: 'Delete organization',
      variant: 'danger',
      requireText: organization.namespace,
      requireTextLabel: `Type ${organization.namespace} to confirm deletion`,
    });
    if (!confirmed) return;

    try {
      await api.deleteOrganization(organization.namespace);
      toastSuccess(`Deleted @${organization.namespace}.`);
      onNavigate('organizations');
    } catch (err: unknown) {
      toastError(err instanceof ApiError ? err.message : 'Could not delete the organization.');
    }
  };

  // The effect above sends a signed-out visitor to the login page; this is the
  // state between the two.
  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm text-ink-3">Loading...</div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="h-8 w-48 bg-wash dark:bg-raised rounded animate-pulse" />
        <div className="h-64 bg-wash dark:bg-raised rounded-lg border border-line animate-pulse" />
      </div>
    );
  }

  if (loadError || !organization) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="warning" className="icon-3xl text-rose-600 dark:text-rose-400 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Organization Unavailable</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          {loadError || `No organization named @${namespace} exists here.`}
        </p>
        <div className="pt-2">
          <button onClick={() => onNavigate('organizations')} className="btn btn-secondary">
            ← Back to Organizations
          </button>
        </div>
      </div>
    );
  }

  if (!accessKnown) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="warning" className="icon-3xl text-rose-600 dark:text-rose-400 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Owner List Unavailable</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          The owner list for @{organization.namespace} could not be read, so it cannot be said
          whether you may change it. Try again shortly.
        </p>
        <div className="pt-2">
          <button
            onClick={() => onNavigate(`org/${organization.namespace}`)}
            className="btn btn-secondary"
          >
            View @{organization.namespace}
          </button>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="lock" className="icon-3xl text-ink-3 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Not an Owner</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          Only the accounts on @{organization.namespace}&rsquo;s owner list can change it. Ask one
          of them to add you.
        </p>
        <div className="pt-2">
          <button
            onClick={() => onNavigate(`org/${organization.namespace}`)}
            className="btn btn-secondary"
          >
            View @{organization.namespace}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <button
        onClick={() => onNavigate(`org/${organization.namespace}`)}
        className="text-xs text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
      >
        <Icon name="arrow_back" className="icon-sm" />
        Back to @{organization.namespace}
      </button>

      <header className="flex items-center gap-4">
        <img
          src={
            toSameOriginImageUrl(
              organization.avatarUrl || `${api.getBaseUrl()}/orgs/${organization.namespace}/avatar`,
              api.getBaseUrl(),
            ) ?? undefined
          }
          alt={`Avatar for @${organization.namespace}`}
          className="w-14 h-14 rounded-lg object-cover bg-wash dark:bg-raised border border-line"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-display font-semibold text-ink truncate">
            {organization.displayName || organization.namespace}
          </h1>
          <p className="text-xs text-ink-3 font-mono">@{organization.namespace}</p>
        </div>
      </header>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Profile</h2>
        <p className="text-meta text-ink-3">
          The namespace is fixed for the life of the organization. Everything below is what the
          public profile shows.
        </p>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="org-settings-display-name" className="label block mb-1.5">
                Display name
              </label>
              <input
                id="org-settings-display-name"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="org-settings-github" className="label block mb-1.5">
                GitHub username
              </label>
              <input
                id="org-settings-github"
                className="input font-mono"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder="twext"
                maxLength={39}
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <label htmlFor="org-settings-bio" className="label block mb-1.5">
              Description
            </label>
            <textarea
              id="org-settings-bio"
              className="input text-sm"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
            />
          </div>
          <div>
            <label htmlFor="org-settings-website" className="label block mb-1.5">
              Website
            </label>
            <input
              id="org-settings-website"
              type="url"
              className="input"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              maxLength={400}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUploadField
              namespace={organization.namespace}
              kind="avatar"
              label="Avatar image"
              organization
              currentUrl={avatarUrl.trim() || null}
              fallbackUrl={`${api.getBaseUrl()}/orgs/${organization.namespace}/avatar`}
              urlValue={avatarUrl}
              onUrlValueChange={setAvatarUrl}
              onUploaded={handleImageUploaded}
              onRemoved={handleImageUploaded}
              round
            />
            <ImageUploadField
              namespace={organization.namespace}
              kind="banner"
              label="Banner image"
              organization
              currentUrl={bannerUrl.trim() || null}
              fallbackUrl={`${api.getBaseUrl()}/orgs/${organization.namespace}/banner`}
              urlValue={bannerUrl}
              onUrlValueChange={setBannerUrl}
              onUploaded={handleImageUploaded}
              onRemoved={handleImageUploaded}
            />
          </div>
          <div className="pt-2">
            <button type="submit" disabled={savingProfile} className="btn btn-primary btn-sm">
              <Icon name="save" className="icon-sm" />
              <span>{savingProfile ? 'Saving...' : 'Save profile'}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Owners</h2>
        <p className="text-meta text-ink-3">
          Every owner can publish under this namespace, change the profile, edit the owner list and
          delete the organization. Accounts are added by namespace and notified when they are; an
          organization cannot own another organization.
        </p>
        {ownerError && (
          <p
            role="alert"
            className="text-meta text-rose-600 dark:text-rose-400 flex items-start gap-1.5"
          >
            <Icon name="error" className="icon-sm shrink-0 mt-0.5" />
            <span>{ownerError}</span>
          </p>
        )}
        <ul className="divide-y divide-line border border-line rounded-lg">
          {owners.map((owner) => (
            <li key={owner.namespace} className="flex items-center gap-3 p-3 text-xs">
              <img
                src={
                  toSameOriginImageUrl(
                    owner.avatarUrl || `${api.getBaseUrl()}/users/${owner.namespace}/avatar`,
                    api.getBaseUrl(),
                  ) ?? undefined
                }
                alt={`Avatar for @${owner.namespace}`}
                className="w-8 h-8 rounded-full object-cover bg-wash dark:bg-raised border border-line shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ink-2 truncate">
                  {owner.displayName || owner.namespace}
                  <span className="text-ink-3 font-mono ml-1.5">@{owner.namespace}</span>
                </p>
                <p className="text-ink-3">Added {new Date(owner.addedAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleRemoveOwner(owner)}
                disabled={owners.length <= 1 || removingOwner === owner.namespace}
                title={
                  owners.length <= 1
                    ? 'The last owner cannot be removed'
                    : `Remove @${owner.namespace} as an owner`
                }
                aria-label={`Remove @${owner.namespace} as an owner`}
                className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddOwner} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="org-add-owner" className="label block mb-1.5">
              Add an owner by namespace
            </label>
            <input
              id="org-add-owner"
              className="input font-mono"
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value.toLowerCase())}
              placeholder="kane"
              maxLength={39}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" disabled={addingOwner} className="btn btn-secondary btn-sm">
            <Icon name="person_add" className="icon-sm" />
            <span>{addingOwner ? 'Adding...' : 'Add owner'}</span>
          </button>
        </form>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Webhooks</h2>
            <p className="text-meta text-ink-3 mt-0.5 max-w-xl">
              A webhook here watches every extension in the namespace, so a publish, yank,
              deprecation, rejection or owner change reaches it without registering anything per
              extension. Per-extension webhooks are a separate collection and are unaffected.
            </p>
          </div>
          <button onClick={() => setShowWebhooks(true)} className="btn btn-secondary btn-sm">
            <Icon name="webhook" className="icon-sm" />
            Manage webhooks
          </button>
        </div>
      </div>

      <div className="card p-5 border-rose-200 dark:border-rose-900/60 space-y-3">
        <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Danger zone</h2>
        <p className="text-meta text-ink-3 max-w-xl">
          Deleting the organization removes every extension, version, image and webhook under it,
          along with the owner rows. Anything published here is gone for good.
        </p>
        <button
          onClick={handleDelete}
          className="btn btn-sm bg-rose-600 hover:bg-rose-700 text-white"
        >
          <Icon name="delete" className="icon-sm" />
          <span>Delete organization</span>
        </button>
      </div>

      {showWebhooks && (
        <WebhookPanel
          namespace={organization.namespace}
          organization
          onClose={() => setShowWebhooks(false)}
        />
      )}

      {confirmDialog}
    </div>
  );
};
