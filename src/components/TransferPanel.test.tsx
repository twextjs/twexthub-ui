import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferPanel } from './TransferPanel';
import { ApiError, api } from '../services/api';
import { renderWithProviders } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const renderPanel = () => {
  const onClose = vi.fn();
  const utils = renderWithProviders(<TransferPanel namespace="kane" id="demo" onClose={onClose} />);
  return { ...utils, onClose };
};

beforeEach(() => {
  apiMock.offerExtensionTransfer.mockResolvedValue(undefined);
});

describe('TransferPanel', () => {
  it('names the extension the offer is about', () => {
    renderPanel();
    expect(screen.getByText('@kane/demo')).toBeInTheDocument();
  });

  it('offers the extension to the namespace that was typed, lowercased and trimmed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.type(screen.getByLabelText('Destination namespace'), '  Acme  ');
    await user.click(screen.getByRole('button', { name: /Offer transfer/ }));

    expect(apiMock.offerExtensionTransfer).toHaveBeenCalledWith('kane', 'demo', 'acme');
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects an invalid namespace client-side', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Destination namespace'), 'Not Valid!');
    await user.click(screen.getByRole('button', { name: /Offer transfer/ }));

    expect(await screen.findByText('Enter a valid namespace.')).toBeInTheDocument();
    expect(apiMock.offerExtensionTransfer).not.toHaveBeenCalled();
  });

  it('refuses to offer the extension to itself', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Destination namespace'), 'kane');
    await user.click(screen.getByRole('button', { name: /Offer transfer/ }));

    expect(
      await screen.findByText('An extension cannot be transferred to itself.'),
    ).toBeInTheDocument();
    expect(apiMock.offerExtensionTransfer).not.toHaveBeenCalled();
  });

  it('keeps the panel open and shows the server rejection', async () => {
    const user = userEvent.setup();
    apiMock.offerExtensionTransfer.mockRejectedValue(
      new ApiError('@kane/demo has already been offered to @acme.', 409),
    );
    const { onClose } = renderPanel();

    await user.type(screen.getByLabelText('Destination namespace'), 'acme');
    await user.click(screen.getByRole('button', { name: /Offer transfer/ }));

    expect(
      (await screen.findAllByText('@kane/demo has already been offered to @acme.')).length,
    ).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
