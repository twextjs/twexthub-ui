import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { ExtensionSummary } from '../types/api';
import { Icon, IconName } from './Icon';
import { Modal } from './Modal';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: IconName;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onNavigate }) => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExtensionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchExtensions(trimmed, { limit: 6 });
        if (!cancelled) setResults(res.data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const commands = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      {
        id: 'nav-home',
        label: 'Home',
        group: 'Navigate',
        icon: 'home',
        run: () => onNavigate('home'),
      },
      {
        id: 'nav-explore',
        label: 'Explore Extensions',
        hint: 'search',
        group: 'Navigate',
        icon: 'explore',
        run: () => onNavigate('search'),
      },
      {
        id: 'nav-saved',
        label: 'Saved Extensions',
        group: 'Navigate',
        icon: 'bookmark',
        run: () => onNavigate('saved'),
      },
      {
        id: 'action-theme',
        label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        group: 'Actions',
        icon: theme === 'dark' ? 'light_mode' : 'dark_mode',
        run: toggleTheme,
      },
      {
        id: 'nav-terms',
        label: 'Terms of Service',
        group: 'Navigate',
        icon: 'description',
        run: () => onNavigate('terms'),
      },
      {
        id: 'nav-privacy',
        label: 'Privacy Policy',
        group: 'Navigate',
        icon: 'lock',
        run: () => onNavigate('privacy'),
      },
    ];

    if (isAuthenticated) {
      items.splice(3, 0, {
        id: 'nav-dashboard',
        label: 'Dashboard',
        hint: user?.namespace ? `@${user.namespace}` : undefined,
        group: 'Navigate',
        icon: 'person',
        run: () => onNavigate('dashboard'),
      });
      items.splice(4, 0, {
        id: 'nav-settings',
        label: 'Settings',
        group: 'Navigate',
        icon: 'settings',
        run: () => onNavigate('settings'),
      });
      items.push({
        id: 'action-logout',
        label: 'Sign Out',
        group: 'Actions',
        icon: 'logout',
        run: async () => {
          await logout();
          onNavigate('home');
        },
      });
    }

    if (isAdmin) {
      items.splice(5, 0, {
        id: 'nav-admin',
        label: 'Registry Administration',
        group: 'Navigate',
        icon: 'shield',
        run: () => onNavigate('admin'),
      });
    }

    return items;
  }, [isAdmin, isAuthenticated, onNavigate, theme, toggleTheme, user?.namespace, logout]);

  const items = useMemo<PaletteItem[]>(() => {
    const trimmed = query.trim().toLowerCase();
    const filteredCommands = trimmed
      ? commands.filter((command) => command.label.toLowerCase().includes(trimmed))
      : commands;
    const extensionItems: PaletteItem[] = results.map((ext) => ({
      id: `ext-${ext.namespace}-${ext.id}`,
      label: ext.name,
      hint: `@${ext.namespace}/${ext.id}`,
      group: 'Extensions',
      icon: 'inventory_2',
      run: () => onNavigate(`ext/${ext.namespace}/${ext.id}`),
    }));
    return [...extensionItems, ...filteredCommands];
  }, [commands, query, results, onNavigate]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const select = (item: PaletteItem) => {
    onClose();
    void item.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) select(item);
    }
  };

  let lastGroup = '';

  return (
    <Modal
      onClose={onClose}
      size="xl"
      zIndex={65}
      ariaLabel="Command palette"
      initialFocusRef={inputRef}
      className="p-0 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3.5 py-3 border-b border-line">
        <Icon name="search" className="text-ink-3 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search extensions or jump to a page..."
          aria-label="Command palette search"
          aria-expanded
          aria-controls="command-palette-results"
          aria-activedescendant={
            items.length > 0 ? `command-palette-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
        />
        {loading && (
          <Icon name="progress_activity" className="icon-sm text-ink-3 animate-spin shrink-0" />
        )}
        <kbd className="hidden sm:inline-block text-micro font-mono text-ink-3 border border-line rounded px-1.5 py-0.5">
          Esc
        </kbd>
      </div>

      <div
        id="command-palette-results"
        role="listbox"
        aria-label="Command palette results"
        className="max-h-[55vh] overflow-y-auto py-1.5"
      >
        {items.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-ink-3">
            {query.trim().length >= 2 && !loading
              ? 'No matching extensions or commands.'
              : 'Type at least two characters to search the registry.'}
          </p>
        ) : (
          items.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            const isActive = index === activeIndex;
            return (
              <React.Fragment key={item.id}>
                {showGroup && (
                  <div className="px-3.5 pt-2 pb-1 text-micro font-semibold uppercase tracking-wide text-ink-3">
                    {item.group}
                  </div>
                )}
                <div
                  id={`command-palette-option-${index}`}
                  ref={isActive ? activeRef : undefined}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={`mx-1.5 px-2.5 py-2 rounded-lg cursor-pointer flex items-center gap-2.5 text-sm ${
                    isActive ? 'bg-wash dark:bg-raised text-ink' : 'text-ink-2'
                  }`}
                >
                  <Icon name={item.icon} className="text-ink-3 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="text-meta font-mono text-ink-3 truncate">{item.hint}</span>
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </Modal>
  );
};
