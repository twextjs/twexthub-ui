import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationInbox } from './NotificationInbox';
import { api } from '../services/api';
import { noop } from '../test/testUtils';
import type { Notification, NotificationList } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: '1',
  kind: 'review.approved',
  message: 'Your version 1.0.0 was approved.',
  payload: {},
  read: false,
  createdAt: '2026-03-01T00:00:00Z',
  ...overrides,
});

const makeList = (data: Notification[], unreadCount: number): NotificationList => ({
  data,
  unreadCount,
  pagination: { nextCursor: null, hasMore: false },
});

beforeEach(() => {
  apiMock.getNotifications.mockResolvedValue(makeList([], 0));
  apiMock.markNotificationsRead.mockResolvedValue(0);
});

const renderInbox = (onUnreadChange = vi.fn()) => {
  render(<NotificationInbox onClose={noop} onNavigate={noop} onUnreadChange={onUnreadChange} />);
  return onUnreadChange;
};

describe('NotificationInbox', () => {
  it('reports the mailbox unread count to the navbar badge', async () => {
    apiMock.getNotifications.mockResolvedValue(makeList([makeNotification()], 4));
    const onUnreadChange = renderInbox();
    expect(await screen.findByText('4 unread')).toBeInTheDocument();
    expect(onUnreadChange).toHaveBeenCalledWith(4);
  });

  it('lists notifications with their kind and message', async () => {
    apiMock.getNotifications.mockResolvedValue(
      makeList(
        [
          makeNotification({ id: '1', kind: 'review.approved' }),
          makeNotification({ id: '2', kind: 'broadcast', message: 'Scheduled maintenance.' }),
        ],
        2,
      ),
    );
    renderInbox();

    expect(await screen.findByText('Your version 1.0.0 was approved.')).toBeInTheDocument();
    // Kinds are shown as words, never as the codes the server sends.
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('review.approved')).toBeNull();
    expect(screen.getByText('Scheduled maintenance.')).toBeInTheDocument();
    expect(screen.getByText('Announcement')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderInbox();
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });

  it('requests only unread notifications when the filter is on', async () => {
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText('No notifications yet.');

    await user.click(screen.getByRole('checkbox'));

    await vi.waitFor(() =>
      expect(apiMock.getNotifications).toHaveBeenLastCalledWith({ limit: 20, unreadOnly: true }),
    );
  });

  it('marks a single notification read', async () => {
    const user = userEvent.setup();
    apiMock.getNotifications.mockResolvedValue(makeList([makeNotification({ id: '7' })], 2));
    apiMock.markNotificationsRead.mockResolvedValue(1);
    const onUnreadChange = renderInbox();

    await user.click(await screen.findByRole('button', { name: /Mark notification 7 as read/ }));

    expect(apiMock.markNotificationsRead).toHaveBeenCalledWith({ ids: ['7'] });
    expect(onUnreadChange).toHaveBeenLastCalledWith(1);
  });

  it('marks every notification read', async () => {
    const user = userEvent.setup();
    apiMock.getNotifications.mockResolvedValue(makeList([makeNotification()], 3));
    apiMock.markNotificationsRead.mockResolvedValue(3);
    apiMock.getNotifications.mockResolvedValueOnce(makeList([makeNotification()], 3));
    const onUnreadChange = renderInbox();

    await user.click(await screen.findByRole('button', { name: /Mark all read/ }));

    expect(apiMock.markNotificationsRead).toHaveBeenCalledWith({ all: true });
    await vi.waitFor(() => expect(onUnreadChange).toHaveBeenLastCalledWith(0));
  });

  it('disables mark-all when there is nothing unread', async () => {
    renderInbox();
    expect(await screen.findByRole('button', { name: /Mark all read/ })).toBeDisabled();
  });

  it('navigates to the extension a notification refers to', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    apiMock.getNotifications.mockResolvedValue(
      makeList([makeNotification({ payload: { namespace: 'kane', id: 'demo' } })], 1),
    );
    render(
      <NotificationInbox onClose={onClose} onNavigate={onNavigate} onUnreadChange={vi.fn()} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Open Approved' }));

    expect(onNavigate).toHaveBeenCalledWith('ext/kane/demo');
    expect(onClose).toHaveBeenCalled();
  });

  it('names the organization kinds in words', async () => {
    apiMock.getNotifications.mockResolvedValue(
      makeList(
        [
          makeNotification({
            id: '1',
            kind: 'organization.owner.added',
            message: 'You were added as an owner of @acme.',
            payload: { namespace: 'acme' },
          }),
          makeNotification({
            id: '2',
            kind: 'extension.owner.invited',
            message: '@acme invited you to co-own @kane/demo.',
            payload: { namespace: 'kane', id: 'demo' },
          }),
        ],
        2,
      ),
    );
    renderInbox();

    expect(await screen.findByText('Added as organization owner')).toBeInTheDocument();
    expect(screen.getByText('Owner invitation')).toBeInTheDocument();
  });

  it('sends an organization owner change to that organization, which has no extension', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    apiMock.getNotifications.mockResolvedValue(
      makeList(
        [
          makeNotification({
            kind: 'organization.owner.removed',
            payload: { namespace: 'acme' },
          }),
        ],
        1,
      ),
    );
    render(
      <NotificationInbox onClose={vi.fn()} onNavigate={onNavigate} onUnreadChange={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open Removed as organization owner' }),
    );

    // The owner list is managed at the organization's own settings page, and the
    // payload names no extension to fall back to.
    expect(onNavigate).toHaveBeenCalledWith('org/acme/settings');
  });

  it('offers no destination for a notification that names nothing', async () => {
    apiMock.getNotifications.mockResolvedValue(
      makeList([makeNotification({ kind: 'broadcast', message: 'Downtime.', payload: {} })], 1),
    );
    renderInbox();

    expect(await screen.findByText('Downtime.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open / })).not.toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    apiMock.getNotifications.mockRejectedValue(new Error('boom'));
    renderInbox();
    expect(await screen.findByText("Couldn't load notifications.")).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NotificationInbox onClose={onClose} onNavigate={noop} onUnreadChange={vi.fn()} />);
    await screen.findByText('No notifications yet.');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
