import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';
import { Icon } from '../components/Icon';

interface SignupPageProps {
  onNavigate: (route: string) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate }) => {
  const { signup, acceptCurrentTerms, latestTermsVersion, hasTerms } = useAuth();
  const [namespace, setNamespace] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namespace.trim() || !password) {
      setError('Please choose a username and password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (hasTerms && !agreeTerms) {
      setError('You must agree to the Terms of Service to register an account.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signup(namespace.trim().toLowerCase(), password, displayName.trim() || undefined);

      // Automatically accept current terms upon signup agreement. Skipped when
      // the registry has published no terms, since there is nothing to accept.
      if (hasTerms && agreeTerms) {
        try {
          await acceptCurrentTerms();
        } catch {
          // Non-blocking if terms endpoint had issues
        }
      }

      onNavigate('dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <BrandLogo size="md" showText={false} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-ink">Create an account</h1>
          <p className="text-sm text-ink-3">
            Pick a username to publish and manage extensions on Twext.
          </p>
        </div>

        {error && (
          <div data-tone="danger" className="alert items-center text-sm">
            <Icon name="error" className="shrink-0" />
            <div className="leading-tight">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-namespace" className="label block mb-1.5">
              Username <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3 font-mono">
                @
              </span>
              <input
                id="signup-namespace"
                name="namespace"
                type="text"
                required
                pattern="^[a-zA-Z0-9_-]{2,32}$"
                autoComplete="username"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value.toLowerCase())}
                placeholder="your-username"
                className="input font-mono pl-7"
              />
            </div>
            <p className="text-xs text-ink-3 mt-1">
              Lowercase letters, numbers, and hyphens (e.g. <code>my-studio</code>). Your extensions
              will be published as <code>@{namespace || 'your-name'}/package-name</code>.
            </p>
          </div>

          <div>
            <label htmlFor="signup-display-name" className="label block mb-1.5">
              Display Name{' '}
              <span className="font-normal normal-case tracking-normal text-ink-3">(optional)</span>
            </label>
            <input
              id="signup-display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Kane Marshall"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="label block mb-1.5">
              Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="input"
            />
          </div>

          {hasTerms && (
            <div className="pt-1">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded accent-lilac-500"
                />
                <span className="text-sm text-ink-2 leading-tight">
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('terms')}
                    className="text-lilac-700 dark:text-lilac-300 hover:underline underline-offset-4"
                  >
                    Terms of Service (v{latestTermsVersion ?? 1})
                  </button>{' '}
                  and understand that extensions are publicly inspectable.
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-2.5 text-sm disabled:opacity-50 mt-2"
          >
            <Icon name="person_add" />
            <span>{loading ? 'Creating account...' : 'Create account'}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-line text-center">
          <p className="text-sm text-ink-2">
            Already have an account?{' '}
            <button
              onClick={() => onNavigate('login')}
              className="text-lilac-700 dark:text-lilac-300 font-semibold hover:underline underline-offset-4 inline-flex items-center gap-0.5"
            >
              Sign in <Icon name="arrow_forward" className="icon-xs" />
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
