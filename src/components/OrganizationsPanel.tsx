import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../hooks/useConfirm';
import { Organization, OrganizationOwner, Pagination } from '../types/api';
import { toSameOriginImageUrl } from '../lib/profile-image';
import { Icon } from './Icon';

interface OrganizationsPanelProps {
  onNavigate: (route: string) => void;
}

/**
 * The organizations in the admin console, listed on their own.
 *
 * An organization shares its namespace with accounts and the registry lists
 * both through `/users`, so an admin looking for accounts would otherwise find
 * organizations there too — with no Terms, no role, no sessions and nothing the
 * account controls apply to. They are listed here instead, where the things an
 * admin does to an organization are the ones that exist: read its owner list,
 * open its settings, or delete it.
 */
export const OrganizationsPanel: React.FC<OrganizationsPanelProps> = ({ onNavigate }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ nextCursor: null, hasMore: false });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // The owner list is a second request per row, so it is read when a row is
  // opened rather than for every organization on the page.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [owners, setOwners] = useState<Record<string, OrganizationOwner[]>>({});
  const [ownersError, setOwnersError] = useState<Record<string, string>>({});
  const [loadingOwners, setLoadingOwners] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await api.getOrganizations(cursor ? { cursor, limit: 50 } : { limit: 50 });
        const page = res?.data || [];
        setOrganizations((prev) => (cursor ? [...prev, ...page] : page));
        setPagination(res?.pagination || { nextCursor: null, hasMore: false });
      } catch (err: unknown) {
        toastError(err instanceof ApiError ? err.message : 'Failed to load organizations');
      } finally {
        if (cursor) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const toggleOwners = async (namespace: string) => {
    if (expanded === namespace) {
      setExpanded(null);
      return;
    }
    setExpanded(namespace);
    if (owners[namespace]) return;
    setLoadingOwners(namespace);
    setOwnersError((prev) => ({ ...prev, [namespace]: '' }));
    try {
      const rows = await api.getOrganizationOwners(namespace);
      setOwners((prev) => ({ ...prev, [namespace]: rows }));
    } catch (err: unknown) {
      setOwnersError((prev) => ({
        ...prev,
        [namespace]: err instanceof ApiError ? err.message : 'Failed to load the owner list',
      }));
    } finally {
      setLoadingOwners(null);
    }
  };

  const handleDelete = async (organization: Organization) => {
    const ok = await confirm({
      title: 'Delete organization',
      message: `Delete @${organization.namespace}? Every extension, version, image and webhook under it goes with it, along with the owner rows. There is no undo.`,
      confirmLabel: 'Delete organization',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(organization.namespace);
    try {
      await api.deleteOrganization(organization.namespace);
      setOrganizations((prev) => prev.filter((row) => row.namespace !== organization.namespace));
      toastSuccess(`Deleted @${organization.namespace}.`);
    } catch (err: unknown) {
      toastError(err instanceof ApiError ? err.message : 'Failed to delete that organization');
    } finally {
      setDeleting(null);
    }
  };

  const needle = search.trim().toLowerCase();
  // The listing endpoint takes no query, so the search narrows what has been
  // loaded. The accounts tab behaves the same way, and says nothing false here.
  const visible = needle
    ? organizations.filter(
        (org) =>
          org.namespace.toLowerCase().includes(needle) ||
          (org.displayName || '').toLowerCase().includes(needle),
      )
    : organizations;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-8 pr-3 py-1.5 text-xs"
          />
          <Icon
            name="search"
            className="icon-sm text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
        </div>

        <button
          onClick={() => load()}
          className="text-xs text-lilac-700 dark:text-lilac-300 font-medium flex items-center gap-1"
        >
          <Icon name="refresh" className="icon-xs" />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-14 card animate-pulse" />
          <div className="h-14 card animate-pulse" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-6 text-center text-xs text-ink-3">
          {needle
            ? `No organization here is called ${search.trim()}.`
            : 'No organizations on this registry yet.'}
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {visible.map((org) => {
            const isOpen = expanded === org.namespace;
            const isDeleting = deleting === org.namespace;
            return (
              <div key={org.namespace} className="p-3.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={
                        toSameOriginImageUrl(
                          org.avatarUrl || `${api.getBaseUrl()}/orgs/${org.namespace}/avatar`,
                          api.getBaseUrl(),
                        ) ?? undefined
                      }
                      alt={`Avatar for @${org.namespace}`}
                      className="w-8 h-8 rounded-lg object-cover bg-wash dark:bg-raised border border-line shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink">@{org.namespace}</span>
                        {org.displayName && <span className="text-ink-2">({org.displayName})</span>}
                      </div>
                      <div className="text-meta text-ink-3">
                        {org.createdAt && (
                          <span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
                        )}
                        {org.github && <span className="ml-2">GitHub @{org.github}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleOwners(org.namespace)}
                      aria-expanded={isOpen}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-line text-ink-2 bg-surface dark:bg-raised hover:bg-wash dark:hover:bg-wash transition-colors"
                    >
                      {isOpen ? 'Hide owners' : 'Owners'}
                    </button>
                    <button
                      onClick={() => onNavigate(`org/${org.namespace}`)}
                      title={`View @${org.namespace}`}
                      aria-label={`View @${org.namespace}`}
                      className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                    >
                      <Icon name="open_in_new" className="icon-sm" />
                    </button>
                    <button
                      onClick={() => onNavigate(`org/${org.namespace}/settings`)}
                      title={`Settings for @${org.namespace}`}
                      aria-label={`Settings for @${org.namespace}`}
                      className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors"
                    >
                      <Icon name="settings" className="icon-sm" />
                    </button>
                    <button
                      onClick={() => handleDelete(org)}
                      disabled={isDeleting}
                      title={`Permanently delete @${org.namespace}`}
                      aria-label={`Permanently delete @${org.namespace}`}
                      className="p-1.5 text-ink-3 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-wash dark:hover:bg-raised transition-colors disabled:opacity-50"
                    >
                      <Icon name="delete" className="icon-sm" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 pl-10">
                    {loadingOwners === org.namespace ? (
                      <p className="text-meta text-ink-3">Loading owners...</p>
                    ) : ownersError[org.namespace] ? (
                      <p role="alert" className="text-meta text-rose-600 dark:text-rose-400">
                        {ownersError[org.namespace]}
                      </p>
                    ) : owners[org.namespace]?.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {owners[org.namespace].map((owner) => (
                          <li
                            key={owner.namespace}
                            className="chip bg-wash dark:bg-raised text-ink-2 border border-line"
                          >
                            @{owner.namespace}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-meta text-ink-3">
                        No owners listed, so nobody can change it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

      {confirmDialog}
    </div>
  );
};
