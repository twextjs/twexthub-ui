import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  makeAuthState,
  makeSession,
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

beforeEach(() => {
  apiMock.getSessions.mockResolvedValue(paginated([makeSession()]));
  apiMock.getTokens.mockResolvedValue(paginated([makeToken()]));
  apiMock.updateUser.mockResolvedValue(makeUser());
  apiMock.deleteUser.mockResolvedValue(undefined);
  apiMock.createToken.mockResolvedValue(
    makeToken({ id: 'tok-new', name: 'ci-dev', token: 'TWEXT-secret-1' }),
  );
  authState = makeAuthState();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue(authState);
});

describe('SettingsPage', () => {
  it('renders the account section by default', () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByPlaceholderText('e.g. Kane Marshall')).toBeInTheDocument();
  });

  it('puts each section under a heading of its own, and only the current one in the document', () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    // The heading and the sidebar entry are described in one place, so the
    // panel and its navigation can never disagree about what a section is.
    expect(screen.getByRole('heading', { level: 2, name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sessions' })).toBeNull();
  });

  it('redirects a signed-out visitor to login', async () => {
    useAuthMock.mockReturnValue(makeAuthState({ user: null, token: null, isAuthenticated: false }));
    const onNavigate = vi.fn();
    renderWithProviders(<SettingsPage onNavigate={onNavigate} />);
    expect(await screen.findByText('Redirecting to login...')).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('saves profile changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    const displayName = screen.getByPlaceholderText('e.g. Kane Marshall');
    await user.clear(displayName);
    await user.type(displayName, 'Kane Marshall');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(apiMock.updateUser).toHaveBeenCalledWith('kane', { displayName: 'Kane Marshall' });
    expect(authState.refreshUser).toHaveBeenCalled();
    expect(await screen.findByText('Account profile updated successfully.')).toBeInTheDocument();
  });

  it('saves bio, website, and github', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.type(screen.getByPlaceholderText('Tell visitors about yourself'), 'Hello there');
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://kane.dev');
    await user.type(screen.getByPlaceholderText('octocat'), 'kane');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(apiMock.updateUser).toHaveBeenCalledWith('kane', {
      bio: 'Hello there',
      website: 'https://kane.dev',
      github: 'kane',
    });
  });

  it('saves avatar and banner URLs entered through the link option', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.click(screen.getByTestId('avatar-toggle-url'));
    await user.type(screen.getByTestId('avatar-url'), 'https://cdn.example.com/me.png');
    await user.click(screen.getByTestId('banner-toggle-url'));
    await user.type(screen.getByTestId('banner-url'), 'https://cdn.example.com/banner.png');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(apiMock.updateUser).toHaveBeenCalledWith('kane', {
      avatarUrl: 'https://cdn.example.com/me.png',
      bannerUrl: 'https://cdn.example.com/banner.png',
    });
  });

  it('sends null to clear a profile field', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ bio: 'old bio', website: 'https://old.example' }) }),
    );
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.clear(screen.getByDisplayValue('old bio'));
    await user.clear(screen.getByDisplayValue('https://old.example'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(apiMock.updateUser).toHaveBeenCalledWith('kane', {
      bio: null,
      website: null,
    });
  });

  it('prefills existing profile fields', () => {
    useAuthMock.mockReturnValue(
      makeAuthState({
        user: makeUser({
          bio: 'a bio',
          website: 'https://kane.dev',
          github: 'kane',
          avatarUrl: 'https://cdn.example.com/me.png',
          bannerUrl: 'https://cdn.example.com/banner.png',
        }),
      }),
    );
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    expect(screen.getByDisplayValue('a bio')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://kane.dev')).toBeInTheDocument();
    expect(screen.getByDisplayValue('kane')).toBeInTheDocument();
    expect(screen.getByTestId('banner-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/banner.png',
    );
    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/me.png',
    );
  });

  it('shows an empty placeholder for a banner and the identicon for an avatar', () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    // A banner has no generated fallback, so an unset one is visibly empty.
    expect(screen.getByTestId('banner-empty')).toBeInTheDocument();
    // An avatar falls back to the registry identicon rather than to nothing.
    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      '/api/v2/users/kane/avatar',
    );
  });

  it('falls back to the registry avatar endpoint when only a banner is set', () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ user: makeUser({ bannerUrl: 'https://cdn.example.com/b.png' }) }),
    );
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      '/api/v2/users/kane/avatar',
    );
    expect(screen.getByTestId('banner-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/b.png',
    );
  });

  it('rejects a non-http avatar URL without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.click(screen.getByTestId('avatar-toggle-url'));
    await user.type(screen.getByTestId('avatar-url'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText('Avatar image URL must be an http:// or https:// URL.'),
    ).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a GitHub URL that is not a username', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.type(screen.getByPlaceholderText('octocat'), 'https://github.com/kane');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('GitHub must be a username, not a URL.')).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('requires and sends the current password when changing it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'new-secret-1');
    await user.type(screen.getByPlaceholderText('Your existing password'), 'old-secret-1');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(apiMock.updateUser).toHaveBeenCalledWith('kane', {
      password: 'new-secret-1',
      currentPassword: 'old-secret-1',
    });
  });

  it('warns when a new password is set without the current one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    await user.type(screen.getByPlaceholderText('Minimum 8 characters'), 'new-secret-1');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(apiMock.updateUser).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Enter your current password to set a new one.'),
    ).toBeInTheDocument();
  });

  it('creates a token with an expiration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');
    await user.type(screen.getByPlaceholderText(/github-actions-ci or release-bot/), 'ci');
    await user.selectOptions(screen.getByRole('combobox'), '30');
    await user.click(screen.getByRole('button', { name: /Create Automation Token/ }));
    expect(apiMock.createToken).toHaveBeenCalledWith({
      name: 'ci',
      scopes: ['publish'],
      expiresInDays: 30,
    });
  });

  it('renames and rescopes a token inline', async () => {
    apiMock.updateToken.mockResolvedValue(
      makeToken({ id: 'tok-1', name: 'renamed', scopes: ['publish', 'yank'] }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');

    await user.click(screen.getByTitle('Edit Token'));
    const nameInput = screen.getByDisplayValue('ci-deploy');
    await user.clear(nameInput);
    await user.type(nameInput, 'renamed');
    await user.click(screen.getByRole('checkbox', { name: 'yank' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(apiMock.updateToken).toHaveBeenCalledWith('tok-1', {
      name: 'renamed',
      scopes: ['publish', 'yank'],
    });
    expect(await screen.findByText('Automation token updated successfully.')).toBeInTheDocument();
  });

  it('offers every scope when editing a token', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');
    await user.click(screen.getByTitle('Edit Token'));

    for (const scope of [
      'publish',
      'yank',
      'read:source',
      'manage:account',
      'manage:orgs',
      'manage:sessions',
      'manage:tokens',
      'admin',
    ]) {
      expect(screen.getByRole('checkbox', { name: scope })).toBeInTheDocument();
    }
  });

  it('creates a token with one of the newer scopes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');
    await user.type(screen.getByPlaceholderText(/github-actions-ci or release-bot/), 'ci');
    await user.click(screen.getByRole('checkbox', { name: /read:source/ }));
    await user.click(screen.getByRole('button', { name: /Create Automation Token/ }));
    expect(apiMock.createToken).toHaveBeenCalledWith({
      name: 'ci',
      scopes: ['publish', 'read:source'],
    });
  });

  it('loads additional sessions via the pagination cursor', async () => {
    apiMock.getSessions.mockResolvedValueOnce(
      paginated([makeSession({ id: 'sess-1' })], 'cursor-2', true),
    );
    apiMock.getSessions.mockResolvedValueOnce(paginated([makeSession({ id: 'sess-2' })]));
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await screen.findByText('Active Web Sessions');

    await user.click(screen.getByRole('button', { name: 'Load more sessions' }));

    expect(apiMock.getSessions).toHaveBeenLastCalledWith({ cursor: 'cursor-2' });
  });

  it('revokes an active session from the sessions section', async () => {
    apiMock.getSessions.mockResolvedValue(
      paginated([
        makeSession({ id: 'sess-1', lastUsedAt: '2026-03-01T00:00:00Z' }),
        makeSession({ id: 'sess-2', lastUsedAt: '2026-03-02T00:00:00Z' }),
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await screen.findByText('Active Web Sessions');
    await user.click(
      screen
        .getAllByRole('button', { name: 'Revoke' })
        .filter((button) => !(button as HTMLButtonElement).disabled)[0],
    );
    expect(apiMock.revokeSession).toHaveBeenCalledWith('sess-1');
    expect(await screen.findByText('Session revoked successfully.')).toBeInTheDocument();
  });

  it('creates a token and reveals the one-time secret', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');
    await user.type(screen.getByPlaceholderText(/github-actions-ci or release-bot/), 'ci-dev');
    await user.click(screen.getByRole('button', { name: /Create Automation Token/ }));
    expect(apiMock.createToken).toHaveBeenCalledWith({ name: 'ci-dev', scopes: ['publish'] });
    expect(await screen.findByText('Your New Automation Token')).toBeInTheDocument();
    expect(screen.getByText('TWEXT-secret-1')).toBeInTheDocument();
  });

  it('labels a session by its id rather than a token', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Sessions' }));
    await screen.findByText('Active Web Sessions');
    expect(screen.getByText('Session sess-1…')).toBeInTheDocument();
  });

  it('deletes an automation token after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: 'Access Tokens' }));
    await screen.findByText('Access Tokens (1)');
    await user.click(screen.getByRole('button', { name: 'Revoke Token' }));
    await user.click(screen.getByRole('button', { name: 'Delete token' }));
    expect(apiMock.deleteToken).toHaveBeenCalledWith('tok-1');
    expect(await screen.findByText('Token deleted successfully.')).toBeInTheDocument();
  });

  it('deletes the account and signs out after typing the namespace', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<SettingsPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    const confirmButton = screen.getByRole('button', { name: 'Delete account' });
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Type kane to confirm/), 'kane');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(apiMock.deleteUser).toHaveBeenCalledWith('kane');
    expect(authState.logout).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('home');
  });
});

describe('SettingsPage v1 profile limits', () => {
  const save = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
  };

  /** Bypass the input's own maxLength so the guard is what rejects the value. */
  const forceValue = (element: HTMLElement, value: string) => {
    fireEvent.change(element, { target: { value } });
  };

  it('caps the display name at the registry limit of 80', () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    expect(screen.getByLabelText(/Display Name/)).toHaveAttribute('maxlength', '80');
  });

  it('caps bio, website, github, avatar and banner inputs', () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    expect(screen.getByLabelText(/^Bio/)).toHaveAttribute('maxlength', '280');
    expect(screen.getByLabelText(/^Website/)).toHaveAttribute('maxlength', '400');
    expect(screen.getByLabelText(/GitHub username/)).toHaveAttribute('maxlength', '39');
  });

  it('keeps the link option behind a toggle and caps it when opened', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);

    // The URL fields are an alternative, not the primary affordance.
    expect(screen.queryByTestId('avatar-url')).toBeNull();
    await user.click(screen.getByTestId('avatar-toggle-url'));
    expect(screen.getByTestId('avatar-url')).toHaveAttribute('maxlength', '400');
    await user.click(screen.getByTestId('banner-toggle-url'));
    expect(screen.getByTestId('banner-url')).toHaveAttribute('maxlength', '400');
  });

  it('rejects a display name longer than 80 characters', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/Display Name/), 'a'.repeat(81));
    await save();

    expect(
      await screen.findByText('Display name must be 80 characters or fewer.'),
    ).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a website longer than 400 characters', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/^Website/), `https://example.com/${'a'.repeat(400)}`);
    await save();

    expect(await screen.findByText('Website must be 400 characters or fewer.')).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an avatar URL longer than 400 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByTestId('avatar-toggle-url'));
    forceValue(screen.getByTestId('avatar-url'), `https://example.com/${'a'.repeat(400)}.png`);
    await save();

    expect(
      await screen.findByText('Avatar image URL must be 400 characters or fewer.'),
    ).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a banner URL longer than 400 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    await user.click(screen.getByTestId('banner-toggle-url'));
    forceValue(screen.getByTestId('banner-url'), `https://example.com/${'a'.repeat(400)}.png`);
    await save();

    expect(
      await screen.findByText('Banner image URL must be 400 characters or fewer.'),
    ).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a GitHub username with a trailing hyphen, which the API refuses', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/GitHub username/), 'kane-');
    await save();

    expect(await screen.findByText('GitHub must be a username, not a URL.')).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a GitHub username with a leading hyphen', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/GitHub username/), '-kane');
    await save();

    expect(await screen.findByText('GitHub must be a username, not a URL.')).toBeInTheDocument();
    expect(apiMock.updateUser).not.toHaveBeenCalled();
  });

  it('accepts a hyphenated GitHub username', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/GitHub username/), 'kane-dev');
    await save();

    await waitFor(() =>
      expect(apiMock.updateUser).toHaveBeenCalledWith('kane', { github: 'kane-dev' }),
    );
  });

  it('accepts a single-character GitHub username', async () => {
    renderWithProviders(<SettingsPage onNavigate={noop} />);
    forceValue(screen.getByLabelText(/GitHub username/), 'k');
    await save();

    await waitFor(() => expect(apiMock.updateUser).toHaveBeenCalledWith('kane', { github: 'k' }));
  });
});
