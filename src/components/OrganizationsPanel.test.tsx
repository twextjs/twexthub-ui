import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationsPanel } from './OrganizationsPanel';
import { api, ApiError } from '../services/api';
import {
  makeOrganization,
  makeOrganizationOwner,
  paginated,
  renderWithProviders,
} from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);
const onNavigate = vi.fn();

const renderPanel = () => renderWithProviders(<OrganizationsPanel onNavigate={onNavigate} />);

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getOrganizations.mockResolvedValue(paginated([makeOrganization()]));
  apiMock.getOrganizationOwners.mockResolvedValue([makeOrganizationOwner()]);
  apiMock.deleteOrganization.mockResolvedValue(undefined);
});

describe('OrganizationsPanel', () => {
  it('lists the organizations the registry reports', async () => {
    renderPanel();

    expect(await screen.findByText('@acme')).toBeInTheDocument();
    expect(screen.getByText('(Acme Inc)')).toBeInTheDocument();
    // The listing is its own collection, not the account list with a filter on.
    expect(apiMock.getOrganizations).toHaveBeenCalledWith({ limit: 50 });
    expect(apiMock.getUsers).not.toHaveBeenCalled();
  });

  it('says so when there are none yet', async () => {
    apiMock.getOrganizations.mockResolvedValue(paginated([]));
    renderPanel();

    expect(await screen.findByText('No organizations on this registry yet.')).toBeInTheDocument();
  });

  it('reads the owner list only when a row is opened', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');
    expect(apiMock.getOrganizationOwners).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Owners' }));

    expect(await screen.findByText('@kane')).toBeInTheDocument();
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledWith('acme');
  });

  it('says nobody owns it rather than showing an empty list', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizationOwners.mockResolvedValue([]);
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Owners' }));

    expect(
      await screen.findByText('No owners listed, so nobody can change it.'),
    ).toBeInTheDocument();
  });

  it('reports an owner list it could not read, and keeps the organization', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizationOwners.mockRejectedValue(new ApiError('gateway timeout', 504));
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Owners' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('gateway timeout');
    expect(screen.getByText('@acme')).toBeInTheDocument();
  });

  it('collapses the owner list when the row is closed again', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Owners' }));
    await screen.findByText('@kane');
    await user.click(screen.getByRole('button', { name: 'Hide owners' }));

    expect(screen.queryByText('@kane')).not.toBeInTheDocument();
    // Reopening does not ask the registry a second time.
    await user.click(screen.getByRole('button', { name: 'Owners' }));
    expect(await screen.findByText('@kane')).toBeInTheDocument();
    expect(apiMock.getOrganizationOwners).toHaveBeenCalledTimes(1);
  });

  it('searches the loaded organizations by namespace or display name', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizations.mockResolvedValue(
      paginated([
        makeOrganization({ namespace: 'acme', displayName: 'Acme Inc' }),
        makeOrganization({ namespace: 'globex', displayName: 'Globex' }),
      ]),
    );
    renderPanel();
    await screen.findByText('@acme');

    await user.type(screen.getByPlaceholderText('Search organizations...'), 'glob');
    expect(screen.queryByText('@acme')).not.toBeInTheDocument();
    expect(screen.getByText('@globex')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Search organizations...'));
    await user.type(screen.getByPlaceholderText('Search organizations...'), 'acme inc');
    expect(screen.getByText('@acme')).toBeInTheDocument();
    expect(screen.queryByText('@globex')).not.toBeInTheDocument();
  });

  it('says when the search matches nothing here', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');

    await user.type(screen.getByPlaceholderText('Search organizations...'), 'initech');

    expect(await screen.findByText('No organization here is called initech.')).toBeInTheDocument();
  });

  it('sends an admin to the organization page and to its settings', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'View @acme' }));
    expect(onNavigate).toHaveBeenCalledWith('org/acme');

    await user.click(screen.getByRole('button', { name: 'Settings for @acme' }));
    expect(onNavigate).toHaveBeenCalledWith('org/acme/settings');
  });

  it('deletes an organization once the cascade is confirmed', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Permanently delete @acme' }));
    const dialog = await screen.findByRole('dialog');
    // The confirmation has to say what goes with it: the extensions are the
    // reason an admin hesitates here.
    expect(dialog).toHaveTextContent('Every extension, version, image and webhook');
    await user.click(within(dialog).getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(apiMock.deleteOrganization).toHaveBeenCalledWith('acme'));
    expect(await screen.findByText(/Deleted @acme/)).toBeInTheDocument();
    // The row is gone without a reload, and the next page is not pulled in.
    expect(screen.queryByText('@acme')).not.toBeInTheDocument();
    expect(apiMock.getOrganizations).toHaveBeenCalledTimes(1);
  });

  it('keeps the organization when the deletion is declined', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Permanently delete @acme' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(apiMock.deleteOrganization).not.toHaveBeenCalled();
    expect(screen.getByText('@acme')).toBeInTheDocument();
  });

  it('keeps the organization when the registry refuses the deletion', async () => {
    const user = userEvent.setup();
    apiMock.deleteOrganization.mockRejectedValue(
      new ApiError('organization owns extensions with pending versions', 409),
    );
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Permanently delete @acme' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete organization' }));

    expect(
      await screen.findByText('organization owns extensions with pending versions'),
    ).toBeInTheDocument();
    expect(screen.getByText('@acme')).toBeInTheDocument();
  });

  it('loads the next page on demand', async () => {
    const user = userEvent.setup();
    apiMock.getOrganizations
      .mockResolvedValueOnce(paginated([makeOrganization({ namespace: 'acme' })], 'c2', true))
      .mockResolvedValueOnce(
        paginated([makeOrganization({ namespace: 'globex', displayName: 'Globex' })]),
      );
    renderPanel();
    await screen.findByText('@acme');

    await user.click(screen.getByRole('button', { name: 'Load more organizations' }));

    expect(await screen.findByText('@globex')).toBeInTheDocument();
    expect(apiMock.getOrganizations).toHaveBeenLastCalledWith({ cursor: 'c2', limit: 50 });
  });

  it('surfaces a listing failure', async () => {
    apiMock.getOrganizations.mockRejectedValue(new ApiError('service unavailable', 503));
    renderPanel();

    expect(await screen.findByText('service unavailable')).toBeInTheDocument();
  });
});
