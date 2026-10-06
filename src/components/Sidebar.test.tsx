import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import { renderWithTheme } from '../test/testUtils';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { makeAuthState, makeStats, noop } from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const savedRef = vi.hoisted(() => ({ current: [] as { namespace: string; id: string }[] }));
const recentRef = vi.hoisted(() => ({ current: [] as { namespace: string; id: string }[] }));
const clearRecentMock = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useCollections', () => ({
  useSavedExtensions: () => ({
    saved: savedRef.current,
    isSaved: () => false,
    toggle: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
  useRecentExtensions: () => ({
    recent: recentRef.current,
    record: vi.fn(),
    clear: clearRecentMock,
  }),
}));

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);

const signedOut = () =>
  makeAuthState({ user: null, token: null, isAuthenticated: false, isAdmin: false });

const signedIn = (overrides = {}) =>
  makeAuthState({
    user: {
      namespace: 'kane',
      displayName: 'Kane Marshall',
      role: 'normal',
      hasPublished: false,
      bio: 'Builds things.',
      website: 'https://kane.dev',
      github: 'kane',
      avatarUrl: null,
      bannerUrl: null,
      createdAt: new Date().toISOString(),
      termsAcceptedVersion: 1,
    },
    isAuthenticated: true,
    isAdmin: false,
    token: 'tok',
    ...overrides,
  });

const emptyMailbox = {
  data: [],
  unreadCount: 0,
  pagination: { nextCursor: null, hasMore: false },
};

beforeEach(() => {
  localStorage.clear();
  savedRef.current = [];
  recentRef.current = [];
  clearRecentMock.mockClear();
  useAuthMock.mockReset();
  apiMock.getNotifications.mockResolvedValue(emptyMailbox);
  apiMock.getStats.mockResolvedValue(makeStats());
  apiMock.getMeta.mockResolvedValue({
    name: 'TwextHub',
    version: '1.2.3',
    tagline: 'A registry.',
    homepage: 'https://twexthub.test',
  });
  apiMock.getBaseUrl.mockReturnValue('https://api.test/v2');
  apiMock.logout?.mockResolvedValue(undefined);
});

/** The desktop column, so drawer queries cannot satisfy desktop assertions. */
const column = (container: HTMLElement) => within(container.querySelector('aside')!);

describe('Sidebar collapse', () => {
  it('starts as the full column and remembers a collapse across mounts', async () => {
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    const { container, unmount } = renderWithTheme(
      <Sidebar currentRoute="home" onNavigate={noop} />,
    );
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveAttribute('data-collapsed', 'false');

    await user.click(within(aside).getByTestId('sidebar-collapse'));
    expect(aside).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('twexthub:sidebar-collapsed')).toBe('1');

    unmount();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'true');
  });

  it('keeps every destination reachable by name once collapsed', async () => {
    useAuthMock.mockReturnValue(signedIn());
    const user = userEvent.setup();
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    await user.click(column(container).getByTestId('sidebar-collapse'));

    // Labels become visually hidden rather than removed, so the rail still
    // answers to its names for screen readers and for the flyout tooltips.
    const view = column(container);
    for (const name of ['Home', 'Explore', 'Saved', 'Dashboard', 'Settings']) {
      const row = view.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(row).toHaveAttribute('data-tip');
      expect(within(row).getByText(name)).toHaveClass('sr-only');
    }
  });

  it('opens the palette from the collapsed rail icon', async () => {
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    const onOpenCommandPalette = vi.fn();
    const { container } = renderWithTheme(
      <Sidebar currentRoute="home" onNavigate={noop} onOpenCommandPalette={onOpenCommandPalette} />,
    );

    await user.click(column(container).getByTestId('sidebar-collapse'));
    await user.click(column(container).getByTestId('sidebar-palette'));

    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
    // The rail is a shortcut now, not a place to type: no need to expand it.
    expect(container.querySelector('aside')).toHaveAttribute('data-collapsed', 'true');
  });
});

describe('Sidebar navigation', () => {
  it('marks only the destination matching the route as current', () => {
    useAuthMock.mockReturnValue(signedIn());
    const { container } = renderWithTheme(<Sidebar currentRoute="settings" onNavigate={noop} />);

    const view = column(container);
    expect(view.getByRole('button', { name: /^Settings/ })).toHaveAttribute('aria-current', 'page');
    expect(view.getByRole('button', { name: /^Explore/ })).not.toHaveAttribute('aria-current');
  });

  it('treats a query-bearing route as its base destination', () => {
    useAuthMock.mockReturnValue(signedOut());
    const { container } = renderWithTheme(
      <Sidebar currentRoute="search?q=pet" onNavigate={noop} />,
    );

    expect(column(container).getByRole('button', { name: /^Explore/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks the governance rows too, not just the primary destinations', () => {
    useAuthMock.mockReturnValue(signedOut());
    const { container: terms } = renderWithTheme(
      <Sidebar currentRoute="terms" onNavigate={noop} />,
    );
    expect(
      within(terms.querySelector('aside')!).getByRole('button', { name: /Terms of Service/ }),
    ).toHaveAttribute('aria-current', 'page');

    const { container: privacy } = renderWithTheme(
      <Sidebar currentRoute="privacy" onNavigate={noop} />,
    );
    expect(
      within(privacy.querySelector('aside')!).getByRole('button', { name: /Privacy Policy/ }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('marks the organizations row for the directory and for an organization', () => {
    useAuthMock.mockReturnValue(signedOut());
    const { container: directory } = renderWithTheme(
      <Sidebar currentRoute="organizations" onNavigate={noop} />,
    );
    expect(column(directory).getByRole('button', { name: /Organizations/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const { container: profile } = renderWithTheme(
      <Sidebar currentRoute="org/acme" onNavigate={noop} />,
    );
    expect(column(profile).getByRole('button', { name: /Organizations/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('navigates to the organizations directory', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(signedIn());
    const onNavigate = vi.fn();
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);

    await user.click(column(container).getByTestId('sidebar-organizations'));

    expect(onNavigate).toHaveBeenCalledWith('organizations');
  });

  it('marks only one row current when the two live inside one page', () => {
    useAuthMock.mockReturnValue(signedIn());
    const { container } = renderWithTheme(
      <Sidebar currentRoute="sessions-tokens" onNavigate={noop} />,
    );

    // Settings and Access Tokens are tabs of the same page, so the highlight
    // belongs to Settings alone rather than marking both.
    const current = column(container)
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Settings');
  });

  it('gives Admin the amber accent rather than the lilac one', () => {
    useAuthMock.mockReturnValue(signedIn({ isAdmin: true }));
    const { container } = renderWithTheme(<Sidebar currentRoute="admin" onNavigate={noop} />);

    const admin = column(container).getByTestId('sidebar-admin');
    expect(admin).toHaveAttribute('aria-current', 'page');
    expect(admin.className).toMatch(/border-amber-500/);
    expect(admin.className).not.toMatch(/border-lilac-500/);
  });

  it('hides Admin from everyone else', () => {
    useAuthMock.mockReturnValue(signedIn({ isAdmin: false }));
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(column(container).queryByTestId('sidebar-admin')).toBeNull();
  });

  it('sends each row to its own route', async () => {
    useAuthMock.mockReturnValue(signedIn());
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);
    const view = column(container);

    await user.click(view.getByTestId('sidebar-dashboard'));
    await user.click(view.getByTestId('sidebar-settings'));
    await user.click(view.getByRole('button', { name: /^Explore/ }));

    expect(onNavigate.mock.calls.map(([route]) => route)).toEqual([
      'dashboard',
      'settings',
      'search',
    ]);
  });

  it('opens the command palette from its row', async () => {
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    const onOpenCommandPalette = vi.fn();
    const { container } = renderWithTheme(
      <Sidebar currentRoute="home" onNavigate={noop} onOpenCommandPalette={onOpenCommandPalette} />,
    );

    await user.click(column(container).getByRole('button', { name: /Command palette/ }));
    expect(onOpenCommandPalette).toHaveBeenCalled();
  });
});

describe('Sidebar signed-out state', () => {
  it('offers the sign-in destinations and no account group', () => {
    useAuthMock.mockReturnValue(signedOut());
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);
    const view = column(container);

    expect(view.getByRole('button', { name: /Log in/ })).toBeInTheDocument();
    expect(view.getByRole('button', { name: /Sign up/ })).toBeInTheDocument();
    expect(view.queryByTestId('account-card')).toBeNull();
    expect(view.queryByTestId('sidebar-dashboard')).toBeNull();
  });

  it('keeps the governance links the footer used to carry', () => {
    useAuthMock.mockReturnValue(signedOut());
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);
    const view = column(container);

    expect(view.getByRole('button', { name: /Terms of Service/ })).toBeInTheDocument();
    expect(view.getByRole('button', { name: /Privacy Policy/ })).toBeInTheDocument();
    expect(view.getByRole('button', { name: /Access Tokens/ })).toBeInTheDocument();
  });
});

describe('Sidebar account card', () => {
  it('shows the account the way the public profile renders it', () => {
    useAuthMock.mockReturnValue(signedIn());
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    const card = within(column(container).getByTestId('account-card'));
    expect(card.getByText('Kane Marshall')).toBeInTheDocument();
    expect(card.getByText('@kane')).toBeInTheDocument();
    expect(card.getByText('Builds things.')).toBeInTheDocument();
    expect(card.getByText('kane.dev')).toBeInTheDocument();
  });

  it('navigates to the public profile instead of opening a popover', async () => {
    useAuthMock.mockReturnValue(signedIn());
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);

    await user.click(column(container).getByTestId('profile-trigger'));

    expect(onNavigate).toHaveBeenCalledWith('author/kane');
    expect(screen.queryByRole('dialog', { name: 'Your profile' })).toBeNull();
  });

  it('falls back to the registry identicon when no avatar is set', () => {
    useAuthMock.mockReturnValue(signedIn());
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(
      within(column(container).getByTestId('account-card')).getByRole('presentation'),
    ).toHaveAttribute('src', '/api/v2/users/kane/avatar');
  });

  it('signs out and returns to the home page', async () => {
    const state = signedIn();
    useAuthMock.mockReturnValue(state);
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderWithTheme(
      <Sidebar currentRoute="dashboard" onNavigate={onNavigate} />,
    );

    await user.click(
      within(column(container).getByTestId('account-card')).getByRole('button', {
        name: /Sign out/,
      }),
    );

    expect(state.logout).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('home');
  });
});

describe('Sidebar notifications', () => {
  it('shows no bell for signed-out visitors', () => {
    useAuthMock.mockReturnValue(signedOut());
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(screen.queryByTestId('sidebar-notifications')).toBeNull();
    expect(apiMock.getNotifications).not.toHaveBeenCalled();
  });

  it('badges the unread count from a single call', async () => {
    apiMock.getNotifications.mockResolvedValue({ ...emptyMailbox, unreadCount: 5 });
    useAuthMock.mockReturnValue(signedIn());
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    const row = await screen.findByTestId('sidebar-notifications');
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(apiMock.getNotifications).toHaveBeenCalledWith({ limit: 1 });
  });

  it('caps the displayed badge at 99+', async () => {
    apiMock.getNotifications.mockResolvedValue({ ...emptyMailbox, unreadCount: 250 });
    useAuthMock.mockReturnValue(signedIn());
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    // The mobile bar carries its own quick bell, so scope to the column.
    const row = await screen.findByTestId('sidebar-notifications');
    expect(within(row).getByText('99+')).toBeInTheDocument();
  });

  it('opens the inbox as a dialog rather than a popover', async () => {
    useAuthMock.mockReturnValue(signedIn());
    const user = userEvent.setup();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    await user.click(await screen.findByTestId('sidebar-notifications'));

    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('badges the admin queue from the instance stats', async () => {
    apiMock.getStats.mockResolvedValue(makeStats({ pending: 4 }));
    useAuthMock.mockReturnValue(signedIn({ isAdmin: true }));
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(await within(await screen.findByTestId('sidebar-admin')).findByText('4')).toBeVisible();
  });
});

describe('Sidebar local collections', () => {
  it('badges the saved count and sends the row to the saved page', async () => {
    savedRef.current = [
      { namespace: 'kane', id: 'pen' },
      { namespace: 'twexthub', id: 'core' },
    ];
    useAuthMock.mockReturnValue(signedIn());
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);

    const row = column(container).getByTestId('sidebar-saved');
    expect(row).toHaveTextContent('2');
    // The row is the whole affordance now, not a list header.
    expect(column(container).queryByText('Saved extensions')).toBeNull();

    await user.click(row);
    expect(onNavigate).toHaveBeenCalledWith('saved');
  });

  it('lists recently viewed extensions and clears them on request', async () => {
    recentRef.current = [{ namespace: 'scratch', id: 'stage' }];
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: '@scratch/stage' }));
    expect(onNavigate).toHaveBeenCalledWith('ext/scratch/stage');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clearRecentMock).toHaveBeenCalled();
  });

  it('hides both groups when there is nothing stored', () => {
    useAuthMock.mockReturnValue(signedOut());
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.queryByText('Recently viewed')).toBeNull();
  });
});

describe('Sidebar mobile drawer', () => {
  it('opens, closes on Escape, and closes after navigating', async () => {
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={onNavigate} />);

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Main menu' })).toBeNull();

    await user.click(trigger);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Main menu' })).getByRole('button', {
        name: /^Explore/,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith('search');
    expect(screen.queryByRole('dialog', { name: 'Main menu' })).toBeNull();
  });

  it('carries the same destinations as the desktop column', async () => {
    useAuthMock.mockReturnValue(signedIn({ isAdmin: true }));
    const user = userEvent.setup();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Main menu' }));

    for (const name of [/^Home/, /^Explore/, /^Saved/, /^Dashboard/, /^Settings/, /^Admin/]) {
      expect(drawer.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('locks the page behind it', async () => {
    useAuthMock.mockReturnValue(signedOut());
    const user = userEvent.setup();
    renderWithTheme(<Sidebar currentRoute="home" onNavigate={noop} />);

    expect(document.body.style.overflow).toBe('');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.body.style.overflow).toBe('hidden');
  });
});
