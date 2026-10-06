import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Organization, Pagination } from '../types/api';
import { Icon } from '../components/Icon';
import { toSameOriginImageUrl } from '../lib/profile-image';

interface OrganizationsPageProps {
  onNavigate: (route: string) => void;
}

// Matches the registry's namespace rule: 1-39 characters, alphanumeric with
// inner hyphens only, shared with accounts rather than separate from them.
const NAMESPACE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

const PAGE_SIZE = 24;

/**
 * The public directory of organizations, and the form that creates one.
 *
 * Creating an organization needs an account, and the account that creates it
 * becomes its first owner, so the form is only offered to a signed-in visitor.
 * The API has no listing of "the organizations you own", so the page does not
 * pretend to be a management screen: it is the directory, and each
 * organization hands an owner over to its own settings page.
 */
export const OrganizationsPage: React.FC<OrganizationsPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, hasTerms, hasAcceptedCurrentTerms } = useAuth();
  const { success: toastSuccess } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.getOrganizations({ cursor, limit: PAGE_SIZE });
      setOrganizations((prev) => (cursor ? [...prev, ...(res.data || [])] : res.data || []));
      setPagination(res.pagination || { nextCursor: null, hasMore: false });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organizations');
      if (!cursor) setOrganizations([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = namespace.trim().toLowerCase();
    if (!NAMESPACE.test(trimmed)) {
      setCreateError(
        'A namespace is 1-39 characters of letters, digits and inner hyphens, starting and ending with a letter or digit.',
      );
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createOrganization({
        namespace: trimmed,
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || null,
      });
      toastSuccess(`Created @${created.namespace}.`);
      setNamespace('');
      setDisplayName('');
      setBio('');
      setShowForm(false);
      onNavigate(`org/${created.namespace}/settings`);
    } catch (err: unknown) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the organization.');
    } finally {
      setCreating(false);
    }
  };

  // The registry refuses a new namespace while the current terms are
  // unaccepted, so say so here rather than letting the request come back a 403.
  const termsOutstanding = hasTerms && !hasAcceptedCurrentTerms;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="pb-4 border-b border-line">
        <h1 className="text-2xl font-display font-semibold text-ink">Organizations</h1>
        <p className="text-xs text-ink-3 mt-1.5 max-w-2xl leading-relaxed">
          An organization is a shared namespace. It has a profile and publishes extensions, and
          every account on its owner list can act for it, which is what a team, a project or a
          maintainer group needs.
        </p>
      </header>

      {isAuthenticated && user && (
        <div className="card p-5 space-y-4">
          {!showForm ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Create an organization</h2>
                <p className="text-meta text-ink-3 mt-0.5">
                  You become its first owner, and the namespace is yours to publish under.
                </p>
              </div>
              <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
                <Icon name="group" className="icon-sm" />
                New organization
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <h2 className="text-sm font-semibold text-ink">Create an organization</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="org-namespace" className="label block mb-1.5">
                    Namespace
                  </label>
                  <div className="flex items-center">
                    <span className="text-sm text-ink-3 font-mono border border-r-0 border-line rounded-l bg-wash dark:bg-raised px-2 py-2 select-none">
                      @
                    </span>
                    <input
                      id="org-namespace"
                      name="namespace"
                      className="input font-mono rounded-l-none"
                      value={namespace}
                      onChange={(e) => setNamespace(e.target.value.toLowerCase())}
                      placeholder="acme"
                      maxLength={39}
                      required
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <p className="text-meta text-ink-3 mt-1">
                    Letters, digits and inner hyphens. Shared with accounts, so a name already taken
                    here cannot be reused.
                  </p>
                </div>
                <div>
                  <label htmlFor="org-display-name" className="label block mb-1.5">
                    Display name
                  </label>
                  <input
                    id="org-display-name"
                    name="displayName"
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Acme Inc"
                    maxLength={80}
                    autoComplete="off"
                  />
                  <p className="text-meta text-ink-3 mt-1">
                    Shown instead of the namespace on the profile.
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="org-bio" className="label block mb-1.5">
                  Description
                </label>
                <textarea
                  id="org-bio"
                  name="bio"
                  className="input text-sm"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What this organization works on."
                  maxLength={280}
                />
              </div>
              {termsOutstanding && (
                <p className="text-meta text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <Icon name="gpp_maybe" className="icon-sm shrink-0 mt-0.5" />
                  <span>
                    The registry asks you to accept the current Terms of Service before it will
                    create a namespace.{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('terms')}
                      className="underline hover:no-underline"
                    >
                      Review the terms
                    </button>
                    , or use the notice at the top of the page to accept them.
                  </span>
                </p>
              )}
              {createError && (
                <p
                  role="alert"
                  className="text-meta text-rose-600 dark:text-rose-400 flex items-start gap-1.5"
                >
                  <Icon name="error" className="icon-sm shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </p>
              )}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={creating} className="btn btn-primary btn-sm">
                  {creating ? 'Creating...' : 'Create organization'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setCreateError(null);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!isAuthenticated && (
        <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-2">Sign in to create an organization of your own.</p>
          <button onClick={() => onNavigate('login')} className="btn btn-secondary btn-sm">
            <Icon name="login" className="icon-sm" />
            Sign in
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-wash dark:bg-raised rounded-lg border border-line animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <Icon name="warning" className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : organizations.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <button
              key={org.namespace}
              onClick={() => onNavigate(`org/${org.namespace}`)}
              className="card p-4 flex items-start gap-3 text-left hover:border-lilac-400 dark:hover:border-lilac-600 transition-colors"
            >
              <img
                src={
                  toSameOriginImageUrl(
                    org.avatarUrl || `${api.getBaseUrl()}/orgs/${org.namespace}/avatar`,
                    api.getBaseUrl(),
                  ) ?? undefined
                }
                alt={`Avatar for @${org.namespace}`}
                className="w-12 h-12 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">
                  {org.displayName || org.namespace}
                </p>
                <p className="text-xs text-ink-3 font-mono truncate">@{org.namespace}</p>
                {org.bio && <p className="text-meta text-ink-3 mt-1.5 line-clamp-2">{org.bio}</p>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="border border-line rounded-lg bg-surface p-5 space-y-2">
          <p className="text-sm font-semibold text-ink">No organizations yet</p>
          <p className="text-xs text-ink-3 max-w-lg leading-relaxed">
            No organization has been created on this site. The first one keeps the name it wants.
          </p>
        </div>
      )}

      {pagination.hasMore && (
        <div className="pt-2 text-center">
          <button
            onClick={() => load(pagination.nextCursor || undefined)}
            disabled={loadingMore}
            className="btn btn-secondary btn-sm disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more organizations'}
          </button>
        </div>
      )}
    </div>
  );
};
