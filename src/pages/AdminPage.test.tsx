import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  makeAdminUser,
  makeAuthState,
  makeExtension,
  makeOrganization,
  makePendingVersion,
  makeSession,
  makeStats,
  makeToken,
  makeUser,
  paginated,
  noop,
  renderWithProviders,
} from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);
let authState: ReturnType<typeof makeAuthState>;

const termsDoc = { version: 2, body: '# Terms', updatedAt: '2026-01-01T00:00:00Z' };

const codeJs = 'class DemoExtension {}\nScratch.extensions.register(new DemoExtension());';

beforeEach(() => {
  apiMock.getStats.mockResolvedValue(makeStats());
  apiMock.listVersionsForReview.mockResolvedValue(paginated([makePendingVersion()]));
  apiMock.getExtensions.mockResolvedValue(paginated([makeExtension()]));
  apiMock.getUsers.mockResolvedValue(paginated([makeUser({ role: 'normal' })]));
  apiMock.getOrganizations.mockResolvedValue(paginated([]));
  apiMock.getTerms.mockResolvedValue(termsDoc);
  apiMock.getPrivacy.mockResolvedValue({
    version: 2,
    body: '# Privacy',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  apiMock.downloadVersion.mockResolvedValue(codeJs);
  authState = makeAuthState({ user: makeAdminUser() });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue(authState);
});

describe('AdminPage', () => {
  it('restricts access to administrators', () => {
    useAuthMock.mockReturnValue(makeAuthState({ user: makeUser({ role: 'normal' }) }));
    renderWithProviders(<AdminPage onNavigate={noop} />);
    expect(screen.getByRole('heading', { name: 'Administrators only' })).toBeInTheDocument();
  });

  it('renders the admin console and its tabs', async () => {
    renderWithProviders(<AdminPage onNavigate={noop} />);
    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Awaiting review/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extensions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organizations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Policies' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maintenance' })).toBeInTheDocument();
  });

  it('keeps organizations off the accounts tab', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ namespace: 'kane', displayName: 'Kane' }),
        // A namespace is either, and the registry lists both through /users.
        makeUser({ namespace: 'acme', displayName: 'Acme Inc', kind: 'organization' }),
      ]),
    );
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Accounts' }));

    // Scoped to the tab, since the moderation queue names @kane too.
    const tab = (await screen.findByPlaceholderText('Search accounts...')).closest(
      'div.space-y-4',
    ) as HTMLElement;
    expect(within(tab).getByText('@kane')).toBeInTheDocument();
    // The account row offers a role, a quota and Terms, none of which apply.
    expect(within(tab).queryByText('@acme')).not.toBeInTheDocument();
  });

  it('lists accounts in the same shape as the organizations tab', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([makeUser({ namespace: 'kane', displayName: 'Kane', github: 'kane' })]),
    );
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Accounts' }));

    // Avatar, the wrapped @namespace (display name) line and the muted meta
    // line are what the organizations tab shows, so the two read as one list.
    const avatar = await screen.findByAltText('Avatar for @kane');
    expect(avatar).toHaveAttribute('src', expect.stringContaining('/users/kane/avatar'));
    const tab = (await screen.findByPlaceholderText('Search accounts...')).closest(
      'div.space-y-4',
    ) as HTMLElement;
    expect(within(tab).getByText('(Kane)')).toBeInTheDocument();
    expect(within(tab).getByText('GitHub @kane')).toBeInTheDocument();
    expect(within(tab).getByText('Terms accepted (v2)')).toBeInTheDocument();
  });

  it('says so when a search on the accounts tab matches nobody', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(paginated([makeUser({ namespace: 'kane' })]));
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Accounts' }));
    await screen.findByPlaceholderText('Search accounts...');
    await user.type(screen.getByPlaceholderText('Search accounts...'), 'zzz');

    expect(await screen.findByText('No account here is called zzz.')).toBeInTheDocument();
  });

  it('lists organizations on their own tab', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizations.mockResolvedValue(
      paginated([makeOrganization({ namespace: 'acme', displayName: 'Acme Inc' })]),
    );
    renderWithProviders(<AdminPage onNavigate={noop} />);

    await user.click(screen.getByRole('button', { name: 'Organizations' }));

    expect(await screen.findByText('@acme')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search organizations...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Permanently delete @acme' })).toBeInTheDocument();
  });

  it('does not load organizations until their tab is opened', async () => {
    renderWithProviders(<AdminPage onNavigate={noop} />);

    expect(await screen.findByText('Administration')).toBeInTheDocument();
    expect(apiMock.getOrganizations).not.toHaveBeenCalled();
  });

  it('opens the maintenance tab with the prune tool', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: /Maintenance/ }));
    expect(screen.getByText('Prune Dormant Accounts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan for Dormant Accounts/ })).toBeInTheDocument();
  });

  it('lists the pending moderation queue with review actions', async () => {
    renderWithProviders(<AdminPage onNavigate={noop} />);
    expect(await screen.findByText('Demo Extension')).toBeInTheDocument();
    expect(screen.getByText('@kane/demo')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('approves a pending submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(apiMock.reviewVersion).toHaveBeenCalledWith('kane', 'demo', '1.0.0', {
      status: 'approved',
    });
    expect(
      await screen.findByText('Version v1.0.0 of @kane/demo has been approved and published!'),
    ).toBeInTheDocument();
  });

  it('rejects a pending submission with feedback through the modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Reject this version')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/the icon is missing/), 'Missing icon asset.');
    await user.click(screen.getByRole('button', { name: 'Reject version' }));
    expect(apiMock.reviewVersion).toHaveBeenCalledWith('kane', 'demo', '1.0.0', {
      status: 'rejected',
      reason: 'Missing icon asset.',
    });
    expect(
      await screen.findByText('Version v1.0.0 of @kane/demo was rejected.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reject this version')).not.toBeInTheDocument();
  });

  it('filters the catalog via search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: 'Extensions' }));
    await user.type(screen.getByPlaceholderText(/Search extensions/), 'physics');
    await user.keyboard('{Enter}');
    expect(apiMock.searchExtensions).toHaveBeenCalledWith('physics', { limit: 50 });
  });

  it('deletes another account after typing its namespace', async () => {
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ role: 'normal' }),
        makeUser({ namespace: 'ada', displayName: 'Ada Lovelace', role: 'normal' }),
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Accounts' }));
    await user.click(await screen.findByTitle('Permanently delete @ada'));

    const confirmButton = screen.getByRole('button', { name: 'Permanently delete' });
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Type ada to confirm/), 'ada');
    await user.click(confirmButton);
    expect(apiMock.deleteUser).toHaveBeenCalledWith('ada');
    expect(
      await screen.findByText('Account @ada has been permanently deleted.'),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('Permanently delete @ada')).not.toBeInTheDocument();
  });

  it('does not delete an account when confirmation is cancelled', async () => {
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ role: 'normal' }),
        makeUser({ namespace: 'ada', displayName: 'Ada Lovelace', role: 'normal' }),
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Accounts' }));
    await user.click(await screen.findByTitle('Permanently delete @ada'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(apiMock.deleteUser).not.toHaveBeenCalled();
    expect(screen.getByTitle('Permanently delete @ada')).toBeInTheDocument();
  });

  it('loads more of the moderation queue via the cursor', async () => {
    apiMock.listVersionsForReview.mockResolvedValueOnce(
      paginated([makePendingVersion()], 'cursor-1', true),
    );
    apiMock.listVersionsForReview.mockResolvedValueOnce(
      paginated([makePendingVersion({ version: '2.0.0' })]),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');

    await user.click(screen.getByRole('button', { name: 'Load more submissions' }));

    expect(apiMock.listVersionsForReview).toHaveBeenLastCalledWith({ cursor: 'cursor-1' });
  });

  it('inspects another account sessions and tokens', async () => {
    apiMock.getUsers.mockResolvedValue(
      paginated([makeUser({ namespace: 'ada', displayName: 'Ada Lovelace' })]),
    );
    apiMock.getSessions.mockResolvedValue(paginated([makeSession()]));
    apiMock.getTokens.mockResolvedValue(paginated([makeToken()]));
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);

    await user.click(screen.getByRole('button', { name: 'Accounts' }));
    await user.click(await screen.findByTitle('Account activity for @ada'));

    expect(apiMock.getSessions).toHaveBeenCalledWith({ namespace: 'ada' });
    expect(apiMock.getTokens).toHaveBeenCalledWith({ namespace: 'ada' });
    expect(await screen.findByText('Active sessions (1)')).toBeInTheDocument();
    expect(screen.getByText('Access tokens (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends admins to Settings instead of the activity modal for their own account', async () => {
    const onNavigate = vi.fn();
    apiMock.getUsers.mockResolvedValue(paginated([makeAdminUser({ namespace: 'kane' })]));
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Accounts' }));
    expect(screen.queryByTitle('Account activity for @kane')).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: 'Manage your account in Settings' }),
    );
    expect(onNavigate).toHaveBeenCalledWith('settings');
    expect(apiMock.getSessions).not.toHaveBeenCalled();
  });

  it('publishes a policy revision from the markdown editor', async () => {
    apiMock.updateTerms.mockResolvedValue({
      version: 3,
      body: '# Updated Terms',
      updatedAt: '2026-04-01T00:00:00Z',
    });
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);

    await user.click(screen.getByRole('button', { name: 'Policies' }));
    const openButtons = await screen.findAllByRole('button', { name: /Open Editor/ });
    await user.click(openButtons[0]);

    const editor = await screen.findByRole('textbox', {
      name: 'Terms of Service markdown editor',
    });
    await user.clear(editor);
    await user.type(editor, '# Updated Terms');
    await user.click(screen.getByRole('button', { name: /Publish Revision/ }));

    expect(apiMock.updateTerms).toHaveBeenCalledWith('# Updated Terms');
    expect(await screen.findByText('Terms of Service updated to revision #3.')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Terms of Service markdown editor' }),
    ).not.toBeInTheDocument();
  });

  it('opens the source review editor and loads the compiled source', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: /Inspect/ }));

    expect(await screen.findByRole('heading', { name: 'Demo Extension' })).toBeInTheDocument();

    const codeEditor = await screen.findByRole('textbox', {
      name: 'extension.js source (read-only)',
    });
    expect(codeEditor).toHaveAttribute('readonly');
    expect(codeEditor).toHaveValue(codeJs);
    expect(apiMock.downloadVersion).toHaveBeenCalledWith('kane', 'demo', '1.0.0');
  });

  it('reports when pending source code cannot be loaded', async () => {
    const user = userEvent.setup();
    apiMock.downloadVersion.mockRejectedValue(new ApiError('Not Found', 404));
    renderWithProviders(<AdminPage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: /Inspect/ }));

    expect(await screen.findByText(/extension.js is not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Unable to load extension.js/i)).not.toBeInTheDocument();
  });
});

describe('AdminPage system metrics', () => {
  it('shows total downloads from the v1 Stats schema', async () => {
    renderWithProviders(<AdminPage onNavigate={noop} />);

    expect(await screen.findByText('Downloads')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('formats large download counts', async () => {
    apiMock.getStats.mockResolvedValue(makeStats({ downloads: 9876543 }));
    renderWithProviders(<AdminPage onNavigate={noop} />);

    expect(await screen.findByText('9,876,543')).toBeInTheDocument();
  });
});
