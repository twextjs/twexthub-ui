import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import { TermsDoc } from '../types/api';
import { useAuth } from '../context/AuthContext';
import { MarkdownView } from '../components/MarkdownView';
import { Icon } from '../components/Icon';

interface TermsPageProps {
  onNavigate: (route: string) => void;
}

export const TermsPage: React.FC<TermsPageProps> = ({ onNavigate }) => {
  const {
    isAuthenticated,
    user,
    hasTerms,
    termsResolved,
    hasAcceptedCurrentTerms,
    acceptCurrentTerms,
  } = useAuth();
  const [terms, setTerms] = useState<TermsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A 404 from /terms means the registry never published a document, which is a
  // normal empty state rather than a failure.
  const [missing, setMissing] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchTerms = async () => {
      setLoading(true);
      setError(null);
      setMissing(false);
      try {
        const data = await api.getTerms();
        if (isMounted) {
          setTerms(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          if (err instanceof ApiError && err.status === 404) {
            setMissing(true);
          } else {
            const msg =
              err instanceof ApiError ? err.message : 'Failed to load Terms of Service from server';
            setError(msg);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTerms();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAccept = async () => {
    // Only submit the version shown on this page; while the document is
    // unloaded there is nothing to accept.
    if (!terms) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptCurrentTerms(terms.version);
      setJustAccepted(true);
    } catch (err: unknown) {
      setAcceptError(err instanceof ApiError ? err.message : 'Failed to submit terms acceptance');
    } finally {
      setAccepting(false);
    }
  };

  const isAccepted = hasAcceptedCurrentTerms || justAccepted;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Icon name="description" className="icon-lg text-lilac-500 dark:text-lilac-300" />
            <h1 className="text-2xl font-display font-semibold text-ink">Terms of Service</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-3">
            {terms && (
              <>
                <span className="chip bg-wash dark:bg-raised border-line text-ink-2 font-mono">
                  Version {terms.version}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Icon name="calendar_today" className="icon-sm" />
                  Last Updated {new Date(terms.updatedAt).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Acceptance Status Pill */}
        {isAuthenticated && terms && (
          <div className="self-start sm:self-auto">
            {isAccepted ? (
              <span className="chip bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60">
                <Icon name="verified_user" className="text-emerald-600 dark:text-emerald-400" />
                <span>Accepted by {user?.displayName || user?.namespace}</span>
              </span>
            ) : (
              <span className="chip bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60">
                <Icon name="gpp_maybe" className="text-amber-600 dark:text-amber-400" />
                <span>Action Required: Acceptance Needed</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Interactive Acceptance Banner for Logged-In Users */}
      {isAuthenticated && !isAccepted && terms && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <strong className="block text-sm font-semibold">Terms Acceptance Required</strong>
            <p className="text-amber-800 dark:text-amber-300">
              You must acknowledge and accept these terms to publish new extensions or create CI
              automation tokens.
            </p>
          </div>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="btn bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white shrink-0 disabled:opacity-50"
          >
            <Icon name="check" />
            <span>{accepting ? 'Accepting...' : 'Accept Terms of Service'}</span>
          </button>
        </div>
      )}

      {acceptError && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
          <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{acceptError}</span>
        </div>
      )}

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
        ) : missing || (termsResolved && !hasTerms) ? (
          <div className="text-center py-12 text-xs text-ink-3 space-y-2">
            <Icon name="description" className="icon-2xl text-ink-3 mx-auto" />
            <p className="font-semibold text-ink-2">No Terms of Service have been published.</p>
            <p>
              This registry has not published any terms yet, so there is nothing to review or
              accept.
            </p>
          </div>
        ) : terms ? (
          <MarkdownView content={terms.body} />
        ) : null}
      </div>

      {/* Bottom Acceptance Callout */}
      {isAuthenticated && !isAccepted && terms && (
        <div className="card p-5 flex items-center justify-between">
          <span className="text-xs text-ink-2">
            Have you finished reviewing the Terms of Service?
          </span>
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="btn btn-primary disabled:opacity-50"
          >
            <Icon name="check" className="icon-sm" />
            <span>Accept Terms (v{terms.version})</span>
          </button>
        </div>
      )}

      {!isAuthenticated && hasTerms && (
        <div className="card p-4 text-xs text-ink-2 flex items-center justify-between">
          <span>Sign in to your author account to record your terms acceptance.</span>
          <button onClick={() => onNavigate('login')} className="btn btn-secondary">
            <Icon name="login" className="icon-sm" />
            Sign in
          </button>
        </div>
      )}
    </div>
  );
};
