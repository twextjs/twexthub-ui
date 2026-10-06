import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationsPage } from './OrganizationsPage';
import { api, ApiError } from '../services/api';
import {
  makeAuthState,
  makeOrganization,
  makeUser,
  paginated,
  renderWithProviders,
} from '../test/testUtils';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);
const onNavigate = vi.fn();

function renderPage() {
  return renderWithProviders(<OrganizationsPage onNavigate={onNavigate} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  onNavigate.mockClear();
  useAuthMock.mockReturnValue(makeAuthState({ user: null, token: null, isAuthenticated: false }));
  apiMock.getOrganizations.mockResolvedValue(
    paginated([
      makeOrganization({ namespace: 'acme', displayName: 'Acme Inc' }),
      makeOrganization({ namespace: 'globex', displayName: 'Globex', bio: 'Machines.' }),
    ]),
  );
});

describe('OrganizationsPage', () => {
  it('lists the organizations the registry reports', async () => {
    renderPage();

    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Machines.')).toBeInTheDocument();
    expect(apiMock.getOrganizations).toHaveBeenCalledWith({ cursor: undefined, limit: 24 });
  });

  it('opens an organization from the directory', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Acme Inc'));

    expect(onNavigate).toHaveBeenCalledWith('org/acme');
  });

  it('serves the identicon from the organization image path', async () => {
    renderPage();

    const avatars = await screen.findAllByAltText(/^Avatar for @/);
    expect(avatars[0].getAttribute('src')).toContain('/orgs/acme/avatar');
  });

  it('asks a signed-out visitor to sign in rather than offering the form', async () => {
    renderPage();

    expect(await screen.findByText(/Sign in to create an organization/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New organization/ })).not.toBeInTheDocument();
  });

  it('creates an organization and goes to its settings', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(makeAuthState({ user: makeUser(), isAuthenticated: true }));
    apiMock.createOrganization.mockResolvedValue(makeOrganization());
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New organization/ }));
    await user.type(screen.getByLabelText('Namespace'), 'acme');
    await user.type(screen.getByLabelText('Display name'), 'Acme Inc');
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(apiMock.createOrganization).toHaveBeenCalledWith({
      namespace: 'acme',
      displayName: 'Acme Inc',
      bio: null,
    });
    expect(onNavigate).toHaveBeenCalledWith('org/acme/settings');
  });

  it('refuses a namespace the registry would reject, without a request', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(makeAuthState({ user: makeUser(), isAuthenticated: true }));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New organization/ }));
    await user.type(screen.getByLabelText('Namespace'), '-bad-');
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/1-39 characters/);
    expect(apiMock.createOrganization).not.toHaveBeenCalled();
  });

  it('shows the API message when the namespace is taken', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(makeAuthState({ user: makeUser(), isAuthenticated: true }));
    apiMock.createOrganization.mockRejectedValue(
      new ApiError('That namespace is already in use.', 409),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New organization/ }));
    await user.type(screen.getByLabelText('Namespace'), 'acme');
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That namespace is already in use.');
  });

  it('warns that the registry wants the current terms before it will create one', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser(), isAuthenticated: true, hasAcceptedCurrentTerms: false }),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /New organization/ }));

    expect(screen.getByText(/accept the current Terms of Service/)).toBeInTheDocument();
  });

  it('says so when there are no organizations yet', async () => {
    apiMock.getOrganizations.mockResolvedValue(paginated([]));
    renderPage();

    expect(await screen.findByText('No organizations yet')).toBeInTheDocument();
  });

  it('loads the next page on demand', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizations.mockResolvedValueOnce(
      paginated([makeOrganization({ namespace: 'acme', displayName: 'Acme Inc' })], 'c1', true),
    );
    apiMock.getOrganizations.mockResolvedValueOnce(
      paginated([makeOrganization({ namespace: 'globex', displayName: 'Globex' })]),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Load more organizations/ }));

    expect(apiMock.getOrganizations).toHaveBeenLastCalledWith({ cursor: 'c1', limit: 24 });
    expect(await screen.findByText('Globex')).toBeInTheDocument();
  });
});
