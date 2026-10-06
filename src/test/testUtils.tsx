import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type {
  AutomationToken,
  Extension,
  ExtensionOwnerInvite,
  ExtensionSummary,
  InstanceStats,
  Organization,
  OrganizationOwner,
  PaginatedList,
  PendingVersion,
  Session,
  User,
} from '../types/api';

export const noop = () => {};

export const makeUser = (overrides: Partial<User> = {}): User => ({
  namespace: 'kane',
  displayName: 'Kane',
  hasPublished: false,
  createdAt: '2026-01-01T00:00:00Z',
  termsAcceptedVersion: 2,
  ...overrides,
});

export const makeAdminUser = (overrides: Partial<User> = {}) =>
  makeUser({ role: 'admin', ...overrides });

export const makeOrganization = (overrides: Partial<Organization> = {}): Organization => ({
  namespace: 'acme',
  displayName: 'Acme Inc',
  bio: 'Extensions for people who make things.',
  website: null,
  github: null,
  avatarUrl: null,
  bannerUrl: null,
  createdAt: '2026-01-05T00:00:00Z',
  _links: {
    self: '/orgs/acme',
    extensions: '/orgs/acme/extensions',
    owners: '/orgs/acme/owners',
    avatar: '/orgs/acme/avatar',
    banner: '/orgs/acme/banner',
  },
  ...overrides,
});

export const makeOrganizationOwner = (
  overrides: Partial<OrganizationOwner> = {},
): OrganizationOwner => ({
  namespace: 'kane',
  displayName: 'Kane',
  avatarUrl: null,
  addedAt: '2026-01-05T00:00:00Z',
  ...overrides,
});

export const makeExtensionOwnerInvite = (
  overrides: Partial<ExtensionOwnerInvite> = {},
): ExtensionOwnerInvite => ({
  namespace: 'ada',
  displayName: 'Ada L',
  kind: 'user',
  createdAt: '2026-03-01T00:00:00Z',
  invitedBy: 'mallory',
  ...overrides,
});

/**
 * A detail-shaped extension that is also a valid list/search row, so fixtures
 * feed both `PaginatedList<Extension>` and `PaginatedList<ExtensionSummary>`.
 */
export const makeExtension = (
  overrides: Partial<Extension> = {},
): Extension & ExtensionSummary => ({
  namespace: 'kane',
  id: 'demo',
  name: 'Demo Extension',
  description: 'A test extension.',
  version: '1.0.0',
  publishedAt: '2026-01-01T00:00:00Z',
  latestVersion: '1.0.0',
  status: 'published',
  author: 'kane',
  ...overrides,
});

export const makePendingVersion = (overrides: Partial<PendingVersion> = {}): PendingVersion => ({
  namespace: 'kane',
  ownerNamespace: 'kane',
  id: 'demo',
  version: '1.0.0',
  status: 'pending',
  name: 'Demo Extension',
  license: 'Apache-2.0',
  description: 'A version awaiting review.',
  createdAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

export const makeStats = (overrides: Partial<InstanceStats> = {}): InstanceStats => ({
  published: 3,
  pending: 1,
  authors: 2,
  downloads: 1234,
  ...overrides,
});

export const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-03-01T00:00:00Z',
  expiresAt: '2026-06-01T00:00:00Z',
  ...overrides,
});

export const makeToken = (overrides: Partial<AutomationToken> = {}): AutomationToken => ({
  id: 'tok-1',
  name: 'ci-deploy',
  scopes: ['publish'],
  createdAt: '2026-03-01T00:00:00Z',
  ...overrides,
});

export function paginated<T>(
  data: T[],
  nextCursor: string | null = null,
  hasMore = false,
): PaginatedList<T> {
  return { data, pagination: { nextCursor, hasMore } };
}

export function renderWithTheme(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(<ThemeProvider>{ui}</ThemeProvider>, options);
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
    options,
  );
}

export interface AuthOverrides {
  user?: User | null;
  token?: string | null;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  isLoading?: boolean;
  latestTermsVersion?: number | null;
  hasTerms?: boolean;
  termsResolved?: boolean;
  hasAcceptedCurrentTerms?: boolean;
}

export function makeAuthState(overrides: AuthOverrides = {}) {
  const login = vi.fn(async () => {});
  const signup = vi.fn(async () => {});
  const logout = vi.fn(async () => {});
  const refreshUser = vi.fn(async () => {});
  const acceptCurrentTerms = vi.fn(async () => {});

  const hasUser = 'user' in overrides;
  const hasToken = 'token' in overrides;
  const user = hasUser ? (overrides.user ?? null) : makeUser();
  const token = hasToken ? (overrides.token ?? null) : 'token-123';

  return {
    user,
    token,
    isAuthenticated: overrides.isAuthenticated ?? Boolean(token && user),
    isAdmin: overrides.isAdmin ?? (user ? user.role === 'admin' : false),
    isLoading: overrides.isLoading ?? false,
    latestTermsVersion: overrides.latestTermsVersion ?? 2,
    hasTerms: overrides.hasTerms ?? true,
    termsResolved: overrides.termsResolved ?? true,
    hasAcceptedCurrentTerms: overrides.hasAcceptedCurrentTerms ?? true,
    login,
    signup,
    logout,
    refreshUser,
    acceptCurrentTerms,
  };
}

export type AuthState = ReturnType<typeof makeAuthState>;

export type AuthContextHook = typeof useAuth;
