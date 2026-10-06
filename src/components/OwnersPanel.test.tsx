import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnersPanel } from './OwnersPanel';
import { ApiError, api } from '../services/api';
import { renderWithProviders } from '../test/testUtils';
import type { ExtensionOwner } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeOwner = (overrides: Partial<ExtensionOwner> = {}): ExtensionOwner => ({
  namespace: 'kane',
  displayName: 'Kane',
  role: 'normal',
  addedAt: '2026-01-01T00:00:00Z',
  kind: 'user',
  ...overrides,
});

const TWO_OWNERS = [
  makeOwner(),
  makeOwner({ namespace: 'ada', displayName: 'Ada L', role: 'admin' }),
];

const renderPanel = (canManage = true) => {
  const onClose = vi.fn();
  const utils = renderWithProviders(
    <OwnersPanel namespace="kane" id="demo" canManage={canManage} onClose={onClose} />,
  );
  return { ...utils, onClose };
};

beforeEach(() => {
  apiMock.getExtensionOwners.mockResolvedValue(TWO_OWNERS);
  apiMock.addExtensionOwner.mockResolvedValue(undefined);
  apiMock.removeExtensionOwner.mockResolvedValue(undefined);
});

describe('OwnersPanel', () => {
  it('lists owners with their display name', async () => {
    renderPanel();

    expect(await screen.findByText('@kane')).toBeInTheDocument();
    expect(screen.getByText('@ada')).toBeInTheDocument();
    expect(screen.getByText('Ada L')).toBeInTheDocument();
    // Roles are not shown: every owner listed here can do the same things.
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('marks an organization owner, whose account the registry keeps in the same list', async () => {
    apiMock.getExtensionOwners.mockResolvedValue([
      makeOwner(),
      makeOwner({
        namespace: 'acme',
        displayName: 'Acme Inc',
        kind: 'organization',
      }),
    ]);
    renderPanel();

    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    // The registry keeps an organization and the accounts answering for it in
    // one list, so the entry says which of the two this is.
    expect(screen.getByText('organization')).toBeInTheDocument();
    // The chip is separate from the role, which is still never shown.
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('hides management controls from non-managers', async () => {
    renderPanel(false);
    await screen.findByText('@ada');
    expect(screen.queryByLabelText('Invite a co-owner by namespace')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove @ada' })).toBeNull();
  });

  it('never offers removal for the extension namespace itself', async () => {
    renderPanel();
    await screen.findByText('@kane');
    expect(screen.queryByRole('button', { name: 'Remove @kane' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove @ada' })).toBeInTheDocument();
  });

  it('adds an owner by namespace and reloads', async () => {
    const user = userEvent.setup();
    apiMock.getExtensionOwners.mockResolvedValueOnce([makeOwner()]);
    apiMock.getExtensionOwners.mockResolvedValueOnce([
      ...TWO_OWNERS,
      makeOwner({ namespace: 'bob', displayName: 'Bob' }),
    ]);
    renderPanel();
    await screen.findByText('@kane');

    await user.type(screen.getByLabelText('Invite a co-owner by namespace'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(apiMock.addExtensionOwner).toHaveBeenCalledWith('kane', 'demo', 'bob');
    expect(await screen.findByText('@bob')).toBeInTheDocument();
  });

  it('lowercases and trims the candidate namespace on Enter', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@kane');

    await user.type(screen.getByLabelText('Invite a co-owner by namespace'), '  Grace  {Enter}');

    expect(apiMock.addExtensionOwner).toHaveBeenCalledWith('kane', 'demo', 'grace');
  });

  it('rejects a duplicate owner client-side', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@ada');

    await user.type(screen.getByLabelText('Invite a co-owner by namespace'), 'ada');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('ada is already an owner.')).toBeInTheDocument();
    expect(apiMock.addExtensionOwner).not.toHaveBeenCalled();
  });

  it('rejects an invalid namespace client-side', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@ada');

    await user.type(screen.getByLabelText('Invite a co-owner by namespace'), 'Not Valid!');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Enter a valid namespace.')).toBeInTheDocument();
    expect(apiMock.addExtensionOwner).not.toHaveBeenCalled();
  });

  it('surfaces a server rejection when adding', async () => {
    const user = userEvent.setup();
    apiMock.addExtensionOwner.mockRejectedValue(new ApiError('account does not exist', 404));
    renderPanel();
    await screen.findByText('@ada');

    await user.type(screen.getByLabelText('Invite a co-owner by namespace'), 'ghost');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect((await screen.findAllByText('account does not exist')).length).toBeGreaterThan(0);
  });

  it('keeps the owner when removal is declined', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@ada');

    await user.click(screen.getByRole('button', { name: 'Remove @ada' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(apiMock.removeExtensionOwner).not.toHaveBeenCalled();
  });

  it('removes an owner after confirmation', async () => {
    const user = userEvent.setup();
    apiMock.getExtensionOwners.mockResolvedValueOnce(TWO_OWNERS);
    apiMock.getExtensionOwners.mockResolvedValueOnce([makeOwner()]);
    renderPanel();
    await screen.findByText('@ada');

    await user.click(screen.getByRole('button', { name: 'Remove @ada' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(apiMock.removeExtensionOwner).toHaveBeenCalledWith('kane', 'demo', 'ada');
    await waitFor(() => expect(screen.queryByText('@ada')).toBeNull());
  });

  it('surfaces a removal failure', async () => {
    const user = userEvent.setup();
    apiMock.removeExtensionOwner.mockRejectedValue(new ApiError('transfer ownership first', 422));
    renderPanel();
    await screen.findByText('@ada');

    await user.click(screen.getByRole('button', { name: 'Remove @ada' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect((await screen.findAllByText('transfer ownership first')).length).toBeGreaterThan(0);
  });

  it('never offers removal for the namespace holding the extension, organization or not', async () => {
    apiMock.getExtensionOwners.mockResolvedValue([
      makeOwner({ namespace: 'acme', displayName: 'Acme Inc', kind: 'organization' }),
    ]);
    renderWithProviders(<OwnersPanel namespace="acme" id="demo" canManage onClose={vi.fn()} />);

    // An organization publishes extensions of its own, and is its own owner, so
    // it is listed but cannot be removed from the list.
    await screen.findByText('Acme Inc');
    expect(screen.getByText('extension')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove @acme' })).toBeNull();
  });

  it('surfaces a load failure', async () => {
    apiMock.getExtensionOwners.mockRejectedValue(new Error('boom'));
    renderPanel();
    expect(await screen.findByText('Failed to load the owner list')).toBeInTheDocument();
  });

  it('does not close when the panel body is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await screen.findByText('@ada');

    await user.click(screen.getByRole('heading', { name: 'Owners' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await screen.findByText('@ada');

    await user.click(screen.getByLabelText('Close owners panel'));
    expect(onClose).toHaveBeenCalled();
  });
});
