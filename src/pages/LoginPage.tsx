import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';
import { Icon } from '../components/Icon';

interface LoginPageProps {
  onNavigate: (route: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [namespace, setNamespace] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namespace.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(namespace.trim().toLowerCase(), password);
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
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <BrandLogo size="md" showText={false} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-ink">Sign in to Twext</h1>
          <p className="text-sm text-ink-3">
            Enter your username and password to manage your extensions.
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
            <label htmlFor="login-namespace" className="label block mb-1.5">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3 font-mono">
                @
              </span>
              <input
                id="login-namespace"
                name="namespace"
                type="text"
                required
                autoComplete="username"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="your-username"
                className="input font-mono pl-7"
              />
            </div>
            <p className="text-xs text-ink-3 mt-1">
              Example: <code className="text-ink-2">kanemarshall</code>
            </p>
          </div>

          <div>
            <label htmlFor="login-password" className="label block mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-2.5 text-sm disabled:opacity-50"
          >
            <Icon name="login" />
            <span>{loading ? 'Signing in...' : 'Sign in'}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-line text-center">
          <p className="text-sm text-ink-2">
            Don't have an account yet?{' '}
            <button
              onClick={() => onNavigate('signup')}
              className="text-lilac-700 dark:text-lilac-300 font-semibold hover:underline underline-offset-4 inline-flex items-center gap-0.5"
            >
              Sign up <Icon name="arrow_forward" className="icon-xs" />
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
