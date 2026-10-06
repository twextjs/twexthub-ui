import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthorPage } from './AuthorPage';
import { ApiError, api } from '../services/api';
import {
  makeAuthState,
  makeExtension,
  makeOrganization,
  makeOrganizationOwner,
  makeUser,
  noop,
  paginated,
} from '../test/testUtils';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);

beforeEach(() => {
  // A stranger's profile: signed out, so no self-service affordances and no
  // `termsAcceptedVersion` (the API withholds it from non-self, non-admin).
  useAuthMock.mockReturnValue(
    makeAuthState({ user: null, token: null, isAuthenticated: false, latestTermsVersion: 2 }),
  );
  apiMock.getUser.mockResolvedValue(makeUser({ namespace: 'kane', displayName: 'Kane Marshall' }));
  apiMock.searchExtensions.mockResolvedValue(
    paginated([
      makeExtension({ namespace: 'kane', id: 'demo', name: 'Demo Extension' }),
      makeExtension({ namespace: 'other', id: 'nope', name: 'Other Extension', author: 'other' }),
    ]),
  );
});

describe('AuthorPage', () => {
  it('renders the author profile and only their extensions', async () => {
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    expect(await screen.findByRole('heading', { name: 'Kane Marshall' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Extensions by @kane/ })).toBeInTheDocument();
    expect(screen.getAllByText('@kane').length).toBeGreaterThan(0);
    expect(screen.getByText('Demo Extension')).toBeInTheDocument();
    expect(screen.queryByText('Other Extension')).not.toBeInTheDocument();
    expect(apiMock.getUser).toHaveBeenCalledWith('kane');
  });

  it('renders bio, website, and github links', async () => {
    apiMock.getUser.mockResolvedValue(
      makeUser({
        namespace: 'kane',
        displayName: 'Kane Marshall',
        bio: 'Builds tools.',
        website: 'https://kane.dev',
        github: 'kanemarshall',
      }),
    );
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    expect(await screen.findByText('Builds tools.')).toBeInTheDocument();
    const site = screen.getByRole('link', { name: /kane\.dev/ });
    expect(site).toHaveAttribute('href', 'https://kane.dev');
    expect(site).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const gh = screen.getByRole('link', { name: '@kanemarshall' });
    expect(gh).toHaveAttribute('href', 'https://github.com/kanemarshall');
  });

  it('renders the banner and avatar images', async () => {
    apiMock.getUser.mockResolvedValue(
      makeUser({
        namespace: 'kane',
        avatarUrl: 'https://cdn.example.com/me.png',
        bannerUrl: 'https://cdn.example.com/banner.png',
      }),
    );
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    expect(await screen.findByAltText('Banner for @kane')).toHaveAttribute(
      'src',
      'https://cdn.example.com/banner.png',
    );
    expect(screen.getByAltText('Avatar for @kane')).toHaveAttribute(
      'src',
      'https://cdn.example.com/me.png',
    );
  });

  it('falls back to the registry identicon when no avatar is set', async () => {
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    const img = await screen.findByAltText('Avatar for @kane');
    expect(img).toHaveAttribute('src', '/api/v2/users/kane/avatar');
    expect(screen.queryByAltText('Banner for @kane')).toBeNull();
  });

  it('shows a not-found state when the profile request fails', async () => {
    apiMock.getUser.mockRejectedValue(new ApiError('Account not found', 404));
    render(<AuthorPage namespace="ghost" onNavigate={noop} />);

    expect(await screen.findByText('Author Not Found')).toBeInTheDocument();
    expect(screen.getByText('Account not found')).toBeInTheDocument();
  });

  it('hands a namespace that is an organization to the organization page', async () => {
    // The account view answers for an organization too, with `kind` set and the
    // account-only fields stripped, so the two are told apart there.
    apiMock.getUser.mockResolvedValue(
      makeUser({ namespace: 'acme', displayName: 'Acme Inc', kind: 'organization' }),
    );
    apiMock.getOrganization.mockResolvedValue(makeOrganization());
    apiMock.getOrganizationOwners.mockResolvedValue([makeOrganizationOwner()]);
    apiMock.getOrganizationExtensions.mockResolvedValue(paginated([]));
    render(<AuthorPage namespace="acme" onNavigate={noop} />);

    expect(await screen.findByText('Organization')).toBeInTheDocument();
    expect(apiMock.getOrganization).toHaveBeenCalledWith('acme');
    // The organization listing reaches private extensions for an owner, which a
    // public search cannot, so it is the one that is asked.
    expect(apiMock.searchExtensions).not.toHaveBeenCalled();
  });

  it('navigates back to explore', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AuthorPage namespace="kane" onNavigate={onNavigate} />);
    await screen.findByRole('heading', { name: 'Kane Marshall' });
    await user.click(screen.getAllByRole('button', { name: /Back to Explore/ })[0]);
    expect(onNavigate).toHaveBeenCalledWith('search');
  });
});

describe('AuthorPage v1 profile details', () => {
  it('shows the accepted Terms version when the API discloses it', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'kane' }), latestTermsVersion: 2 }),
    );
    apiMock.getUser.mockResolvedValue(makeUser({ namespace: 'kane', termsAcceptedVersion: 2 }));
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    expect(await screen.findByText('Terms v2 accepted')).toBeInTheDocument();
  });

  it('flags a pending Terms update when the accepted version is behind', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'kane' }), latestTermsVersion: 3 }),
    );
    apiMock.getUser.mockResolvedValue(makeUser({ namespace: 'kane', termsAcceptedVersion: 2 }));
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    expect(await screen.findByText('Terms update pending')).toBeInTheDocument();
    expect(screen.getByText('(3 available)')).toBeInTheDocument();
  });

  it('omits Terms details when the field is withheld from the viewer', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: null, token: null, isAuthenticated: false, latestTermsVersion: 3 }),
    );
    apiMock.getUser.mockResolvedValue(makeUser({ namespace: 'kane', termsAcceptedVersion: null }));
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    await screen.findByRole('heading', { name: 'Kane' });
    expect(screen.queryByText(/Terms v|Terms update pending/)).toBeNull();
  });

  it('offers profile editing to the account owner', async () => {
    const onNavigate = vi.fn();
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'kane' }), latestTermsVersion: 2 }),
    );
    const user = userEvent.setup();
    render(<AuthorPage namespace="kane" onNavigate={onNavigate} />);

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));

    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('hides profile editing from other visitors', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'someone-else' }), latestTermsVersion: 2 }),
    );
    render(<AuthorPage namespace="kane" onNavigate={noop} />);

    await screen.findByRole('heading', { name: 'Kane Marshall' });
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
  });
});
