import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationPage } from './OrganizationPage';
import { api, ApiError } from '../services/api';
import {
  makeAdminUser,
  makeAuthState,
  makeExtension,
  makeOrganization,
  makeOrganizationOwner,
  makeUser,
  paginated,
} from '../test/testUtils';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);
const onNavigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onNavigate.mockClear();
  useAuthMock.mockReturnValue(makeAuthState({ user: null, token: null, isAuthenticated: false }));
  apiMock.getOrganization.mockResolvedValue(makeOrganization());
  apiMock.getOrganizationOwners.mockResolvedValue([
    makeOrganizationOwner({ namespace: 'kane', displayName: 'Kane' }),
  ]);
  apiMock.getOrganizationExtensions.mockResolvedValue(
    paginated([makeExtension({ namespace: 'acme', id: 'widget', name: 'Widget' })]),
  );
});

describe('OrganizationPage', () => {
  it('renders the profile, its owners and its own extension listing', async () => {
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    expect(await screen.findByRole('heading', { name: 'Acme Inc' })).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Extensions by @acme/ })).toBeInTheDocument();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Kane')).toBeInTheDocument();
    expect(apiMock.getOrganization).toHaveBeenCalledWith('acme');
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledWith('acme');
  });

  it('lists extensions from the organization collection, not a filtered search', async () => {
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    await screen.findByText('Widget');
    // An owner sees private extensions here, which a public search cannot reach.
    expect(apiMock.getOrganizationExtensions).toHaveBeenCalledWith('acme', undefined);
    expect(apiMock.searchExtensions).not.toHaveBeenCalled();
  });

  it('serves the identicon from the organization image path', async () => {
    apiMock.getOrganization.mockResolvedValue(makeOrganization({ avatarUrl: null }));
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    const avatar = await screen.findByAltText('Avatar for @acme');
    expect(avatar.getAttribute('src')).toContain('/orgs/acme/avatar');
  });

  it('sends an owner to the organization settings', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'kane' }), isAuthenticated: true }),
    );
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    await user.click(await screen.findByRole('button', { name: /Manage/ }));

    expect(onNavigate).toHaveBeenCalledWith('org/acme/settings');
  });

  it('offers the settings to an admin who is not on the owner list', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(
      makeAuthState({
        user: makeAdminUser({ namespace: 'root' }),
        isAuthenticated: true,
        isAdmin: true,
      }),
    );
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    // The settings screen lets an admin in without being an owner, so the way
    // in is offered rather than left to be typed.
    await user.click(await screen.findByRole('button', { name: /Manage/ }));
    expect(onNavigate).toHaveBeenCalledWith('org/acme/settings');
  });

  it('offers no management link to a visitor who is not an owner', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'ada' }), isAuthenticated: true }),
    );
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    await screen.findByText('Kane');
    expect(screen.queryByRole('button', { name: /Manage/ })).not.toBeInTheDocument();
  });

  it('keeps the profile when the owner list cannot be read', async () => {
    apiMock.getOrganizationOwners.mockRejectedValue(new ApiError('Forbidden', 403));
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    expect(await screen.findByRole('heading', { name: 'Acme Inc' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Owners' })).not.toBeInTheDocument();
  });

  it('reports a missing organization with the API message', async () => {
    apiMock.getOrganization.mockRejectedValue(new ApiError('No such organization.', 404));
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    expect(
      await screen.findByRole('heading', { name: 'Organization Not Found' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No such organization.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Extensions by/ })).not.toBeInTheDocument();
  });

  it('sends a visitor back to the directory from the not-found state', async () => {
    const user = userEvent.setup();
    apiMock.getOrganization.mockRejectedValue(new ApiError('No such organization.', 404));
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    await user.click(await screen.findByRole('button', { name: /Back to Organizations/ }));

    expect(onNavigate).toHaveBeenCalledWith('organizations');
  });

  it('links an extension to its detail page', async () => {
    const user = userEvent.setup();
    render(<OrganizationPage namespace="acme" onNavigate={onNavigate} />);

    await user.click(await screen.findByRole('button', { name: 'View details for Widget' }));

    expect(onNavigate).toHaveBeenCalledWith('ext/acme/widget');
  });
});
