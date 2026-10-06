import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRecentExtensions, useSavedExtensions } from '../hooks/useCollections';
import { api } from '../services/api';
import { NotificationInbox } from './NotificationInbox';
import { Icon, type IconName } from './Icon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDismissable } from '../hooks/useDismissable';
import { toSameOriginImageUrl } from '../lib/profile-image';
import type { Meta, User } from '../types/api';

const COLLAPSE_KEY = 'twexthub:sidebar-collapsed';

/** How many entries the recent list shows before the user is pointed at Search. */
const LIST_LIMIT = 3;

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    // Private browsing and blocked storage both throw here; the full column is
    // a safe default because every control stays reachable either way.
    return false;
  }
};

const writeCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch {
    // The choice simply will not survive a reload.
  }
};

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onOpenCommandPalette?: () => void;
}

interface NavRowProps {
  icon: IconName;
  label: string;
  collapsed: boolean;
  active?: boolean;
  tone?: 'lilac' | 'amber';
  badge?: number;
  badgeClassName?: string;
  onClick: () => void;
  testId?: string;
}

const NavRow: React.FC<NavRowProps> = ({
  icon,
  label,
  collapsed,
  active = false,
  tone = 'lilac',
  badge,
  badgeClassName,
  onClick,
  testId,
}) => {
  const count = badge && badge > 0 ? badge : null;
  const tip = count === null ? label : `${label} · ${count}`;

  // Active rows take a wash of the route's own accent behind a bar down their
  // leading edge, so Admin never reads as a lilac destination.
  const activeTone =
    tone === 'amber'
      ? 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300'
      : 'border-lilac-500 bg-lilac-500/10 text-lilac-700 dark:text-lilac-300';
  const idleTone = 'border-transparent text-ink-2 hover:bg-wash hover:text-ink';

  return (
    <button
      type="button"
      onClick={onClick}
      data-tip={collapsed ? tip : undefined}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      className={`sidebar-row flex w-full items-center rounded-r border-l-2 py-1.5 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
      } ${active ? `${activeTone} font-semibold` : idleTone}`}
    >
      <Icon name={icon} filled={active} className={collapsed ? '' : 'icon-sm'} />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
      {count !== null && (
        <span
          className={`font-mono text-micro font-bold leading-tight ${collapsed ? 'sr-only' : 'ml-auto'} ${
            badgeClassName ??
            'rounded-full bg-lilac-100 px-1.5 py-0.5 text-lilac-700 dark:bg-lilac-900 dark:text-lilac-300'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
};

const GroupLabel: React.FC<{ collapsed: boolean; children: string }> = ({ collapsed, children }) =>
  collapsed ? null : <h2 className="label px-3 pt-4 pb-1 first:pt-2">{children}</h2>;

/**
 * The signed-in author's own account, shown the same way the public profile
 * page renders it. The sidebar holds this permanently, so there is no popover
 * to open and no way for it to sit behind the content it describes.
 */
const AccountCard: React.FC<{
  user: User;
  collapsed: boolean;
  onNavigate: (route: string) => void;
  onSignOut: () => void;
}> = ({ user, collapsed, onNavigate, onSignOut }) => {
  const displayName = user.displayName || user.namespace;
  const avatar =
    toSameOriginImageUrl(
      user.avatarUrl || `${api.getBaseUrl()}/users/${user.namespace}/avatar`,
      api.getBaseUrl(),
    ) ?? undefined;

  if (collapsed) {
    return (
      <NavRow
        icon="person"
        label="Your profile"
        collapsed
        onClick={() => onNavigate(`author/${user.namespace}`)}
        testId="profile-trigger"
      />
    );
  }

  return (
    <div className="card mt-3 p-3" data-testid="account-card">
      <button
        type="button"
        onClick={() => onNavigate(`author/${user.namespace}`)}
        className="flex w-full items-start gap-2.5 text-left"
        data-testid="profile-trigger"
      >
        <img
          src={avatar}
          alt=""
          className="w-9 h-9 rounded-lg object-cover bg-wash border border-line shrink-0"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{displayName}</div>
          <div className="text-meta font-mono text-ink-3 truncate">@{user.namespace}</div>
        </div>
      </button>

      {user.bio && (
        <p className="mt-2 text-meta leading-relaxed text-ink-2 line-clamp-4 whitespace-pre-wrap break-words">
          {user.bio}
        </p>
      )}

      {(user.website || user.github) && (
        <div className="mt-2 space-y-1">
          {user.website && (
            <a
              href={user.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-1.5 text-meta text-lilac-700 dark:text-lilac-300 hover:underline break-all"
            >
              <Icon name="link" className="shrink-0" />
              {user.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {user.github && (
            <a
              href={`https://github.com/${user.github}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-1.5 text-meta font-mono text-ink-2 hover:text-ink"
            >
              <span className="text-ink-3">@</span>
              {user.github}
            </a>
          )}
        </div>
      )}

      {!user.bio && !user.website && !user.github && (
        <p className="mt-2 text-meta leading-relaxed text-ink-3">
          Add a bio, website, or GitHub username so visitors can learn more about you.
        </p>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="mt-2.5 flex w-full items-center gap-2 border-t border-line pt-2 text-xs font-medium text-rose-600 dark:text-rose-400 transition-colors hover:text-rose-700 dark:hover:text-rose-300"
      >
        <Icon name="logout" />
        <span>Sign out</span>
      </button>
    </div>
  );
};

/**
 * The site's primary navigation, replacing the old top bar.
 *
 * Desktop gets a fixed column that collapses to an icon rail; below `lg` the
 * same contents move into an off-canvas drawer behind a small top bar. Both
 * render the identical body, so a destination can never exist on one and be
 * missing from the other.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  onOpenCommandPalette,
}) => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { saved } = useSavedExtensions();
  const { recent, clear: clearRecent } = useRecentExtensions();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => writeCollapsed(collapsed), [collapsed]);

  // The drawer takes the page with it, so a scroll gesture on the panel cannot
  // chain onward to the content behind it.
  useBodyScrollLock(drawerOpen);
  useDismissable(drawerRef, () => setDrawerOpen(false), drawerTriggerRef, drawerOpen);

  useEffect(() => {
    let isMounted = true;
    api
      .getMeta()
      .then((data) => {
        if (isMounted) setMeta(data);
      })
      .catch(() => {
        // Product metadata is optional; the links fall back to fixed copy.
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    const checkPending = async () => {
      try {
        const stats = await api.getStats();
        if (!cancelled) setPendingCount(stats.pending || 0);
      } catch {
        // ignore
      }
    };
    checkPending();
    const interval = setInterval(checkPending, 25000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin]);

  // A single call reports the whole-mailbox unread count, so the badge needs no paging.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const checkUnread = async () => {
      try {
        const res = await api.getNotifications({ limit: 1 });
        if (!cancelled) setUnreadCount(res.unreadCount || 0);
      } catch {
        // ignore
      }
    };
    checkUnread();
    const interval = setInterval(checkUnread, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Query-bearing routes still count as the bare route they belong to, so
  // /search?q=pet leaves Explore marked as the current destination.
  const isActive = useCallback(
    (route: string) =>
      currentRoute === route ||
      currentRoute.startsWith(`${route}/`) ||
      currentRoute.startsWith(`${route}?`),
    [currentRoute],
  );

  const signOut = useCallback(async () => {
    await logout();
    setDrawerOpen(false);
    onNavigate('home');
  }, [logout, onNavigate]);

  /** Collapsed rails have no room for a field, so the icon reopens the column. */
  const expandFor = useCallback(() => {
    setCollapsed(false);
  }, []);

  const go = useCallback(
    (route: string) => {
      setDrawerOpen(false);
      onNavigate(route);
    },
    [onNavigate],
  );

  const openPalette = () => {
    if (!onOpenCommandPalette) return;
    setDrawerOpen(false);
    onOpenCommandPalette();
  };

  /**
   * The whole navigation body, rendered into either the desktop column or the
   * mobile drawer. `collapsed` is the only thing that changes between them.
   */
  const renderTop = (collapsed: boolean) => {
    return (
      <>
        {/* The palette is the column's search: it jumps to a matching extension
            or to any page by name, so one row stands in for a field and its
            keyboard twin. */}
        {onOpenCommandPalette &&
          (collapsed ? (
            <NavRow
              icon="terminal"
              label="Command palette"
              collapsed
              onClick={openPalette}
              testId="sidebar-palette"
            />
          ) : (
            <div className="px-3 pt-2">
              <button
                type="button"
                onClick={openPalette}
                data-testid="sidebar-palette"
                className="sidebar-row flex w-full items-center gap-2.5 rounded-r border-l-2 border-transparent px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-wash hover:text-ink"
              >
                <Icon name="terminal" className="icon-sm" />
                <span className="truncate">Command palette</span>
                <kbd className="ml-auto rounded border border-line bg-surface px-1 py-0.5 font-mono text-micro leading-none text-ink-3">
                  K
                </kbd>
              </button>
            </div>
          ))}

        {/* Public destinations, available signed in or out. */}
        <GroupLabel collapsed={collapsed}>Browse</GroupLabel>
        <div className="space-y-0.5 px-0">
          <NavRow
            icon="home"
            label="Home"
            collapsed={collapsed}
            active={isActive('home')}
            onClick={() => go('home')}
          />
          <NavRow
            icon="explore"
            label="Explore"
            collapsed={collapsed}
            active={isActive('search')}
            onClick={() => go('search')}
          />
          <NavRow
            icon="bookmark"
            label="Saved"
            collapsed={collapsed}
            active={isActive('saved')}
            badge={saved.length}
            onClick={() => go('saved')}
            testId="sidebar-saved"
          />
          {/* An organization is not an account, so it gets its own row rather
              than a page hanging off Settings. */}
          <NavRow
            icon="group"
            label="Organizations"
            collapsed={collapsed}
            active={isActive('organizations') || isActive('org')}
            onClick={() => go('organizations')}
            testId="sidebar-organizations"
          />
        </div>

        {!isAuthenticated ? (
          <div className="mt-3 space-y-1.5 px-3">
            <button
              type="button"
              onClick={() => go('login')}
              className="sidebar-row btn btn-secondary w-full justify-center"
            >
              <Icon name="login" />
              Log in
            </button>
            <button
              type="button"
              onClick={() => go('signup')}
              className="sidebar-row btn btn-primary w-full justify-center"
            >
              <Icon name="person_add" />
              Sign up
            </button>
          </div>
        ) : (
          <>
            <GroupLabel collapsed={collapsed}>Account</GroupLabel>
            <div className="space-y-0.5">
              <NavRow
                icon="grid_view"
                label="Dashboard"
                collapsed={collapsed}
                active={isActive('dashboard')}
                onClick={() => go('dashboard')}
                testId="sidebar-dashboard"
              />
              <NavRow
                icon="notifications"
                label="Notifications"
                collapsed={collapsed}
                badge={unreadCount}
                onClick={() => {
                  setDrawerOpen(false);
                  setInboxOpen(true);
                }}
                testId="sidebar-notifications"
              />
              <NavRow
                icon="settings"
                label="Settings"
                collapsed={collapsed}
                active={isActive('settings') || isActive('sessions-tokens')}
                onClick={() => go('settings')}
                testId="sidebar-settings"
              />
              {isAdmin && (
                <NavRow
                  icon="shield"
                  label="Admin"
                  collapsed={collapsed}
                  active={isActive('admin')}
                  tone="amber"
                  badge={pendingCount}
                  badgeClassName="rounded-full bg-amber-600 px-1.5 py-0.5 text-white"
                  onClick={() => go('admin')}
                  testId="sidebar-admin"
                />
              )}
            </div>
          </>
        )}

        {/* The two local collections, so returning to something is one click. */}
        {recent.length > 0 && (
          <>
            <GroupLabel collapsed={collapsed}>Recently viewed</GroupLabel>
            {collapsed ? (
              <div className="px-0">
                <NavRow icon="schedule" label="Recently viewed" collapsed onClick={expandFor} />
              </div>
            ) : (
              <div className="px-3">
                <ul className="space-y-0.5">
                  {recent.slice(0, LIST_LIMIT).map((item) => (
                    <li key={`${item.namespace}/${item.id}`}>
                      <button
                        type="button"
                        onClick={() => go(`ext/${item.namespace}/${item.id}`)}
                        className="flex w-full items-center gap-2 rounded-r px-3 py-1 text-left font-mono text-meta text-ink-2 transition-colors hover:bg-wash hover:text-ink"
                      >
                        <span className="truncate">
                          @{item.namespace}/{item.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="mt-1 px-3 text-meta text-ink-3 transition-colors hover:text-ink"
                >
                  Clear
                </button>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  /**
   * The rows that stay at the foot of the column: who you are, then the links
   * that belong to the site rather than to any one page. Sitting below a
   * `mt-auto` wrapper, they rest on the bottom edge when the list above them is
   * short and scroll into reach when it is not.
   */
  const renderPinned = (collapsed: boolean) => {
    return (
      <>
        {isAuthenticated && user && (
          <div className="px-3">
            <AccountCard user={user} collapsed={collapsed} onNavigate={go} onSignOut={signOut} />
          </div>
        )}

        <div className="space-y-0.5 pt-3">
          <NavRow
            icon={theme === 'dark' ? 'light_mode' : 'dark_mode'}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            collapsed={collapsed}
            onClick={toggleTheme}
            testId="sidebar-theme"
          />
          <NavRow
            icon="description"
            label="Terms of Service"
            collapsed={collapsed}
            active={isActive('terms')}
            onClick={() => go('terms')}
          />
          <NavRow
            icon="shield"
            label="Privacy Policy"
            collapsed={collapsed}
            active={isActive('privacy')}
            onClick={() => go('privacy')}
          />
          {/* Settings and Access Tokens are two tabs of one page, so the
              Settings row above is what carries the active state there. */}
          <NavRow
            icon="key"
            label="Access Tokens"
            collapsed={collapsed}
            onClick={() => go('sessions-tokens')}
          />
        </div>

        {!collapsed && (
          <div className="space-y-1 px-3 pb-4 pt-1 text-meta text-ink-3">
            <a
              href="https://turbowarp.org"
              target="_blank"
              rel="noreferrer"
              className="sidebar-row flex items-center gap-1.5 transition-colors hover:text-lilac-700 dark:hover:text-lilac-300"
            >
              TurboWarp Editor
              <Icon name="open_in_new" />
            </a>
            {meta?.homepage && (
              <a
                href={meta.homepage}
                target="_blank"
                rel="noreferrer"
                className="sidebar-row flex items-center gap-1.5 break-all transition-colors hover:text-lilac-700 dark:hover:text-lilac-300"
              >
                {meta.homepage.replace(/^https?:\/\//, '')}
                <Icon name="open_in_new" className="shrink-0" />
              </a>
            )}
            <p className="font-mono">
              {meta?.name || 'Twext Team'}
              {meta?.version ? ` v${meta.version}` : ''}
            </p>
          </div>
        )}
      </>
    );
  };

  /**
   * The scrolling list with the account and site rows resting on its foot.
   * `flex-1` is what gives the footer somewhere to be pushed: without a grown
   * box there is no spare height for `mt-auto` to claim.
   */
  const renderNav = (collapsed: boolean, className: string, id?: string) => (
    <nav id={id} aria-label="Main" className={className}>
      {renderTop(collapsed)}
      <div className="mt-auto border-t border-line">{renderPinned(collapsed)}</div>
    </nav>
  );

  return (
    <>
      {/* Below lg the column becomes a drawer behind this bar. */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-canvas px-4 lg:hidden">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Twext Home"
          className="flex items-center"
        >
          <BrandLogo size="md" />
        </button>
        <div className="flex-1" />
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            className="relative flex h-9 w-9 items-center justify-center rounded text-ink-2 transition-colors hover:bg-wash hover:text-ink"
          >
            <Icon name="notifications" className="icon-sm" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] rounded-full bg-lilac-600 px-1 font-mono text-micro font-bold leading-tight text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}
        <button
          ref={drawerTriggerRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="sidebar-drawer"
          className="flex h-9 w-9 items-center justify-center rounded text-ink-2 transition-colors hover:bg-wash hover:text-ink"
        >
          <Icon name="menu" className="icon-lg" />
        </button>
      </header>

      {/* lg and up: the persistent column, full or collapsed to a rail. */}
      <aside
        className="sidebar-rail sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-canvas lg:flex"
        data-collapsed={collapsed}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="Twext Home"
            className="flex min-w-0 items-center"
          >
            <BrandLogo size="md" showText={!collapsed} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="sidebar-body"
            data-tip={collapsed ? 'Expand sidebar' : undefined}
            data-testid="sidebar-collapse"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 transition-colors hover:bg-wash hover:text-ink"
          >
            <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} className="icon-sm" />
          </button>
        </div>

        {renderNav(collapsed, 'sidebar-scroll flex min-h-0 flex-1 flex-col pb-2', 'sidebar-body')}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            id="sidebar-drawer"
            role="dialog"
            aria-label="Main menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-canvas shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                aria-label="Twext Home"
                className="flex min-w-0 items-center"
              >
                <BrandLogo size="md" />
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded text-ink-2 transition-colors hover:bg-wash hover:text-ink"
              >
                <Icon name="close" className="icon-sm" />
              </button>
            </div>
            {renderNav(false, 'flex min-h-0 flex-1 flex-col overflow-y-auto pb-4')}
          </div>
        </div>
      )}

      {inboxOpen && (
        <NotificationInbox
          variant="modal"
          onClose={() => setInboxOpen(false)}
          onNavigate={go}
          onUnreadChange={setUnreadCount}
        />
      )}
    </>
  );
};
