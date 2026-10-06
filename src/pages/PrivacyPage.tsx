import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { PrivacyDoc } from '../types/api';
import { MarkdownView } from '../components/MarkdownView';
import { Icon } from '../components/Icon';

export const PrivacyPage: React.FC = () => {
  const [privacy, setPrivacy] = useState<PrivacyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPrivacy = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getPrivacy();
        if (isMounted) {
          setPrivacy(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof ApiError ? err.message : 'Failed to load Privacy Policy from server';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPrivacy();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-line">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="shield" className="icon-lg text-lilac-500 dark:text-lilac-300" />
          <h1 className="text-2xl font-display font-semibold text-ink">Privacy Policy</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          {privacy && (
            <>
              <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono">
                Version {privacy.version}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Icon name="calendar_today" className="icon-sm" />
                Last Updated {new Date(privacy.updatedAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Document Content */}
      <div className="card p-6 sm:p-8 min-h-[400px]">
        {loading ? (
          <div className="space-y-4">
            <div className="h-6 w-48 bg-wash dark:bg-raised rounded animate-pulse" />
            <div className="h-4 w-full bg-wash dark:bg-raised rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-wash dark:bg-raised rounded animate-pulse" />
            <div className="h-24 bg-wash dark:bg-raised rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-xs text-rose-600 dark:text-rose-400 space-y-2">
            <Icon name="error" className="icon-2xl text-rose-400 mx-auto" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : privacy ? (
          <MarkdownView content={privacy.body} />
        ) : null}
      </div>
    </div>
  );
};
