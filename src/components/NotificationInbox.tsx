import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../services/api';
import { Notification, NotificationKind } from '../types/api';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './Icon';
import { Modal } from './Modal';

const KIND_STYLES: Record<NotificationKind, string> = {
  'review.approved':
    'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'review.rejected':
    'bg-rose-50 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
  'terms.bumped':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'tokens.revoked':
    'bg-rose-50 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
  'role.changed':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  broadcast:
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'extension.owner.added':
    'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'extension.owner.removed':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  'extension.owner.invited':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'extension.owner.withdrawn': 'bg-wash dark:bg-raised text-ink-2 border-line',
  'extension.transfer.requested':
    'bg-lilac-50 dark:bg-lilac-950 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800/60',
  'extension.transfer.completed': 'bg-wash dark:bg-raised text-ink-2 border-line',
  'organization.owner.added':
    'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'organization.owner.removed':
    'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
};

/** Plain-language names for the kinds the server sends, so the list reads like words, not codes. */
const KIND_LABELS: Record<NotificationKind, string> = {
  'review.approved': 'Approved',
  'review.rejected': 'Changes requested',
  'terms.bumped': 'Terms updated',
  'tokens.revoked': 'Access removed',
  'role.changed': 'Permissions changed',
  broadcast: 'Announcement',
  'extension.owner.added': 'Added as owner',
  'extension.owner.removed': 'Removed as owner',
  'extension.owner.invited': 'Owner invitation',
  'extension.owner.withdrawn': 'Invitation withdrawn',
  'extension.transfer.requested': 'Transfer offered',
  'extension.transfer.completed': 'Transfer closed',
  'organization.owner.added': 'Added as organization owner',
  'organization.owner.removed': 'Removed as organization owner',
};

/**
 * Where a notification points. Most carry an extension and go straight to its
 * detail page. An organization's owner change names only the organization, and
 * the owner list is managed at that organization's own settings page, so it is
 * the destination there.
 */
const notificationRef = (notification: Notification) => {
  const namespace = notification.payload.namespace;
  if (typeof namespace !== 'string') return null;
  const id = notification.payload.id;
  if (typeof id === 'string') return `ext/${namespace}/${id}`;
  if (
    notification.kind === 'organization.owner.added' ||
    notification.kind === 'organization.owner.removed'
  ) {
    return `org/${namespace}/settings`;
  }
  return null;
};

interface NotificationInboxProps {
  onClose: () => void;
  onNavigate: (route: string) => void;
  onUnreadChange: (count: number) => void;
  /**
   * The bell that opened the menu. Treated as part of the popover so pressing
   * the trigger again toggles instead of dismissing and reopening.
   */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * `popover` drops down under the bell in the top bar; `modal` is the
   * full-screen sheet used from the mobile menu.
   */
  variant?: 'popover' | 'modal';
}

export const NotificationInbox: React.FC<NotificationInboxProps> = ({
  onClose,
  onNavigate,
  onUnreadChange,
  triggerRef,
  variant = 'popover',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Only the popover needs this. The modal variant is dismissed by Modal, and
  // its panel is not the element this ref points at.
  useDismissable(ref, onClose, triggerRef, variant === 'popover');

  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(
    async (onlyUnread = unreadOnly) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getNotifications({ limit: 20, unreadOnly: onlyUnread });
        setItems(res.data || []);
        setUnreadCount(res.unreadCount || 0);
        onUnreadChange(res.unreadCount || 0);
      } catch (err: unknown) {
        setError(err instanceof ApiError ? err.message : "Couldn't load notifications.");
      } finally {
        setLoading(false);
      }
    },
    [unreadOnly, onUnreadChange],
  );

  useEffect(() => {
    load();
  }, [load]);

  const applyRead = (updated: number) => {
    setUnreadCount((prev) => Math.max(0, prev - updated));
    onUnreadChange(Math.max(0, unreadCount - updated));
  };

  const handleMarkAll = async () => {
    setMarking(true);
    setError(null);
    try {
      const updated = await api.markNotificationsRead({ all: true });
      await load();
      if (updated > 0) {
        setUnreadCount(0);
        onUnreadChange(0);
      }
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark everything as read.");
    } finally {
      setMarking(false);
    }
  };

  const handleMarkOne = async (notification: Notification) => {
    if (notification.read) return;
    setError(null);
    try {
      const updated = await api.markNotificationsRead({ ids: [notification.id] });
      setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      if (updated > 0) applyRead(updated);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark that as read.");
    }
  };

  const openTarget = (notification: Notification) => {
    const route = notificationRef(notification);
    if (!route) return;
    onNavigate(route);
    onClose();
  };

  const panelBody = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Icon name="notifications" className="text-lilac-500 dark:text-lilac-300" />
          Notifications
          {unreadCount > 0 && (
            <span className="chip bg-lilac-100 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800 font-mono">
              {unreadCount} unread
            </span>
          )}
        </h2>
        {variant === 'modal' && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-wash transition-colors"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded accent-lilac-500"
          />
          Unread only
        </label>
        <button
          onClick={handleMarkAll}
          disabled={marking || unreadCount === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-meta font-medium text-ink-2 border border-line rounded-lg hover:bg-wash dark:hover:bg-raised transition-colors disabled:opacity-50"
        >
          <Icon name="done_all" className="icon-sm" />
          {marking ? 'Marking...' : 'Mark all read'}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
          <Icon name="error" className="text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 flex-1 min-h-0 overflow-y-auto border-t border-line p-3">
        {loading ? (
          <div className="space-y-2">
            <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
            <div className="h-14 bg-wash dark:bg-raised rounded animate-pulse" />
          </div>
        ) : items.length > 0 ? (
          <div className="divide-y divide-line border border-line rounded-lg">
            {items.map((notification) => {
              const route = notificationRef(notification);
              return (
                <div
                  key={notification.id}
                  className={`p-3 flex items-start justify-between gap-3 text-xs ${
                    notification.read
                      ? 'bg-surface dark:bg-raised'
                      : 'bg-lilac-50/50 dark:bg-lilac-950/30'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`chip ${KIND_STYLES[notification.kind]}`}>
                        {KIND_LABELS[notification.kind] ?? notification.kind}
                      </span>
                      {!notification.read && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-lilac-500"
                          aria-label="Unread"
                        />
                      )}
                      <span className="text-meta text-ink-3">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-ink-2 leading-relaxed">{notification.message}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {route && (
                      <button
                        onClick={() => openTarget(notification)}
                        title="Open"
                        aria-label={`Open ${KIND_LABELS[notification.kind] ?? route}`}
                        className="p-1.5 text-ink-3 hover:text-lilac-700 dark:hover:text-lilac-300 rounded-md hover:bg-wash transition-colors"
                      >
                        <Icon name="open_in_new" className="icon-sm" />
                      </button>
                    )}
                    <button
                      onClick={() => handleMarkOne(notification)}
                      disabled={notification.read}
                      title={notification.read ? 'Already read' : 'Mark as read'}
                      aria-label={`Mark notification ${notification.id} as read`}
                      className="p-1.5 text-ink-3 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md hover:bg-wash transition-colors disabled:opacity-40"
                    >
                      <Icon name="done_all" className="icon-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-meta text-ink-3 py-2">
            {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
          </p>
        )}
      </div>
    </>
  );

  const panel = (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full mt-2 w-[24rem] max-w-[calc(100vw-2rem)] card p-0 z-50 flex flex-col max-h-[70vh]"
    >
      {panelBody}
    </div>
  );

  if (variant === 'modal') {
    return (
      <Modal onClose={onClose} size="xl" ariaLabel="Notifications" className="p-0 flex flex-col">
        {panelBody}
      </Modal>
    );
  }

  return panel;
};
