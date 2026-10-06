import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { ExtensionSummary } from '../types/api';
import { Icon } from './Icon';

interface TrendingPanelProps {
  onNavigate: (route: string) => void;
  limit?: number;
}

export const TrendingPanel: React.FC<TrendingPanelProps> = ({ onNavigate, limit = 10 }) => {
  const [items, setItems] = useState<ExtensionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await api.getTrendingExtensions();
        if (cancelled) return;
        setItems((res?.data || []).slice(0, limit));
      } catch (err: unknown) {
        if (cancelled) return;
        setItems([]);
        setFailed(!(err instanceof ApiError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  // Trending is a nice-to-have; stay quiet when the registry has nothing to rank.
  if (!loading && items.length === 0) return null;

  return (
    <section className="card p-5" aria-labelledby="trending-heading">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2
          id="trending-heading"
          className="text-sm font-semibold text-ink flex items-center gap-2"
        >
          <Icon name="local_fire_department" className="text-amber-500" />
          Trending This Week
        </h2>
        <span className="text-micro text-ink-3 font-mono inline-flex items-center gap-1">
          <Icon name="trending_up" className="icon-xs" />
          top {limit}
        </span>
      </div>

      {loading ? (
        <ol className="space-y-2" aria-busy="true">
          {Array.from({ length: Math.min(limit, 5) }).map((_, i) => (
            <li key={i} className="h-9 bg-wash dark:bg-raised rounded-lg animate-pulse" />
          ))}
        </ol>
      ) : (
        <ol className="divide-y divide-line -my-1">
          {items.map((item, index) => (
            <li key={`${item.namespace}/${item.id}`}>
              <button
                onClick={() => onNavigate(`ext/${item.namespace}/${item.id}`)}
                className="w-full flex items-center gap-3 py-2 text-left group"
              >
                <span className="font-mono text-meta text-ink-3 w-4 shrink-0 tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-ink group-hover:text-lilac-700 dark:group-hover:text-lilac-300 truncate transition-colors">
                    {item.name}
                  </span>
                  <span className="block font-mono text-micro text-ink-3 truncate">
                    @{item.namespace}/{item.id}
                  </span>
                </span>
                <span className="font-mono text-micro text-ink-3 shrink-0">v{item.version}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {failed && <p className="text-micro text-ink-3 mt-3">Trending is temporarily unavailable.</p>}
    </section>
  );
};
