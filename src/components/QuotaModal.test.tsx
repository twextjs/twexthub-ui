import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuotaModal } from './QuotaModal';
import { ApiError, api } from '../services/api';
import type { Quota } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeQuota = (overrides: Partial<Quota> = {}): Quota => ({
  namespace: 'kane',
  blobBytes: 1024 * 1024,
  maxBlobBytes: 100 * 1024 * 1024,
  ...overrides,
});

const renderModal = () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(<QuotaModal namespace="kane" onClose={onClose} onSaved={onSaved} />);
  return { ...utils, onClose, onSaved };
};

beforeEach(() => {
  apiMock.getUserQuota.mockResolvedValue(makeQuota());
  apiMock.setUserQuota.mockResolvedValue(makeQuota());
});

describe('QuotaModal', () => {
  it('shows usage against the cap', async () => {
    renderModal();
    expect(await screen.findByText(/1\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/100 MB/)).toBeInTheDocument();
  });

  it('prefills the override in megabytes', async () => {
    renderModal();
    expect(await screen.findByLabelText('Override (MB)')).toHaveValue(100);
  });

  it('explains a missing override', async () => {
    apiMock.getUserQuota.mockResolvedValue(makeQuota({ maxBlobBytes: null }));
    renderModal();
    expect(
      await screen.findByText('No per-account limit set. This account uses the site default.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use site default' })).toBeDisabled();
  });

  it('saves a megabyte override as bytes', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderModal();
    const input = await screen.findByLabelText('Override (MB)');

    await user.clear(input);
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(apiMock.setUserQuota).toHaveBeenCalledWith('kane', 250 * 1024 * 1024);
    expect(onSaved).toHaveBeenCalled();
  });

  it('rounds a fractional megabyte value', async () => {
    const user = userEvent.setup();
    renderModal();
    const input = await screen.findByLabelText('Override (MB)');

    await user.clear(input);
    await user.type(input, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(apiMock.setUserQuota).toHaveBeenCalledWith('kane', Math.round(1.5 * 1024 * 1024));
  });

  it('refuses a non-positive size', async () => {
    const user = userEvent.setup();
    renderModal();
    const input = await screen.findByLabelText('Override (MB)');

    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a positive number of megabytes.')).toBeInTheDocument();
    expect(apiMock.setUserQuota).not.toHaveBeenCalled();
  });

  it('refuses an empty size and points at the default reset', async () => {
    const user = userEvent.setup();
    renderModal();
    const input = await screen.findByLabelText('Override (MB)');

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Enter a size in MB, or press "Use site default".'),
    ).toBeInTheDocument();
    expect(apiMock.setUserQuota).not.toHaveBeenCalled();
  });

  it('resets to the instance default with null', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderModal();
    await screen.findByLabelText('Override (MB)');

    await user.click(screen.getByRole('button', { name: 'Use site default' }));

    expect(apiMock.setUserQuota).toHaveBeenCalledWith('kane', null);
    expect(onSaved).toHaveBeenCalled();
  });

  it('surfaces a save failure', async () => {
    const user = userEvent.setup();
    apiMock.setUserQuota.mockRejectedValue(new ApiError('quota cannot be below usage', 422));
    const { onSaved } = renderModal();
    const input = await screen.findByLabelText('Override (MB)');

    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('quota cannot be below usage')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('surfaces a load failure', async () => {
    apiMock.getUserQuota.mockRejectedValue(new Error('boom'));
    renderModal();
    expect(await screen.findByText('Failed to load the account quota')).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByLabelText('Override (MB)');

    await user.click(screen.getByLabelText('Close quota dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open when the body is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByLabelText('Override (MB)');

    await user.click(screen.getByRole('heading', { name: 'Storage quota' }));
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });
});

describe('QuotaModal layout', () => {
  it('locks the page while open and leaves the panel to scroll', () => {
    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe('hidden');
    const dialog = screen.getByRole('dialog', { name: /Storage quota/ });
    expect(dialog.className).toContain('modal-panel');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
