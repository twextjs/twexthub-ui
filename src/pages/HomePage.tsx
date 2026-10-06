import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ExtensionSummary, InstanceStats } from '../types/api';
import { TrendingPanel } from '../components/TrendingPanel';
import { Icon } from '../components/Icon';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [recentExtensions, setRecentExtensions] = useState<ExtensionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadHomeData = async () => {
      setLoading(true);
      setError(null);
      // The fallbacks keep the page usable, but record the failure so the
      // visitor still learns the registry is degraded.
      let failure: unknown = null;
      try {
        const [statsData, extensionsData] = await Promise.all([
          api.getStats().catch((err: unknown) => {
            failure = err;
            return { published: 0, pending: 0, authors: 0, downloads: 0 };
          }),
          api.getExtensions({ limit: 6 }).catch((err: unknown) => {
            failure = failure ?? err;
            return { data: [], pagination: { nextCursor: null, hasMore: false } };
          }),
        ]);

        if (isMounted) {
          // The stats block reads every total, so a response that omits part of
          // the schema must not take the page down with it.
          const asNumber = (value: number | undefined) => (typeof value === 'number' ? value : 0);
          setStats({
            published: asNumber(statsData.published),
            pending: asNumber(statsData.pending),
            authors: asNumber(statsData.authors),
            downloads: asNumber(statsData.downloads),
          });
          setRecentExtensions(extensionsData.data || []);
          if (failure !== null) {
            setError(
              failure instanceof ApiError ? failure.message : 'Failed to connect to Twext server',
            );
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof ApiError ? err.message : 'Failed to connect to Twext server';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadHomeData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onNavigate(`search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      onNavigate('search');
    }
  };

  // The install panel needs a real-looking address, otherwise a visitor copies
  // a template. Use the most recent published package when there is one.
  const newest = recentExtensions[0];
  const exampleUrl = newest
    ? `${api.getPublicBaseUrl()}/@${newest.namespace}/${newest.id}/versions/${newest.version || '1.0.0'}/download`
    : `${api.getPublicBaseUrl()}/@your-namespace/your-extension/versions/1.0.0/download`;

  return (
    <div className="pb-16">
      {/* Masthead */}
      <section className="border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-display font-semibold tracking-tight text-ink leading-tight text-balance">
              Twext-compiled extensions for TurboWarp
            </h1>
            <p className="mt-2.5 text-ink-2 leading-relaxed">
              Publish with the Twext CLI, or load a community extension straight into the editor.
            </p>

            <form onSubmit={handleSearchSubmit} className="mt-6 max-w-xl">
              <div className="relative">
                <Icon
                  name="search"
                  className="text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, author, or tag…"
                  className="input pl-10 pr-24 py-3"
                  aria-label="Search extensions"
                />
                <button type="submit" className="btn btn-primary absolute right-1.5 top-1.5">
                  Search
                </button>
              </div>
            </form>

            {stats && (
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-ink-3">
                <span>
                  <strong className="text-ink font-semibold">{stats.published}</strong> published
                </span>
                <span aria-hidden="true" className="text-line">
                  ·
                </span>
                <span>
                  <strong className="text-ink font-semibold">{stats.authors}</strong> authors
                </span>
                <span aria-hidden="true" className="text-line">
                  ·
                </span>
                <span>
                  <strong className="text-ink font-semibold">{stats.pending}</strong> pending review
                </span>
                <span aria-hidden="true" className="text-line">
                  ·
                </span>
                <span>
                  <strong className="text-ink font-semibold">
                    {stats.downloads.toLocaleString()}
                  </strong>{' '}
                  downloads
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Error state if server unreachable */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div data-tone="danger" className="alert items-center text-sm">
            <Icon name="error" className="shrink-0" />
            <div>
              <strong>Site notice:</strong> {error}
              <p className="mt-1">
                The site couldn't reach its data source. Try again in a moment — if it keeps
                happening, ask whoever runs this site to check the connection.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recently Published */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-display font-semibold text-ink">Recently published</h2>
            <p className="text-sm text-ink-3 mt-0.5">Latest releases verified on this site.</p>
          </div>
          <button
            onClick={() => onNavigate('search')}
            className="text-sm font-medium text-lilac-700 dark:text-lilac-300 hover:text-lilac-700 dark:hover:text-lilac-200 flex items-center gap-1 hover:underline underline-offset-4 shrink-0"
          >
            <span>View all extensions</span>
            <Icon name="arrow_forward" className="icon-sm" />
          </button>
        </div>

        {loading ? (
          <div className="border border-line rounded-lg bg-surface divide-y divide-line overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse bg-wash dark:bg-raised" />
            ))}
          </div>
        ) : recentExtensions.length > 0 ? (
          <div className="border border-line rounded-lg bg-surface divide-y divide-line overflow-hidden">
            {recentExtensions.map((ext) => {
              const version = ext.version;

              return (
                <button
                  key={`${ext.namespace}/${ext.id}`}
                  onClick={() => onNavigate(`ext/${ext.namespace}/${ext.id}`)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-wash dark:hover:bg-raised transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-ink font-semibold truncate">{ext.name}</span>
                    <span className="font-mono text-xs text-ink-3 truncate">
                      @{ext.namespace}/{ext.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-ink-3">v{version}</span>
                    <span className="hidden sm:inline text-ink-3 font-medium">
                      by {ext.namespace}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border border-line rounded-lg bg-surface px-5 py-6">
            <h3 className="text-base font-semibold text-ink">No extensions published yet</h3>
            <p className="mt-1 text-sm text-ink-3 leading-relaxed max-w-lg">
              Be the first to publish a Twext TurboWarp extension on this site using the Twext CLI.
            </p>
            <div className="mt-3.5 flex items-center gap-2">
              <button onClick={() => onNavigate('search')} className="btn btn-ghost btn-sm">
                Browse Extensions
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Trending */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <TrendingPanel onNavigate={onNavigate} />
      </section>

      {/* How to Publish & Install */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line rounded-lg overflow-hidden">
          <div className="bg-surface p-6">
            <div className="flex items-center gap-2 text-ink font-semibold text-base">
              <Icon name="terminal" className="text-lilac-700 dark:text-lilac-300" />
              <h3>Publish with the Twext CLI</h3>
            </div>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">
              Twext extensions are compiled locally with the Twext tooling and uploaded using
              standard registry commands:
            </p>
            <div className="mt-4 bg-zinc-950 text-zinc-100 p-4 rounded-lg font-mono text-sm space-y-2">
              <div className="text-zinc-500"># Authenticate with Twext</div>
              <div className="text-emerald-400">twext login</div>
              <div className="text-zinc-500 mt-2"># Compile & submit extension</div>
              <div className="text-emerald-400">twext publish</div>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              New publishers' first submissions are reviewed by an administrator before appearing
              publicly.
            </p>
          </div>

          <div className="bg-surface p-6">
            <div className="flex items-center gap-2 text-ink font-semibold text-base">
              <Icon name="inventory_2" className="text-lilac-700 dark:text-lilac-300" />
              <h3>Install in TurboWarp</h3>
            </div>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">
              Load an extension in the TurboWarp editor using its registry URL:
            </p>
            <div className="mt-4 bg-wash dark:bg-raised border border-line p-4 rounded-lg text-sm space-y-2 font-mono">
              <div className="text-ink-2 font-sans text-xs">
                1. Open TurboWarp → <strong>Add Extension</strong> →{' '}
                <strong>Custom Extension</strong>
              </div>
              <div>
                <div className="text-ink-2 font-sans text-xs">2. Paste the package's load URL:</div>
                <div className="mt-1.5 text-ink bg-surface dark:bg-surface p-2 border border-line rounded break-all select-all text-xs">
                  {exampleUrl}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Every published package takes the same shape —{' '}
              <code className="text-ink-2">
                @namespace/id/versions/{'{'}version{'}'}/download
              </code>{' '}
              — and your package page shows the exact address to paste.
            </p>
            <div className="mt-3">
              <a
                href="https://turbowarp.org/editor"
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-lilac-700 dark:text-lilac-300 hover:underline underline-offset-4 inline-flex items-center gap-1"
              >
                Open TurboWarp Editor <Icon name="open_in_new" className="icon-xs" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
