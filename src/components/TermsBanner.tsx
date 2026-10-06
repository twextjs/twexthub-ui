import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';

interface TermsBannerProps {
  onNavigate: (route: string) => void;
}

export const TermsBanner: React.FC<TermsBannerProps> = ({ onNavigate }) => {
  const {
    isAuthenticated,
    hasTerms,
    hasAcceptedCurrentTerms,
    latestTermsVersion,
    acceptCurrentTerms,
  } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A registry that has never published terms has nothing outstanding to accept.
  if (!isAuthenticated || !hasTerms || hasAcceptedCurrentTerms) {
    return null;
  }

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await acceptCurrentTerms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept terms');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-900/60 border-b border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Icon name="gpp_maybe" className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Action Required:</strong> The Twext Terms of Service
            {latestTermsVersion !== null ? ` (v${latestTermsVersion})` : ''} have been updated. You
            must accept the current terms to publish extensions or manage sessions.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('terms')}
            className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 underline font-medium flex items-center gap-0.5"
          >
            Review Terms <Icon name="arrow_forward" className="icon-xs" />
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="btn btn-sm bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white flex items-center gap-1 disabled:opacity-50"
          >
            <Icon name="check" className="icon-xs" />
            {accepting ? 'Accepting...' : 'Accept Current Terms'}
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="max-w-7xl mx-auto mt-1 text-xs text-rose-700 dark:text-rose-400 font-medium"
        >
          {error}
        </div>
      )}
    </div>
  );
};
