import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BroadcastPanel } from './BroadcastPanel';
import { ApiError, api } from '../services/api';
import { renderWithProviders } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const type = async (text: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Message/), text);
};

const send = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Send to all accounts/ }));
};

beforeEach(() => {
  apiMock.broadcastNotification.mockResolvedValue(7);
});

describe('BroadcastPanel', () => {
  it('warns that delivery cannot be recalled', () => {
    renderWithProviders(<BroadcastPanel />);
    expect(screen.getByText(/cannot be recalled/i)).toBeInTheDocument();
  });

  it('keeps the send button disabled until a message is typed', async () => {
    renderWithProviders(<BroadcastPanel />);
    expect(screen.getByRole('button', { name: /Send to all accounts/ })).toBeDisabled();

    await type('Scheduled maintenance');
    expect(screen.getByRole('button', { name: /Send to all accounts/ })).toBeEnabled();
  });

  it('treats whitespace-only input as empty', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('    ');
    expect(screen.getByRole('button', { name: /Send to all accounts/ })).toBeDisabled();
  });

  it('counts the trimmed message length', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('  hello  ');
    expect(screen.getByText('(5/280)')).toBeInTheDocument();
  });

  it('requires an explicit confirmation before sending', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('Maintenance at 02:00');
    await send();

    const confirmButton = await screen.findByRole('button', { name: 'Send broadcast' });
    expect(confirmButton).toBeInTheDocument();
    // The warning appears in the panel description and again in the dialog.
    expect(screen.getAllByText(/cannot be recalled/i).length).toBeGreaterThanOrEqual(2);
    expect(apiMock.broadcastNotification).not.toHaveBeenCalled();
  });

  it('sends the trimmed message once confirmed', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('  Maintenance at 02:00  ');
    await send();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send broadcast' }));

    expect(apiMock.broadcastNotification).toHaveBeenCalledWith('Maintenance at 02:00');
  });

  it('does not send when the confirmation is cancelled', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('Maintenance at 02:00');
    await send();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(apiMock.broadcastNotification).not.toHaveBeenCalled();
  });

  it('clears the field after a successful broadcast', async () => {
    renderWithProviders(<BroadcastPanel />);
    await type('Maintenance at 02:00');
    await send();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send broadcast' }));

    await vi.waitFor(() => expect(apiMock.broadcastNotification).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /Send to all accounts/ })).toBeDisabled();
  });

  it('surfaces a send failure', async () => {
    apiMock.broadcastNotification.mockRejectedValue(new ApiError('Quota exceeded', 429));
    renderWithProviders(<BroadcastPanel />);
    await type('Maintenance at 02:00');
    await send();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send broadcast' }));

    // Reported both inline and as a toast.
    expect((await screen.findAllByText('Quota exceeded')).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the message when a send fails so it can be retried', async () => {
    apiMock.broadcastNotification.mockRejectedValue(new ApiError('Quota exceeded', 429));
    renderWithProviders(<BroadcastPanel />);
    await type('Maintenance at 02:00');
    await send();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send broadcast' }));

    expect(await screen.findByText('Maintenance at 02:00')).toBeInTheDocument();
  });

  it('caps the message at 280 characters', () => {
    renderWithProviders(<BroadcastPanel />);
    expect(screen.getByLabelText(/Message/)).toHaveAttribute('maxlength', '280');
  });
});
