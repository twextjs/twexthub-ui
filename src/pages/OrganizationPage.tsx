import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ExtensionSummary, Organization, OrganizationOwner, Pagination } from '../types/api';
import { ExtensionCard } from '../components/ExtensionCard';
import { Icon } from '../components/Icon';
import { toSameOriginImageUrl } from '../lib/profile-image';

interface OrganizationPageProps {
  namespace: string;
  onNavigate: (route: string) => void;
}

/**
 * The public profile of an organization.
 *
 * An organization shares its namespace with accounts, so it gets its own
 * collection of endpoints rather than the `/users` ones: the same profile
 * fields and images, its own extension listing, and an owner list. An owner
 * sees private extensions here too, because the listing answers for whoever is
 * asking rather than for the public.
 */
export const OrganizationPage: React.FC<OrganizationPageProps> = ({ namespace, onNavigate }) => {
  const { user, isAdmin } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [owners, setOwners] = useState<OrganizationOwner[]>([]);
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingExtensions, setLoadingExtensions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionsError, setExtensionsError] = useState<string | null>(null);

  // Superseded requests (stale namespace, rapid refresh) must not commit state.
  const loadExtensionsSeqRef = useRef(0);
  const loadExtensions = useCallback(
    async (cursor?: string) => {
      const requestId = ++loadExtensionsSeqRef.current;
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoadingExtensions(true);
        setExtensionsError(null);
      }
      try {
        const res = await api.getOrganizationExtensions(namespace, cursor ? { cursor } : undefined);
        if (requestId !== loadExtensionsSeqRef.current) return;
        setExtensions((prev) => (cursor ? [...prev, ...(res.data || [])] : res.data || []));
        setPagination(res.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        if (requestId !== loadExtensionsSeqRef.current) return;
        setExtensionsError(err instanceof ApiError ? err.message : 'Failed to load extensions');
        if (!cursor) setExtensions([]);
      } finally {
        if (requestId === loadExtensionsSeqRef.current) {
          // A fresh (cursor-less) load replaces the list and pagination, so
          // any pending load-more belongs to discarded state: clear both.
          if (cursor) setLoadingMore(false);
          else {
            setLoadingExtensions(false);
            setLoadingMore(false);
          }
        }
      }
    },
    [namespace],
  );

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const profile = await api.getOrganization(namespace);
        if (isMounted) setOrganization(profile);
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof ApiError ? err.message : 'Failed to load organization');
        }
        return;
      } finally {
        if (isMounted) setLoading(false);
      }
      // The owner list is public, so a failure here only costs the owner block
      // and must not take the profile down with it.
      try {
        const rows = await api.getOrganizationOwners(namespace);
        if (isMounted) setOwners(rows || []);
      } catch {
        if (isMounted) setOwners([]);
      }
      if (isMounted) await loadExtensions();
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [namespace, loadExtensions]);

  // Only an owner may change the profile, the owner list or the webhooks, so
  // the way in is shown to those the list already names. An admin is let in by
  // the settings screen without being on it, so it is offered to them too.
  const canManage =
    isAdmin || (user !== null && owners.some((owner) => owner.namespace === user.namespace));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-28 bg-wash dark:bg-raised rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 bg-wash dark:bg-raised rounded-lg border border-line animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="warning" className="icon-3xl text-rose-600 dark:text-rose-400 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Organization Not Found</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          {error || `No organization named @${namespace} exists here.`}
        </p>
        <div className="pt-2">
          <button onClick={() => onNavigate('organizations')} className="btn btn-secondary">
            ← Back to Organizations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <button
        onClick={() => onNavigate('organizations')}
        className="text-xs text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
      >
        <Icon name="arrow_back" className="icon-sm" />
        Back to Organizations
      </button>

      <div className="card p-0 overflow-hidden">
        {organization.bannerUrl && (
          <img
            src={toSameOriginImageUrl(organization.bannerUrl, api.getBaseUrl()) ?? undefined}
            alt={`Banner for @${organization.namespace}`}
            className="w-full aspect-[3/1] object-cover bg-wash dark:bg-raised"
          />
        )}
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <img
              src={
                toSameOriginImageUrl(
                  organization.avatarUrl ||
                    `${api.getBaseUrl()}/orgs/${organization.namespace}/avatar`,
                  api.getBaseUrl(),
                ) ?? undefined
              }
              alt={`Avatar for @${organization.namespace}`}
              className="w-16 h-16 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-display font-semibold text-ink">
                  {organization.displayName || organization.namespace}
                </h1>
                <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-xs">
                  @{organization.namespace}
                </span>
                <span className="px-1.5 py-0.2 text-micro font-bold uppercase tracking-wider bg-wash dark:bg-raised text-ink-2 border border-line rounded inline-flex items-center gap-1">
                  <Icon name="group" className="icon-xs" />
                  Organization
                </span>
                {canManage && (
                  <button
                    onClick={() => onNavigate(`org/${organization.namespace}/settings`)}
                    className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <Icon name="settings" className="icon-sm" />
                    Manage
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3 mt-1.5">
                {organization.createdAt && (
                  <span className="flex items-center gap-1">
                    <Icon name="calendar_today" className="icon-xs" />
                    Since {new Date(organization.createdAt).toLocaleDateString()}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="inventory_2" className="icon-xs" />
                  {extensions.length}
                  {pagination.hasMore ? '+' : ''} published extension
                  {extensions.length === 1 && !pagination.hasMore ? '' : 's'}
                </span>
                {owners.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Icon name="person" className="icon-xs" />
                    {owners.length} owner{owners.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {organization.bio && (
                <p className="text-sm text-ink-2 leading-relaxed mt-3 whitespace-pre-wrap break-words">
                  {organization.bio}
                </p>
              )}
              {(organization.website || organization.github) && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                  {organization.website && (
                    <a
                      href={organization.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-lilac-700 dark:text-lilac-300 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      <Icon name="link" className="icon-xs shrink-0" />
                      {organization.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {organization.github && (
                    <a
                      href={`https://github.com/${organization.github}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-ink-2 hover:text-ink inline-flex items-center gap-1 font-mono"
                    >
                      @{organization.github}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {owners.length > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Owners</h2>
          <p className="text-meta text-ink-3">
            Every owner can publish to this namespace, change the profile and manage the owner list,
            so anyone listed here can act for the organization.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {owners.map((owner) => (
              <li key={owner.namespace}>
                <button
                  onClick={() => onNavigate(`author/${owner.namespace}`)}
                  className="flex items-center gap-2 px-2 py-1.5 border border-line rounded-lg hover:border-lilac-400 dark:hover:border-lilac-600 transition-colors"
                >
                  <img
                    src={
                      toSameOriginImageUrl(
                        owner.avatarUrl || `${api.getBaseUrl()}/users/${owner.namespace}/avatar`,
                        api.getBaseUrl(),
                      ) ?? undefined
                    }
                    alt={`Avatar for @${owner.namespace}`}
                    className="w-6 h-6 rounded-full object-cover bg-wash dark:bg-raised border border-line"
                  />
                  <span className="text-xs text-ink-2">
                    {owner.displayName || owner.namespace}
                    <span className="text-ink-3 font-mono ml-1.5">@{owner.namespace}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <h2 className="text-xl font-display font-semibold text-ink">
            Extensions by @{organization.namespace}
          </h2>
          <button
            onClick={() => loadExtensions()}
            className="text-xs text-lilac-700 dark:text-lilac-300 font-medium flex items-center gap-1"
          >
            <Icon name="refresh" className="icon-xs" />
            <span>Refresh</span>
          </button>
        </div>

        {loadingExtensions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 bg-wash dark:bg-raised rounded-lg border border-line animate-pulse"
              />
            ))}
          </div>
        ) : extensionsError ? (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
            <Icon name="warning" className="shrink-0" />
            <span>{extensionsError}</span>
          </div>
        ) : extensions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {extensions.map((ext) => (
              <ExtensionCard
                key={`${ext.namespace}/${ext.id}`}
                extension={ext}
                onClick={() => onNavigate(`ext/${ext.namespace}/${ext.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="border border-line rounded-lg bg-surface p-5 space-y-2">
            <p className="text-sm font-semibold text-ink">No published extensions</p>
            <p className="text-xs text-ink-3 max-w-lg leading-relaxed">
              @{organization.namespace} hasn't published any extensions to this site yet.
            </p>
          </div>
        )}

        {pagination.hasMore && (
          <div className="pt-2 text-center">
            <button
              onClick={() => loadExtensions(pagination.nextCursor || undefined)}
              disabled={loadingMore}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more extensions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
