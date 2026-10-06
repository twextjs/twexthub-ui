import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPanel } from './ExportPanel';
import { api } from '../services/api';
import {
  makeExtension,
  makeOrganization,
  makePendingVersion,
  makeUser,
  paginated,
  renderWithProviders,
} from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  apiMock.getExtensions.mockResolvedValue(paginated([makeExtension()]));
  apiMock.getUsers.mockResolvedValue(paginated([makeUser()]));
  apiMock.getOrganizations.mockResolvedValue(paginated([makeOrganization()]));
  apiMock.listVersionsForReview.mockResolvedValue(paginated([makePendingVersion()]));
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:mock'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('ExportPanel', () => {
  it('renders an export row for every dataset', () => {
    renderWithProviders(<ExportPanel />);
    expect(screen.getByText('Extensions')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Pending versions')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /JSON/ })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /CSV/ })).toHaveLength(4);
  });

  it('downloads the catalog as JSON and reports success', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportPanel />);

    await user.click(screen.getAllByRole('button', { name: /JSON/ })[0]);

    expect(apiMock.getExtensions).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(
      await screen.findByText(/Exported 1 extensions record\(s\) as JSON\./),
    ).toBeInTheDocument();
  });

  it('downloads the accounts as CSV', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportPanel />);

    await user.click(screen.getAllByRole('button', { name: /CSV/ })[1]);

    expect(apiMock.getUsers).toHaveBeenCalled();
    expect(await screen.findByText(/Exported 1 accounts record\(s\) as CSV\./)).toBeInTheDocument();
  });

  it('downloads the organizations on their own', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportPanel />);

    // The row after Extensions and Accounts, so the buttons line up by position.
    await user.click(screen.getAllByRole('button', { name: /JSON/ })[2]);

    expect(apiMock.getOrganizations).toHaveBeenCalled();
    expect(
      await screen.findByText(/Exported 1 organizations record\(s\) as JSON\./),
    ).toBeInTheDocument();
  });

  it('keeps organizations out of the accounts export', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ namespace: 'kane' }),
        makeUser({ namespace: 'acme', kind: 'organization' }),
      ]),
    );
    renderWithProviders(<ExportPanel />);

    await user.click(screen.getAllByRole('button', { name: /CSV/ })[1]);

    // An organization has no role, no Terms and no published flag, so its row
    // would be all empty columns in an account export.
    expect(await screen.findByText(/Exported 1 accounts record\(s\) as CSV\./)).toBeInTheDocument();
  });
});
