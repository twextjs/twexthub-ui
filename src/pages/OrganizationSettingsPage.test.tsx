import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationSettingsPage } from './OrganizationSettingsPage';
import { api, ApiError } from '../services/api';
import {
  makeAdminUser,
  makeAuthState,
  makeOrganization,
  makeOrganizationOwner,
  makeUser,
  renderWithProviders,
} from '../test/testUtils';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);
const onNavigate = vi.fn();

function renderPage() {
  return renderWithProviders(<OrganizationSettingsPage namespace="acme" onNavigate={onNavigate} />);
}

/** The signed-in owner, so the management screen is the thing under test. */
function asOwner(overrides = {}) {
  useAuthMock.mockReturnValue(
    makeAuthState({ user: makeUser({ namespace: 'kane' }), isAuthenticated: true, ...overrides }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  onNavigate.mockClear();
  asOwner();
  apiMock.getOrganization.mockResolvedValue(makeOrganization());
  apiMock.getOrganizationOwners.mockResolvedValue([
    makeOrganizationOwner({ namespace: 'kane', displayName: 'Kane' }),
    makeOrganizationOwner({ namespace: 'ada', displayName: 'Ada' }),
  ]);
  apiMock.getOrganizationWebhooks.mockResolvedValue([]);
});

describe('OrganizationSettingsPage', () => {
  it('loads the profile and the owner list for an owner', async () => {
    renderPage();

    expect(await screen.findByLabelText('Display name')).toHaveValue('Acme Inc');
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Extensions for people who make things.',
    );
    expect(apiMock.getOrganization).toHaveBeenCalledWith('acme');
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledWith('acme');
    expect(await screen.findByText('Ada')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login page', async () => {
    useAuthMock.mockReturnValue(makeAuthState({ user: null, token: null, isAuthenticated: false }));
    renderPage();

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('login'));
  });

  it('refuses neither way when the owner list cannot be read', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'kane' }), isAuthenticated: true }),
    );
    // Kane is on the list in every other test here, and the list is what says so.
    // A failure must not read as an empty list and lock the owner out.
    apiMock.getOrganizationOwners.mockRejectedValue(new ApiError('gateway timeout', 504));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Owner List Unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Not an Owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save profile/ })).toBeNull();
  });

  it('still lets an admin in when the owner list cannot be read', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({
        user: makeAdminUser({ namespace: 'root' }),
        isAuthenticated: true,
        isAdmin: true,
      }),
    );
    apiMock.getOrganizationOwners.mockRejectedValue(new ApiError('gateway timeout', 504));
    renderPage();

    // An admin may act for any organization, which the list is not what says.
    expect(await screen.findByRole('button', { name: /Save profile/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Owner List Unavailable' })).toBeNull();
  });

  it('refuses the screen to an account that is not an owner', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ namespace: 'mallory' }), isAuthenticated: true }),
    );
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Not an Owner' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });

  it('lets an admin in even without being on the owner list', async () => {
    useAuthMock.mockReturnValue(
      makeAuthState({
        user: makeAdminUser({ namespace: 'root' }),
        isAuthenticated: true,
        isAdmin: true,
      }),
    );
    renderPage();

    expect(await screen.findByLabelText('Display name')).toBeInTheDocument();
  });

  it('saves only the fields that changed', async () => {
    const user = userEvent.setup();
    apiMock.updateOrganization.mockResolvedValue(makeOrganization({ displayName: 'Acme Ltd' }));
    renderPage();

    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Acme Ltd');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() =>
      expect(apiMock.updateOrganization).toHaveBeenCalledWith('acme', { displayName: 'Acme Ltd' }),
    );
  });

  it('refuses a link the registry cannot fetch, without a request', async () => {
    const user = userEvent.setup();
    renderPage();

    // A scheme the browser's own field accepts, and the registry does not.
    const website = await screen.findByLabelText('Website');
    await user.type(website, 'ftp://files.example');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText(/must be an http:\/\/ or https:\/\/ URL/)).toBeInTheDocument();
    expect(apiMock.updateOrganization).not.toHaveBeenCalled();
  });

  it('adds an owner by namespace and re-reads the list', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizationOwners.mockResolvedValueOnce([
      makeOrganizationOwner({ namespace: 'kane' }),
    ]);
    renderPage();

    await user.type(await screen.findByLabelText('Add an owner by namespace'), 'ada');
    await user.click(screen.getByRole('button', { name: /Add owner/ }));

    await waitFor(() => expect(apiMock.addOrganizationOwner).toHaveBeenCalledWith('acme', 'ada'));
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(2);
  });

  it('refuses a namespace the registry would reject, without a request', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('Add an owner by namespace'), '-nope-');
    await user.click(screen.getByRole('button', { name: /Add owner/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter a namespace/);
    expect(apiMock.addOrganizationOwner).not.toHaveBeenCalled();
  });

  it('removes an owner after the confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remove @ada as an owner' }));
    await user.click(await screen.findByRole('button', { name: 'Remove owner' }));

    await waitFor(() =>
      expect(apiMock.removeOrganizationOwner).toHaveBeenCalledWith('acme', 'ada'),
    );
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(2);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([false, true])('handles self-removal with admin access %s', async (isAdmin) => {
    const user = userEvent.setup();
    asOwner({ isAdmin });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remove @kane as an owner' }));
    await user.click(await screen.findByRole('button', { name: 'Remove owner' }));

    await waitFor(() =>
      expect(apiMock.removeOrganizationOwner).toHaveBeenCalledWith('acme', 'kane'),
    );
    if (isAdmin) {
      expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(2);
      expect(onNavigate).not.toHaveBeenCalled();
    } else {
      expect(onNavigate).toHaveBeenCalledWith('org/acme');
      expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(1);
    }
  });

  it('stays on settings when self-removal fails', async () => {
    const user = userEvent.setup();
    apiMock.removeOrganizationOwner.mockRejectedValueOnce(new ApiError('Could not remove', 500));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remove @kane as an owner' }));
    await user.click(await screen.findByRole('button', { name: 'Remove owner' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(1);
  });

  it('offers no removal for the last owner, which the registry would refuse', async () => {
    apiMock.getOrganizationOwners.mockResolvedValue([makeOrganizationOwner({ namespace: 'kane' })]);
    renderPage();

    expect(await screen.findByText('Kane')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove @kane as an owner' })).toBeDisabled();
  });

  it('opens the namespace-wide webhook panel', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Manage webhooks/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(apiMock.getOrganizationWebhooks).toHaveBeenCalledWith('acme');
    // The organization panel must not touch a per-extension collection.
    expect(apiMock.getWebhooks).not.toHaveBeenCalled();
  });

  it('deletes only once the namespace is typed back', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Delete organization/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Type acme to confirm/), 'acme');
    await user.click(within(dialog).getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(apiMock.deleteOrganization).toHaveBeenCalledWith('acme'));
    expect(onNavigate).toHaveBeenCalledWith('organizations');
  });

  it('keeps the organization when the delete is abandoned', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Delete organization/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(apiMock.deleteOrganization).not.toHaveBeenCalled();
  });

  it('reports a missing organization instead of an empty form', async () => {
    apiMock.getOrganization.mockRejectedValue(new ApiError('No such organization.', 404));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Organization Unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No such organization.')).toBeInTheDocument();
  });
});
