import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrunePanel } from './PrunePanel';
import { api } from '../services/api';
import { makeAdminUser, makeSession, makeToken, makeUser, paginated } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getSessions.mockResolvedValue(paginated([]));
  apiMock.getTokens.mockResolvedValue(paginated([]));
  apiMock.deleteUser.mockResolvedValue(undefined);
});

describe('PrunePanel', () => {
  it('lists only accounts with no sessions or tokens', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeAdminUser({ namespace: 'root' }),
        makeUser({ namespace: 'ghost', displayName: 'Ghost' }),
        makeUser({ namespace: 'busy', displayName: 'Busy' }),
      ]),
    );
    apiMock.getSessions.mockImplementation(async (params) =>
      params?.namespace === 'busy'
        ? paginated([makeSession({ expiresAt: '2099-06-01T00:00:00Z' })])
        : paginated([]),
    );

    render(<PrunePanel currentUserNamespace="root" onPruned={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Scan for Dormant Accounts/ }));

    expect(await screen.findByText('@ghost')).toBeInTheDocument();
    expect(screen.getByText('@ghost').closest('label')).toHaveTextContent('Ghost');
    expect(screen.queryByText('@busy')).not.toBeInTheDocument();
    expect(screen.queryByText('@root')).not.toBeInTheDocument();
  });

  it('treats accounts holding only expired credentials as dormant', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(paginated([makeUser({ namespace: 'stale' })]));
    apiMock.getSessions.mockResolvedValue(
      paginated([makeSession({ id: 'sess-old', expiresAt: '2020-01-01T00:00:00Z' })]),
    );
    apiMock.getTokens.mockResolvedValue(
      paginated([makeToken({ id: 'tok-old', expiresAt: '2020-01-01T00:00:00Z' })]),
    );

    render(<PrunePanel currentUserNamespace="me" onPruned={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Scan for Dormant Accounts/ }));

    expect(await screen.findByText('@stale')).toBeInTheDocument();
    expect(screen.getByText('0 sessions')).toBeInTheDocument();
    expect(screen.getByText('0 tokens')).toBeInTheDocument();
  });

  it('filters published and admin accounts until options are enabled', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ namespace: 'pub', hasPublished: true }),
        makeAdminUser({ namespace: 'root' }),
      ]),
    );

    render(<PrunePanel currentUserNamespace="me" onPruned={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Scan for Dormant Accounts/ }));
    expect(await screen.findByText(/0 dormant accounts matched/)).toBeInTheDocument();
    expect(screen.queryByText('@pub')).not.toBeInTheDocument();
    expect(screen.queryByText('@root')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: /Only accounts without published extensions/ }),
    );
    expect(await screen.findByText('@pub')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Include administrator accounts/ }));
    expect(await screen.findByText('@root')).toBeInTheDocument();
  });

  it('never offers an organization, which holds no credentials of its own', async () => {
    const user = userEvent.setup();
    apiMock.getUsers.mockResolvedValue(
      paginated([
        makeUser({ namespace: 'ghost' }),
        // The registry lists organizations through /users, and DELETE
        // /users/{namespace} is a 403 for one, so there is nothing to prune.
        makeUser({ namespace: 'acme', kind: 'organization' }),
      ]),
    );

    render(<PrunePanel currentUserNamespace="me" onPruned={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Scan for Dormant Accounts/ }));

    expect(await screen.findByText('@ghost')).toBeInTheDocument();
    expect(screen.queryByText('@acme')).not.toBeInTheDocument();
    expect(screen.getByText('1 dormant account matched')).toBeInTheDocument();
  });

  it('deletes selected accounts after typed confirmation', async () => {
    const user = userEvent.setup();
    const onPruned = vi.fn();
    apiMock.getUsers.mockResolvedValue(paginated([makeUser({ namespace: 'ghost' })]));

    render(<PrunePanel currentUserNamespace="me" onPruned={onPruned} />);
    await user.click(screen.getByRole('button', { name: /Scan for Dormant Accounts/ }));
    await screen.findByText('@ghost');

    await user.click(screen.getByRole('button', { name: /Prune 1 account/ }));
    const input = await screen.findByLabelText(/Type PRUNE to delete 1 dormant account/);
    const confirmButton = screen.getByRole('button', { name: 'Delete 1 account' });
    expect(confirmButton).toBeDisabled();

    await user.type(input, 'PRUNE');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(apiMock.deleteUser).toHaveBeenCalledWith('ghost');
    expect(onPruned).toHaveBeenCalled();
    expect(await screen.findByText(/Pruned 1 account/)).toBeInTheDocument();
  });
});
