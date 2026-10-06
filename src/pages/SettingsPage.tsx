import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../services/api';
import { ImageUploadField } from '../components/ImageUploadField';
import { useConfirm } from '../hooks/useConfirm';
import {
  AutomationToken,
  Pagination,
  ProfileImages,
  Session,
  TokenScope,
  UpdateUserPayload,
} from '../types/api';
import { Icon, IconName } from '../components/Icon';

/** Avatar/banner/website values are referenced by the registry, so they must be fetchable. */
// Matches the registry's GitHub check: 1-39 characters, alphanumeric with inner
// hyphens only, so a leading or trailing hyphen is rejected before the round trip.
const GITHUB_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

interface SettingsPageProps {
  onNavigate: (route: string) => void;
}

type SettingsTab = 'account' | 'sessions' | 'tokens';

/**
 * The scopes an automation token can carry, in the order the API lists them.
 * Sessions implicitly satisfy every scope, so all of these are offered; the
 * account behind the token still bounds what each one reaches.
 */
const TOKEN_SCOPES: Array<{ value: TokenScope; description: string }> = [
  { value: 'publish', description: 'Allow uploading new extension releases' },
  { value: 'yank', description: 'Allow removing bad releases from the site' },
  { value: 'read:source', description: "Allow reading a version's source code" },
  { value: 'manage:account', description: 'Allow editing the account and its profile' },
  { value: 'manage:orgs', description: 'Allow managing organizations the account owns' },
  { value: 'manage:sessions', description: 'Allow listing and revoking web sessions' },
  { value: 'manage:tokens', description: 'Allow creating and revoking automation tokens' },
  {
    value: 'admin',
    description: 'Allow admin tools and version review (still needs the admin role)',
  },
];

const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'account', label: 'Account', icon: 'person' },
  { id: 'sessions', label: 'Sessions', icon: 'laptop' },
  { id: 'tokens', label: 'Access Tokens', icon: 'key' },
];

// Each section's heading is described once, next to the navigation entry it
// belongs to, so a section cannot be added to the sidebar without a heading over
// its content.
const SECTION_HEADINGS: Record<SettingsTab, { title: string; blurb: string }> = {
  account: {
    title: 'Account',
    blurb: 'The profile visitors see, and the password you sign in with.',
  },
  sessions: {
    title: 'Sessions',
    blurb: 'Devices currently signed in to this account. Revoke anything unfamiliar.',
  },
  tokens: {
    title: 'Automation tokens',
    blurb: 'Credentials for tools that publish on your behalf, outside a browser.',
  },
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    refreshUser,
    logout,
    hasTerms,
    hasAcceptedCurrentTerms,
    acceptCurrentTerms,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const { confirm, confirmDialog } = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [github, setGithub] = useState(user?.github || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl || '');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // An upload or removal returns the authoritative user, so resync rather than
  // guessing: the top bar and the public profile both read these fields.
  const handleImageUploaded = useCallback(
    async (updated: ProfileImages) => {
      setAvatarUrl(updated.avatarUrl || '');
      setBannerUrl(updated.bannerUrl || '');
      await refreshUser();
      toastSuccess('Image updated.');
    },
    [refreshUser, toastSuccess],
  );

  // Sessions & tokens state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tokens, setTokens] = useState<AutomationToken[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [loadingMoreTokens, setLoadingMoreTokens] = useState(false);
  const [sessionsPagination, setSessionsPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });
  const [tokensPagination, setTokensPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });

  // New token form state
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState<TokenScope[]>(['publish']);
  const [tokenExpiry, setTokenExpiry] = useState<string>('never');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdTokenSecret, setCreatedTokenSecret] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Inline token editing state
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editTokenName, setEditTokenName] = useState('');
  const [editTokenScopes, setEditTokenScopes] = useState<TokenScope[]>([]);
  const [savingToken, setSavingToken] = useState(false);

  // The bearer token is an opaque secret unrelated to the `Session.id` (a DB row id),
  // so the current session can't be identified from the token directly. When the API
  // marks the current session we trust that; otherwise fall back to the heuristic that
  // the current session is the one that just authenticated this page's own requests,
  // i.e. the most recently used (`lastUsedAt`) of the account's active sessions.
  const latestSession = useMemo(() => {
    const score = (s: Session) => {
      const used = s.lastUsedAt ? new Date(s.lastUsedAt).getTime() : 0;
      const created = s.createdAt ? new Date(s.createdAt).getTime() : 0;
      return used || created;
    };
    return sessions.reduce<Session | null>(
      (latest, s) => (latest === null || score(s) >= score(latest) ? s : latest),
      null,
    );
  }, [sessions]);

  const isCurrentSession = (sess: Session) => {
    if (typeof sess.isCurrent === 'boolean') return sess.isCurrent;
    return Boolean(latestSession) && latestSession!.id === sess.id;
  };

  const loadSessions = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMoreSessions(true);
      else setLoadingSessions(true);
      try {
        const res = await api.getSessions(cursor ? { cursor } : undefined);
        const page = res?.data || [];
        setSessions((prev) => (cursor ? [...prev, ...page] : page));
        setSessionsPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to fetch sessions';
        toastError(msg);
      } finally {
        if (cursor) setLoadingMoreSessions(false);
        else setLoadingSessions(false);
      }
    },
    [toastError],
  );

  const loadTokens = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMoreTokens(true);
      else setLoadingTokens(true);
      try {
        const res = await api.getTokens(cursor ? { cursor } : undefined);
        const page = res?.data || [];
        setTokens((prev) => (cursor ? [...prev, ...page] : page));
        setTokensPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to fetch tokens';
        toastError(msg);
      } finally {
        if (cursor) setLoadingMoreTokens(false);
        else setLoadingTokens(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      onNavigate('login');
      return;
    }

    if (isAuthenticated) {
      loadSessions();
      loadTokens();
    }
  }, [isAuthenticated, isLoading, onNavigate, loadSessions, loadTokens]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setWebsite(user.website || '');
      setGithub(user.github || '');
      setAvatarUrl(user.avatarUrl || '');
      setBannerUrl(user.bannerUrl || '');
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const updateData: UpdateUserPayload = {};

    // The registry validates these server-side; reject the obvious client-side
    // mistakes first so the user gets an inline message instead of a round trip.
    // The limits and patterns below mirror PATCH /users/{namespace} exactly, so
    // the form never submits something the API will reject with a 422.
    for (const [field, value] of [
      ['Avatar image URL', avatarUrl],
      ['Banner image URL', bannerUrl],
      ['Website', website],
    ] as const) {
      const trimmedValue = value.trim();
      if (!trimmedValue) continue;
      if (trimmedValue.length > 400) {
        toastError(`${field} must be 400 characters or fewer.`);
        return;
      }
      if (!isHttpUrl(trimmedValue)) {
        toastError(`${field} must be an http:// or https:// URL.`);
        return;
      }
    }
    if (displayName.length > 80) {
      toastError('Display name must be 80 characters or fewer.');
      return;
    }
    if (bio.length > 280) {
      toastError('Bio must be 280 characters or fewer.');
      return;
    }
    if (github.trim() && !GITHUB_USERNAME.test(github.trim())) {
      toastError('GitHub must be a username, not a URL.');
      return;
    }

    setSavingProfile(true);

    try {
      if (displayName !== user.displayName) {
        updateData.displayName = displayName;
      }

      // Empty means "clear this field", so send null rather than omitting it.
      const textFields = [
        ['bio', bio, user.bio || ''],
        ['website', website, user.website || ''],
        ['github', github, user.github || ''],
        ['avatarUrl', avatarUrl, user.avatarUrl || ''],
        ['bannerUrl', bannerUrl, user.bannerUrl || ''],
      ] as const;
      for (const [key, value, original] of textFields) {
        if (value.trim() !== original) {
          updateData[key] = value.trim() === '' ? null : value.trim();
        }
      }

      if (newPassword.trim()) {
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters.');
        }
        if (!currentPassword) {
          throw new Error('Enter your current password to set a new one.');
        }
        updateData.password = newPassword;
        updateData.currentPassword = currentPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setSavingProfile(false);
        return;
      }

      await api.updateUser(user.namespace, updateData);
      await refreshUser();
      setNewPassword('');
      setCurrentPassword('');
      toastSuccess('Account profile updated successfully.');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update profile';
      toastError(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = await confirm({
      title: 'Delete account',
      message: `Permanently delete @${user.namespace} and all of its extensions, sessions, and tokens. This action cannot be undone.`,
      confirmLabel: 'Delete account',
      variant: 'danger',
      requireText: user.namespace,
      requireTextLabel: `Type ${user.namespace} to confirm account deletion`,
    });
    if (!confirmed) return;

    try {
      await api.deleteUser(user.namespace);
      await logout();
      onNavigate('home');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete account';
      toastError(msg);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession && isCurrentSession(targetSession)) {
      toastError(
        'Cannot revoke the session currently being used on this device. Please use Logout to sign out.',
      );
      return;
    }

    try {
      await api.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toastSuccess('Session revoked successfully.');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to revoke session';
      toastError(msg);
    }
  };

  const toggleScope = (
    scopes: TokenScope[],
    scope: TokenScope,
    setScopes: (next: TokenScope[]) => void,
  ) => {
    setScopes(scopes.includes(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope]);
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) {
      toastError('Please provide a name for the automation token.');
      return;
    }

    if (newTokenScopes.length === 0) {
      toastError('Select at least one scope for the token.');
      return;
    }

    setCreatingToken(true);

    try {
      const expiresInDays = tokenExpiry === 'never' ? undefined : Number(tokenExpiry);
      const tokenResult = await api.createToken({
        name: newTokenName.trim(),
        scopes: newTokenScopes,
        ...(expiresInDays ? { expiresInDays } : {}),
      });

      if (tokenResult.token) {
        setCreatedTokenSecret(tokenResult.token);
      }
      setNewTokenName('');
      setNewTokenScopes(['publish']);
      setTokenExpiry('never');
      await loadTokens();
      toastSuccess('Automation token generated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create automation token';
      toastError(msg);
    } finally {
      setCreatingToken(false);
    }
  };

  const handleStartEditToken = (tok: AutomationToken) => {
    setEditingTokenId(tok.id);
    setEditTokenName(tok.name);
    setEditTokenScopes(tok.scopes ?? []);
  };

  const handleCancelEditToken = () => {
    setEditingTokenId(null);
    setEditTokenName('');
    setEditTokenScopes([]);
  };

  const handleSaveToken = async () => {
    if (!editingTokenId) return;
    if (!editTokenName.trim()) {
      toastError('Token name is required.');
      return;
    }
    if (editTokenScopes.length === 0) {
      toastError('Select at least one scope for the token.');
      return;
    }

    setSavingToken(true);
    try {
      const updated = await api.updateToken(editingTokenId, {
        name: editTokenName.trim(),
        scopes: editTokenScopes,
      });
      setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      handleCancelEditToken();
      toastSuccess('Automation token updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update automation token';
      toastError(msg);
    } finally {
      setSavingToken(false);
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    const target = tokens.find((t) => t.id === tokenId);
    const confirmed = await confirm({
      title: 'Delete automation token',
      message: `Any CI scripts using${target ? ` "${target.name}"` : ' this token'} will lose access immediately.`,
      confirmLabel: 'Delete token',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteToken(tokenId);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      toastSuccess('Token deleted successfully.');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete token';
      toastError(msg);
    }
  };

  const handleCopySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      toastError('Failed to copy the token to the clipboard.');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="h-16 bg-wash dark:bg-raised rounded-lg animate-pulse" />
        <div className="h-64 bg-wash dark:bg-raised rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-xs text-ink-3">Redirecting to login...</p>
      </div>
    );
  }

  const heading = SECTION_HEADINGS[activeTab];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-[12rem_minmax(0,1fr)]">
        {/* Title and section list down the left, as GitHub lays out settings.
            The list is a navigation, not a tab strip: each entry is a place on
            the page, so it stays where it is and only the panel changes. */}
        <div className="space-y-4">
          <h1 className="text-2xl font-display font-semibold text-ink flex items-center gap-2">
            <Icon name="settings" className="icon-lg text-lilac-500" />
            Settings
          </h1>
          <nav aria-label="Settings sections">
            <ul className="space-y-0.5">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <li key={tab.id}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-lilac-500/15 text-lilac-700 dark:text-lilac-300 font-medium'
                          : 'text-ink-2 hover:bg-ink-3/10 hover:text-ink'
                      }`}
                    >
                      <Icon name={tab.icon} className="icon-sm shrink-0" />
                      {tab.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Section content on the right, under a heading with a rule beneath. */}
        <div className="min-w-0 space-y-6">
          <div className="border-b border-line pb-3">
            <h2 className="text-xl font-display font-semibold text-ink">{heading.title}</h2>
            <p className="text-xs text-ink-3 mt-1">{heading.blurb}</p>
          </div>

          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Icon name="person" className="text-lilac-500 dark:text-lilac-300" />
                  <h2 className="text-sm font-semibold text-ink">Profile</h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span className="font-mono text-ink-2">@{user.namespace}</span>
                  <span>Member since {new Date(user.createdAt).toLocaleDateString()}</span>
                  {hasTerms && (
                    <span className="flex items-center gap-1">
                      {hasAcceptedCurrentTerms ? (
                        <>
                          <Icon
                            name="verified_user"
                            className="icon-sm text-emerald-600 dark:text-emerald-400"
                          />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Terms Accepted
                          </span>
                        </>
                      ) : (
                        <>
                          <Icon
                            name="gpp_maybe"
                            className="icon-sm text-amber-600 dark:text-amber-400"
                          />
                          <span className="text-amber-700 dark:text-amber-300">Terms Pending</span>
                          <button
                            onClick={() => {
                              acceptCurrentTerms().catch(() => {
                                toastError('Failed to accept the current terms. Please try again.');
                              });
                            }}
                            className="text-lilac-700 dark:text-lilac-300 underline font-medium ml-1"
                          >
                            Accept
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4 pt-2 border-t border-line">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="settings-display-name" className="label block mb-1">
                        Display Name{' '}
                        <span className="text-ink-3 normal-case">({displayName.length}/80)</span>
                      </label>
                      <input
                        id="settings-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={80}
                        placeholder="e.g. Kane Marshall"
                        className="input"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-new-password" className="label block mb-1">
                        New Password{' '}
                        <span className="text-ink-3 normal-case">(leave blank to keep)</span>
                      </label>
                      <input
                        id="settings-new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="input"
                        autoComplete="new-password"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="settings-bio" className="label block mb-1">
                        Bio{' '}
                        <span className="text-ink-3 normal-case">
                          ({bio.length}/280, leave blank to clear)
                        </span>
                      </label>
                      <textarea
                        id="settings-bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={280}
                        rows={3}
                        placeholder="Tell visitors about yourself"
                        className="input resize-y"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-website" className="label block mb-1">
                        Website
                      </label>
                      <input
                        id="settings-website"
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        maxLength={400}
                        placeholder="https://example.com"
                        className="input"
                        autoComplete="url"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-github" className="label block mb-1">
                        GitHub username
                      </label>
                      <input
                        id="settings-github"
                        type="text"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        maxLength={39}
                        placeholder="octocat"
                        className="input"
                        autoComplete="off"
                      />
                    </div>

                    <ImageUploadField
                      namespace={user.namespace}
                      kind="banner"
                      label="Banner image"
                      currentUrl={bannerUrl.trim() || null}
                      urlValue={bannerUrl}
                      onUrlValueChange={setBannerUrl}
                      onUploaded={handleImageUploaded}
                      onRemoved={handleImageUploaded}
                    />

                    <ImageUploadField
                      namespace={user.namespace}
                      kind="avatar"
                      label="Avatar image"
                      currentUrl={avatarUrl.trim() || null}
                      fallbackUrl={`${api.getBaseUrl()}/users/${user.namespace}/avatar`}
                      urlValue={avatarUrl}
                      onUrlValueChange={setAvatarUrl}
                      onUploaded={handleImageUploaded}
                      onRemoved={handleImageUploaded}
                      round
                    />

                    {newPassword.trim() && (
                      <div className="sm:col-span-2">
                        <label htmlFor="settings-current-password" className="label block mb-1">
                          Current Password{' '}
                          <span className="text-ink-3 normal-case">(required to change it)</span>
                        </label>
                        <input
                          id="settings-current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Your existing password"
                          className="input"
                          autoComplete="current-password"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      {savingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Danger zone */}
              <div className="card p-5 space-y-3 border-rose-200 dark:border-rose-900/60">
                <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                  Delete Account
                </h2>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Permanently delete <strong className="text-ink">@{user.namespace}</strong> and all
                  of its data. This action cannot be undone.
                </p>
                <div>
                  <button
                    onClick={handleDeleteAccount}
                    className="px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors"
                  >
                    Delete my account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && (
            <div className="space-y-6">
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon name="laptop" className="text-lilac-500 dark:text-lilac-300" />
                  <h2 className="text-sm font-semibold text-ink">Active Web Sessions</h2>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  These are the devices and browsers currently logged into your Twext account.
                  Revoking a session immediately terminates its access.
                </p>

                {loadingSessions ? (
                  <div className="space-y-2 pt-2">
                    <div className="h-16 bg-wash dark:bg-raised rounded animate-pulse" />
                    <div className="h-16 bg-wash dark:bg-raised rounded animate-pulse" />
                  </div>
                ) : sessions.length > 0 ? (
                  <div className="divide-y divide-line border border-line rounded-lg mt-2">
                    {sessions.map((sess) => {
                      const isCurrent = isCurrentSession(sess);
                      return (
                        <div
                          key={sess.id}
                          className="p-3.5 flex items-center justify-between gap-3 text-xs bg-surface dark:bg-raised"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-ink font-semibold truncate max-w-[180px]">
                                Session {sess.id.slice(0, 6)}…
                              </span>
                              {isCurrent ? (
                                <span className="chip bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800 text-micro">
                                  <Icon name="laptop" className="icon-xs" />
                                  This Device
                                </span>
                              ) : (
                                <span className="chip bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 text-micro">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-meta text-ink-3 flex items-center gap-2">
                              <span>Created: {new Date(sess.createdAt).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>Expires: {new Date(sess.expiresAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {isCurrent ? (
                            <button
                              disabled
                              title="This session is currently being used on this device. Sign out via Logout to end this session."
                              className="px-2.5 py-1 text-ink-3 bg-wash dark:bg-raised border border-line rounded-lg text-xs font-medium cursor-not-allowed opacity-60"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevokeSession(sess.id)}
                              className="px-2.5 py-1 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-medium transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-ink-3 py-4 text-center">
                    No other active sessions recorded.
                  </p>
                )}

                {sessionsPagination.hasMore && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => loadSessions(sessionsPagination.nextCursor || undefined)}
                      disabled={loadingMoreSessions}
                      className="btn btn-secondary btn-sm disabled:opacity-50"
                    >
                      {loadingMoreSessions ? 'Loading...' : 'Load more sessions'}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 space-y-2 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                  <Icon name="shield" className="text-amber-600 dark:text-amber-400" />
                  <span>Security Tip</span>
                </div>
                <p className="leading-relaxed">
                  If you suspect an automation token or session has been exposed, revoke it
                  immediately. Revocations take effect across the entire Twext registry network
                  within seconds.
                </p>
              </div>
            </div>
          )}

          {/* Tokens Tab */}
          {activeTab === 'tokens' && (
            <div className="space-y-6">
              {createdTokenSecret && (
                <div className="bg-lilac-50 dark:bg-lilac-900/40 border border-lilac-200 dark:border-lilac-800 p-5 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-lilac-700 dark:text-lilac-300">
                    <Icon name="key" className="icon-lg" />
                    <h2 className="text-sm font-semibold text-ink">Your New Automation Token</h2>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">
                    Make sure to copy your automation token now. You will <strong>not</strong> be
                    able to see it again! Store it in your GitHub repository secrets as{' '}
                    <code className="text-ink font-mono">TWEXT_TOKEN</code>.
                  </p>

                  <div className="relative bg-raised dark:bg-raised border border-lilac-200 dark:border-lilac-800 rounded-lg p-2.5 flex items-center justify-between font-mono text-xs text-ink">
                    <span className="truncate pr-8">{createdTokenSecret}</span>
                    <button
                      onClick={() => handleCopySecret(createdTokenSecret)}
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      {copiedToken ? (
                        <Icon name="check" className="icon-xs" />
                      ) : (
                        <Icon name="content_copy" className="icon-xs" />
                      )}
                      <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="text-right">
                    <button
                      onClick={() => setCreatedTokenSecret(null)}
                      className="btn btn-ghost btn-sm"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div className="card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Icon name="key" className="text-lilac-500 dark:text-lilac-300" />
                  <h2 className="text-sm font-semibold text-ink">Generate Automation Token</h2>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Automation tokens authenticate the Twext CLI in headless environments such as
                  GitHub Actions, GitLab CI, or custom deployment bots.
                </p>

                <form onSubmit={handleCreateToken} className="space-y-3 pt-1">
                  <div>
                    <label htmlFor="settings-token-name" className="label block mb-1">
                      Token Name / Identifier
                    </label>
                    <input
                      id="settings-token-name"
                      type="text"
                      required
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      placeholder="e.g. github-actions-ci or release-bot"
                      className="input"
                    />
                  </div>

                  <fieldset>
                    <legend className="label block mb-1.5">Permissions (Scopes)</legend>
                    <div className="space-y-2">
                      {TOKEN_SCOPES.map(({ value, description }) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 cursor-pointer text-xs text-ink-2"
                        >
                          <input
                            type="checkbox"
                            checked={newTokenScopes.includes(value)}
                            onChange={() => toggleScope(newTokenScopes, value, setNewTokenScopes)}
                            className="rounded accent-lilac-500"
                          />
                          <span>
                            <strong className="font-mono">{value}</strong> — {description}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div>
                    <label htmlFor="settings-token-expiry" className="label block mb-1">
                      Expiration
                    </label>
                    <select
                      id="settings-token-expiry"
                      value={tokenExpiry}
                      onChange={(e) => setTokenExpiry(e.target.value)}
                      className="input w-full sm:w-56"
                    >
                      <option value="never">Never expires</option>
                      <option value="30">Expires in 30 days</option>
                      <option value="90">Expires in 90 days</option>
                      <option value="365">Expires in 365 days</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={creatingToken}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      <Icon name="add" className="icon-sm" />
                      <span>{creatingToken ? 'Generating...' : 'Create Automation Token'}</span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="card p-5 space-y-3">
                {' '}
                <h2 className="label">Access Tokens ({tokens.length})</h2>
                {loadingTokens ? (
                  <div className="space-y-2">
                    <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
                    <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
                  </div>
                ) : tokens.length > 0 ? (
                  <div className="divide-y divide-line border border-line rounded-lg">
                    {tokens.map((tok) => {
                      if (editingTokenId === tok.id) {
                        return (
                          <div
                            key={tok.id}
                            className="p-3 space-y-3 text-xs bg-surface dark:bg-raised"
                          >
                            <div>
                              <label
                                htmlFor="settings-edit-token-name"
                                className="label block mb-1"
                              >
                                Token Name
                              </label>
                              <input
                                id="settings-edit-token-name"
                                type="text"
                                value={editTokenName}
                                onChange={(e) => setEditTokenName(e.target.value)}
                                className="input"
                              />
                            </div>
                            <div>
                              <span className="label block mb-1.5">Scopes</span>
                              <div className="space-y-1.5">
                                {TOKEN_SCOPES.map(({ value }) => (
                                  <label
                                    key={value}
                                    className="flex items-center gap-2 cursor-pointer text-xs text-ink-2"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editTokenScopes.includes(value)}
                                      onChange={() =>
                                        toggleScope(editTokenScopes, value, setEditTokenScopes)
                                      }
                                      className="rounded accent-lilac-500"
                                    />
                                    <span className="font-mono">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={handleCancelEditToken}
                                className="btn btn-ghost btn-sm"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveToken}
                                disabled={savingToken}
                                className="btn btn-primary btn-sm disabled:opacity-50"
                              >
                                {savingToken ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={tok.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs bg-surface dark:bg-raised"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-ink">{tok.name}</span>
                              <div className="flex items-center gap-1">
                                {tok.scopes?.map((sc) => (
                                  <span
                                    key={sc}
                                    className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-micro"
                                  >
                                    {sc}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-meta text-ink-3">
                              Created {new Date(tok.createdAt).toLocaleDateString()}
                              {tok.lastUsedAt &&
                                ` • Last used ${new Date(tok.lastUsedAt).toLocaleDateString()}`}
                              {tok.expiresAt
                                ? ` • Expires ${new Date(tok.expiresAt).toLocaleDateString()}`
                                : ' • Never expires'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleStartEditToken(tok)}
                              className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                              title="Edit Token"
                            >
                              <Icon name="edit" className="icon-sm" />
                            </button>
                            <button
                              onClick={() => handleDeleteToken(tok.id)}
                              className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/40 transition-colors"
                              title="Revoke Token"
                            >
                              <Icon name="delete" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-ink-3 py-4 text-center">
                    No automation tokens generated yet.
                  </p>
                )}
                {tokensPagination.hasMore && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => loadTokens(tokensPagination.nextCursor || undefined)}
                      disabled={loadingMoreTokens}
                      className="btn btn-secondary btn-sm disabled:opacity-50"
                    >
                      {loadingMoreTokens ? 'Loading...' : 'Load more tokens'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
};
