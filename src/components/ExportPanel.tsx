import React, { useState } from 'react';
import { api, ApiError } from '../services/api';
import { downloadFile, timestampedFilename, toCsv } from '../lib/csv';
import { useToast } from '../context/ToastContext';
import { ExtensionSummary, Organization, PaginatedList, PendingVersion, User } from '../types/api';
import { Icon, IconName } from './Icon';

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

const extensionRows = (items: ExtensionSummary[]) =>
  items.map((ext) => ({
    namespace: ext.namespace,
    id: ext.id,
    name: ext.name,
    description: ext.description || '',
    author: ext.namespace,
    latestVersion: ext.version || '',
    status: 'published',
    publishedAt: ext.publishedAt || '',
  }));

const userRows = (items: User[]) =>
  items.map((user) => ({
    namespace: user.namespace,
    displayName: user.displayName || '',
    role: user.role || 'normal',
    hasPublished: user.hasPublished,
    termsAcceptedVersion: user.termsAcceptedVersion ?? '',
    createdAt: user.createdAt || '',
  }));

const organizationRows = (items: Organization[]) =>
  items.map((org) => ({
    namespace: org.namespace,
    displayName: org.displayName || '',
    website: org.website || '',
    github: org.github || '',
    createdAt: org.createdAt || '',
  }));

const queueRows = (items: PendingVersion[]) =>
  items.map((item) => ({
    namespace: item.ownerNamespace || item.namespace,
    id: item.id,
    version: item.version,
    name: item.name,
    status: item.status,
    license: item.license || '',
    createdAt: item.createdAt || '',
  }));

type DatasetKey = 'extensions' | 'users' | 'organizations' | 'queue';

export const ExportPanel: React.FC = () => {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const datasets: Array<{
    key: DatasetKey;
    label: string;
    description: string;
    icon: IconName;
    load: () => Promise<Array<Record<string, unknown>>>;
  }> = [
    {
      key: 'extensions',
      label: 'Extensions',
      description: 'Every published extension with metadata.',
      icon: 'inventory_2',
      load: async () =>
        extensionRows(await collectAll<ExtensionSummary>((p) => api.getExtensions(p))),
    },
    {
      key: 'users',
      label: 'Accounts',
      description: 'All registered accounts.',
      icon: 'group',
      // `/users` carries the organizations too, and an account row has no place
      // for a display name with no role or Terms behind it.
      load: async () =>
        userRows(
          (await collectAll<User>((p) => api.getUsers(p))).filter((u) => u.kind !== 'organization'),
        ),
    },
    {
      key: 'organizations',
      label: 'Organizations',
      description: 'Every organization, with its profile.',
      icon: 'business',
      load: async () =>
        organizationRows(await collectAll<Organization>((p) => api.getOrganizations(p))),
    },
    {
      key: 'queue',
      label: 'Pending versions',
      description: 'Versions currently awaiting review.',
      icon: 'verified_user',
      load: async () =>
        queueRows(await collectAll<PendingVersion>((p) => api.listVersionsForReview(p))),
    },
  ];

  const handleExport = async (dataset: (typeof datasets)[number], format: 'json' | 'csv') => {
    const action = `${dataset.key}:${format}`;
    setBusy(action);
    try {
      const rows = await dataset.load();
      const content = format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);
      downloadFile(
        timestampedFilename(`twexthub-${dataset.key}`, format),
        content,
        format === 'json' ? 'application/json' : 'text/csv',
      );
      toast.success(
        `Exported ${rows.length} ${dataset.label.toLowerCase()} record(s) as ${format.toUpperCase()}.`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : `Failed to export ${dataset.label}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Icon name="download" className="text-lilac-600 dark:text-lilac-300" />
        <div>
          <h3 className="text-sm font-semibold text-ink">Download site data</h3>
          <p className="text-meta text-ink-3 max-w-xl leading-relaxed">
            Download a copy of the site's data, compiled right in your browser. Nothing is stored on
            the server.
          </p>
        </div>
      </div>

      <div className="divide-y divide-line border border-line rounded-lg">
        {datasets.map((dataset) => {
          const jsonBusy = busy === `${dataset.key}:json`;
          const csvBusy = busy === `${dataset.key}:csv`;
          return (
            <div
              key={dataset.key}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon name={dataset.icon} className="text-ink-3 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-ink">{dataset.label}</div>
                  <div className="text-meta text-ink-3">{dataset.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleExport(dataset, 'json')}
                  disabled={busy !== null}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  <Icon name="data_object" className="icon-sm" />
                  <span>{jsonBusy ? 'Exporting...' : 'JSON'}</span>
                </button>
                <button
                  onClick={() => handleExport(dataset, 'csv')}
                  disabled={busy !== null}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  <Icon name="table_chart" className="icon-sm" />
                  <span>{csvBusy ? 'Exporting...' : 'CSV'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
