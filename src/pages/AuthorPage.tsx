import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ExtensionSummary, Pagination, User } from '../types/api';
import { ExtensionCard } from '../components/ExtensionCard';
import { Icon } from '../components/Icon';
import { OrganizationPage } from './OrganizationPage';
import { toSameOriginImageUrl } from '../lib/profile-image';

interface AuthorPageProps {
  namespace: string;
  onNavigate: (route: string) => void;
}

export const AuthorPage: React.FC<AuthorPageProps> = ({ namespace, onNavigate }) => {
  const { user, latestTermsVersion } = useAuth();
  const [author, setAuthor] = useState<User | null>(null);
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ nextCursor: null, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingExtensions, setLoadingExtensions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionsError, setExtensionsError] = useState<string | null>(null);
  // A namespace can belong to an organization rather than an account, and the
  // account view says so with `kind` while stripping what does not apply to it.
  const [isOrganization, setIsOrganization] = useState(false);

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
        const res = await api.searchExtensions(namespace, cursor ? { cursor } : undefined);
        if (requestId !== loadExtensionsSeqRef.current) return;
        // List rows are addressed by their namespace; the spec's summary rows
        // carry no author field to match against.
        const own = (res.data || []).filter((ext) => ext.namespace === namespace);
        setExtensions((prev) => (cursor ? [...prev, ...own] : own));
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
      setIsOrganization(false);
      try {
        const profile = await api.getUser(namespace);
        if (!isMounted) return;
        // An organization has its own listing, which also answers for an owner
        // and so reaches private extensions this search cannot. The page below
        // fetches it, so the search is not run and nothing is asked for twice.
        if (profile.kind === 'organization') {
          setAuthor(profile);
          setIsOrganization(true);
          return;
        }
        setAuthor(profile);
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof ApiError ? err.message : 'Failed to load author profile');
        }
        return;
      } finally {
        if (isMounted) setLoading(false);
      }
      if (isMounted) await loadExtensions();
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [namespace, loadExtensions]);

  // `termsAcceptedVersion` arrives only for self/admin viewers, so treat its
  // absence as "hidden from you" rather than "never accepted".
  const termsAccepted = author?.termsAcceptedVersion ?? null;
  const isSelf = author !== null && user?.namespace === author.namespace;
  const termsOutdated =
    termsAccepted !== null && latestTermsVersion !== null && termsAccepted < latestTermsVersion;

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

  if (error || !author) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Icon name="warning" className="icon-3xl text-rose-600 dark:text-rose-400 mx-auto" />
        <h2 className="text-xl font-display font-semibold text-ink">Author Not Found</h2>
        <p className="text-xs text-ink-3 max-w-md mx-auto">
          {error || `No account named @${namespace} exists here.`}
        </p>
        <div className="pt-2">
          <button onClick={() => onNavigate('search')} className="btn btn-secondary">
            ← Back to Explore
          </button>
        </div>
      </div>
    );
  }

  if (isOrganization) {
    return <OrganizationPage namespace={namespace} onNavigate={onNavigate} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <button
        onClick={() => onNavigate('search')}
        className="text-xs text-ink-3 hover:text-ink flex items-center gap-1.5 transition-colors"
      >
        <Icon name="arrow_back" className="icon-sm" />
        Back to Explore
      </button>

      <div className="card p-0 overflow-hidden">
        {author.bannerUrl && (
          <img
            src={toSameOriginImageUrl(author.bannerUrl, api.getBaseUrl()) ?? undefined}
            alt={`Banner for @${author.namespace}`}
            className="w-full aspect-[3/1] object-cover bg-wash dark:bg-raised"
          />
        )}
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <img
              src={
                toSameOriginImageUrl(
                  author.avatarUrl || `${api.getBaseUrl()}/users/${author.namespace}/avatar`,
                  api.getBaseUrl(),
                ) ?? undefined
              }
              alt={`Avatar for @${author.namespace}`}
              className="w-16 h-16 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-display font-semibold text-ink">
                  {author.displayName || author.namespace}
                </h1>
                <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-xs">
                  @{author.namespace}
                </span>
                {author.role === 'admin' && (
                  <span className="px-1.5 py-0.2 text-micro font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded">
                    Admin
                  </span>
                )}
                {isSelf && (
                  <button
                    onClick={() => onNavigate('settings')}
                    className="text-xs text-lilac-700 dark:text-lilac-300 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <Icon name="settings" className="icon-sm" />
                    Edit profile
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3 mt-1.5">
                {author.createdAt && (
                  <span className="flex items-center gap-1">
                    <Icon name="calendar_today" className="icon-xs" />
                    Member since {new Date(author.createdAt).toLocaleDateString()}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="inventory_2" className="icon-xs" />
                  {extensions.length}
                  {pagination.hasMore ? '+' : ''} published extension
                  {extensions.length === 1 && !pagination.hasMore ? '' : 's'}
                </span>
                {!author.hasPublished && (
                  <span className="flex items-center gap-1">
                    <Icon name="person" className="icon-xs" />
                    No published releases yet
                  </span>
                )}
                {/*
                  `termsAcceptedVersion` is serialized only for self and admin
                  viewers, so its absence here means "not visible to you", not
                  "never accepted".
                */}
                {termsAccepted !== null && (
                  <span
                    className="flex items-center gap-1"
                    title={`Terms of Service version ${termsAccepted}`}
                  >
                    <Icon name="description" className="icon-xs" />
                    {termsOutdated ? 'Terms update pending' : `Terms v${termsAccepted} accepted`}
                    {termsOutdated && latestTermsVersion !== null && (
                      <span className="font-mono">({latestTermsVersion} available)</span>
                    )}
                  </span>
                )}
              </div>
              {author.bio && (
                <p className="text-sm text-ink-2 leading-relaxed mt-3 whitespace-pre-wrap break-words">
                  {author.bio}
                </p>
              )}
              {(author.website || author.github) && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                  {author.website && (
                    <a
                      href={author.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-lilac-700 dark:text-lilac-300 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      <Icon name="link" className="icon-xs shrink-0" />
                      {author.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {author.github && (
                    <a
                      href={`https://github.com/${author.github}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-ink-2 hover:text-ink inline-flex items-center gap-1 font-mono"
                    >
                      @{author.github}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <h2 className="text-xl font-display font-semibold text-ink">
            Extensions by @{author.namespace}
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
              @{author.namespace} hasn't published any extensions to this site yet.
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
