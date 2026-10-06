import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookPanel } from './WebhookPanel';
import { api } from '../services/api';
import { noop } from '../test/testUtils';
import type { Webhook } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeHook = (overrides: Partial<Webhook> = {}): Webhook => ({
  id: 1,
  url: 'https://ci.example.com/hook',
  events: ['version.published'],
  active: true,
  createdAt: '2026-03-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  apiMock.getWebhooks.mockResolvedValue([]);
});

describe('WebhookPanel', () => {
  it('loads and lists webhooks with their events and last delivery', async () => {
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({
        id: 4,
        url: 'https://ci.example.com/deploy',
        events: ['version.published', 'owners.changed'],
        // The registry records `ok` / `error`, not a status code.
        lastDeliveryStatus: 'ok',
        lastDeliveryAt: '2026-03-02T10:00:00Z',
      }),
    ]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    expect(await screen.findByText('https://ci.example.com/deploy')).toBeInTheDocument();
    expect(screen.getByText('version.published')).toBeInTheDocument();
    expect(screen.getByText('owners.changed')).toBeInTheDocument();
    expect(screen.getByText(/delivered OK/)).toBeInTheDocument();
    expect(apiMock.getWebhooks).toHaveBeenCalledWith('kane', 'demo');
  });

  it('marks a successful delivery green, not red', async () => {
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 5, lastDeliveryStatus: 'ok', lastDeliveryAt: '2026-03-02T10:00:00Z' }),
    ]);
    const { container } = render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    await screen.findByText(/delivered OK/);
    const status = container.querySelector('.text-emerald-700');
    expect(status).not.toBeNull();
  });

  it('reports a failed delivery without inventing a status code', async () => {
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 6, lastDeliveryStatus: 'error', lastDeliveryAt: '2026-03-02T10:00:00Z' }),
    ]);
    const { container } = render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    expect(await screen.findByText(/last attempt failed/)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP/)).toBeNull();
    expect(container.querySelector('.text-rose-700')).not.toBeNull();
  });

  it('omits a status word when the registry has never delivered', async () => {
    apiMock.getWebhooks.mockResolvedValue([makeHook({ id: 7, lastDeliveryStatus: null })]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    expect(await screen.findByText('No deliveries yet')).toBeInTheDocument();
  });

  it('shows an empty state when there are no webhooks', async () => {
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);
    expect(await screen.findByText(/No webhooks yet/)).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    apiMock.getWebhooks.mockRejectedValue(new Error('boom'));
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);
    expect(await screen.findByText('Failed to load webhooks')).toBeInTheDocument();
  });

  it('requires at least one event before creating', async () => {
    const user = userEvent.setup();
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);
    await screen.findByText(/No webhooks yet/);

    await user.type(screen.getByLabelText('Webhook URL'), 'https://ci.example.com/hook');
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    expect(await screen.findByText('Select at least one event to deliver.')).toBeInTheDocument();
    expect(apiMock.createWebhook).not.toHaveBeenCalled();
  });

  it('creates a webhook with the selected events and reveals the one-time secret', async () => {
    const user = userEvent.setup();
    apiMock.createWebhook.mockResolvedValue({
      ...makeHook({ id: 9 }),
      secret: 'whsec_secret_value',
    });
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);
    await screen.findByText(/No webhooks yet/);

    await user.type(screen.getByLabelText('Webhook URL'), 'https://ci.example.com/hook');
    await user.click(screen.getByRole('checkbox', { name: 'Version published' }));
    await user.click(screen.getByRole('checkbox', { name: 'Owners changed' }));
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    expect(await screen.findByText('whsec_secret_value')).toBeInTheDocument();
    expect(screen.getByText(/shown exactly once/)).toBeInTheDocument();
    expect(apiMock.createWebhook).toHaveBeenCalledWith('kane', 'demo', {
      url: 'https://ci.example.com/hook',
      events: ['version.published', 'owners.changed'],
      active: true,
    });
  });

  it('reports a create failure', async () => {
    const user = userEvent.setup();
    apiMock.createWebhook.mockRejectedValue(new Error('nope'));
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);
    await screen.findByText(/No webhooks yet/);

    await user.type(screen.getByLabelText('Webhook URL'), 'https://ci.example.com/hook');
    await user.click(screen.getByRole('checkbox', { name: 'Version published' }));
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    expect(await screen.findByText('Failed to create webhook')).toBeInTheDocument();
  });

  it('confirms before deleting, then removes the webhook', async () => {
    const user = userEvent.setup();
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 4, url: 'https://ci.example.com/deploy' }),
    ]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    await user.click(await screen.findByRole('button', { name: /Delete webhook/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete webhook' }));

    await waitFor(() => expect(apiMock.deleteWebhook).toHaveBeenCalledWith('kane', 'demo', 4));
    await waitFor(() => expect(screen.queryByText('https://ci.example.com/deploy')).toBeNull());
  });

  it('keeps the webhook when the delete confirmation is cancelled', async () => {
    const user = userEvent.setup();
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 4, url: 'https://ci.example.com/deploy' }),
    ]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    await user.click(await screen.findByRole('button', { name: /Delete webhook/ }));
    await user.click(await screen.findByRole('button', { name: /Cancel/ }));

    expect(apiMock.deleteWebhook).not.toHaveBeenCalled();
    expect(screen.getByText('https://ci.example.com/deploy')).toBeInTheDocument();
  });

  it('closes on the close button and on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WebhookPanel namespace="kane" id="demo" onClose={onClose} />);
    await screen.findByText(/No webhooks yet/);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('WebhookPanel active state', () => {
  it('labels an active webhook', async () => {
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 8, url: 'https://a.example/hook', active: true }),
    ]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('labels a paused webhook so it is not mistaken for a live one', async () => {
    apiMock.getWebhooks.mockResolvedValue([
      makeHook({ id: 9, url: 'https://b.example/hook', active: false }),
    ]);
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('registers a webhook as active by default', async () => {
    apiMock.createWebhook.mockResolvedValue({ ...makeHook({ id: 10 }), secret: 'whsec_x' });
    const user = userEvent.setup();
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    await user.type(await screen.findByLabelText('Webhook URL'), 'https://c.example/hook');
    await user.click(screen.getByRole('checkbox', { name: 'Version published' }));
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    await waitFor(() =>
      expect(apiMock.createWebhook).toHaveBeenCalledWith('kane', 'demo', {
        url: 'https://c.example/hook',
        events: ['version.published'],
        active: true,
      }),
    );
  });

  it('reads and writes the namespace list when it is an organization', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizationWebhooks.mockResolvedValue([
      makeHook({ id: 12, url: 'https://ci.example.com/namespace' }),
    ]);
    apiMock.createOrganizationWebhook.mockResolvedValue({
      ...makeHook({ id: 13 }),
      secret: 'whsec_org',
    });
    render(<WebhookPanel namespace="acme" organization onClose={noop} />);

    // The two collections do not overlap, so neither per-extension call is made.
    expect(await screen.findByText('https://ci.example.com/namespace')).toBeInTheDocument();
    expect(apiMock.getOrganizationWebhooks).toHaveBeenCalledWith('acme');
    expect(apiMock.getWebhooks).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Webhook URL'), 'https://e.example/hook');
    await user.click(screen.getByRole('checkbox', { name: 'Owners changed' }));
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    await waitFor(() =>
      expect(apiMock.createOrganizationWebhook).toHaveBeenCalledWith('acme', {
        url: 'https://e.example/hook',
        events: ['owners.changed'],
        active: true,
      }),
    );
    expect(apiMock.createWebhook).not.toHaveBeenCalled();
  });

  it('titles the organization panel with the namespace alone', async () => {
    render(<WebhookPanel namespace="acme" organization onClose={noop} />);

    await screen.findByRole('dialog');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Webhooks for @acme');
  });

  it('can register a paused webhook', async () => {
    apiMock.createWebhook.mockResolvedValue({
      ...makeHook({ id: 11, active: false }),
      secret: 'whsec_y',
    });
    const user = userEvent.setup();
    render(<WebhookPanel namespace="kane" id="demo" onClose={noop} />);

    await user.type(await screen.findByLabelText('Webhook URL'), 'https://d.example/hook');
    await user.click(screen.getByRole('checkbox', { name: 'Version published' }));
    await user.click(screen.getByRole('checkbox', { name: /Start active/ }));
    await user.click(screen.getByRole('button', { name: /Create webhook/ }));

    await waitFor(() =>
      expect(apiMock.createWebhook).toHaveBeenCalledWith('kane', 'demo', {
        url: 'https://d.example/hook',
        events: ['version.published'],
        active: false,
      }),
    );
  });
});
