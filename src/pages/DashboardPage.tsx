import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ExtensionSummary } from '../types/api';
import { ExtensionCard } from '../components/ExtensionCard';
import { WebhookPanel } from '../components/WebhookPanel';
import { Icon } from '../components/Icon';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [userExtensions, setUserExtensions] = useState<ExtensionSummary[]>([]);
  const [loadingExts, setLoadingExts] = useState(true);
  const [webhooksFor, setWebhooksFor] = useState<{ namespace: string; id: string } | null>(null);

  const loadUserExtensions = useCallback(async () => {
    if (!user) return;
    setLoadingExts(true);
    try {
      // Query extensions by namespace
      const res = await api.searchExtensions(user.namespace, { limit: 50 });
      // Filter strictly to user namespace
      const own = (res.data || []).filter((ext) => ext.namespace === user.namespace);
      setUserExtensions(own);
    } catch {
      setUserExtensions([]);
    } finally {
      setLoadingExts(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      onNavigate('login');
      return;
    }

    if (user) {
      loadUserExtensions();
    }
  }, [isAuthenticated, isLoading, user, onNavigate, loadUserExtensions]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-6">
        <div className="h-28 bg-wash dark:bg-raised rounded-lg animate-pulse" />
        <div className="h-64 bg-wash dark:bg-raised rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-xs text-ink-3">Redirecting to login...</p>
      </div>
    );
  }

  // Search only ever returns published versions, so every row counts as
  // published and none of them are waiting on review.
  const publishedCount = userExtensions.length;
  const pendingCount = 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome & Account Overview */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-wash dark:bg-raised border border-line flex items-center justify-center text-ink-2 font-bold text-xl shrink-0">
              {(user.displayName || user.namespace).charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-semibold text-ink">
                  {user.displayName || user.namespace}
                </h1>
                <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono text-xs">
                  @{user.namespace}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3 mt-1">
                <span>Member since {new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button onClick={() => onNavigate('settings')} className="btn btn-secondary">
              <Icon name="settings" className="icon-sm" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* User's Published & Pending Extensions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <div>
            <h2 className="text-xl font-display font-semibold text-ink">Your Extensions</h2>
            <p className="text-xs text-ink-3">
              Extensions authored under your @{user.namespace} namespace ({publishedCount}{' '}
              published, {pendingCount} pending).
            </p>
          </div>
        </div>

        {loadingExts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-40 bg-wash dark:bg-raised rounded-lg border border-line animate-pulse"
              />
            ))}
          </div>
        ) : userExtensions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userExtensions.map((ext) => (
              <ExtensionCard
                key={`${ext.namespace}/${ext.id}`}
                extension={ext}
                onClick={() => onNavigate(`ext/${ext.namespace}/${ext.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="border border-line rounded-lg bg-surface p-5 space-y-2">
            <p className="text-sm font-semibold text-ink">
              No extensions under @{user.namespace} yet
            </p>
            <p className="text-xs text-ink-3 max-w-lg leading-relaxed">
              Ready to share your custom TurboWarp blocks? Compile and publish them with the Twext
              CLI.
            </p>
          </div>
        )}
      </div>

      {/* Webhooks are per-extension, so they are surfaced here per extension. */}
      {userExtensions.length > 0 && (
        <div className="space-y-4">
          <div className="pb-2 border-b border-line">
            <h2 className="text-xl font-display font-semibold text-ink flex items-center gap-2">
              <Icon name="webhook" className="icon-lg text-lilac-700 dark:text-lilac-300" />
              Webhooks
            </h2>
            <p className="text-xs text-ink-3 mt-1 max-w-2xl leading-relaxed">
              Each extension gets its own webhooks. TwextHub sends a signed event to your URL when a
              version is published, unpublished, deprecated, rejected, or changes owner. The signing
              secret is shown once when the webhook is created.
            </p>
          </div>
          <div className="divide-y divide-line border border-line rounded-lg">
            {userExtensions.map((ext) => (
              <div
                key={`${ext.namespace}/${ext.id}`}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{ext.name}</div>
                  <div className="font-mono text-meta text-ink-3 truncate">
                    @{ext.namespace}/{ext.id}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onNavigate(`ext/${ext.namespace}/${ext.id}`)}
                    className="btn btn-secondary btn-sm"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setWebhooksFor({ namespace: ext.namespace, id: ext.id })}
                    className="btn btn-secondary btn-sm"
                  >
                    <Icon name="webhook" className="icon-sm" />
                    Manage webhooks
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {webhooksFor && (
        <WebhookPanel
          namespace={webhooksFor.namespace}
          id={webhooksFor.id}
          onClose={() => setWebhooksFor(null)}
        />
      )}
    </div>
  );
};
