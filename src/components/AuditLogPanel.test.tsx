import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogPanel } from './AuditLogPanel';
import { api } from '../services/api';
import { noop, paginated } from '../test/testUtils';
import type { AuditEntry } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actor: 'kane',
  action: 'version.yank',
  target: { namespace: 'kane', id: 'demo', version: '1.0.0' },
  detail: {},
  createdAt: '2026-03-01T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  apiMock.getAuditLog.mockResolvedValue(paginated([]));
});

describe('AuditLogPanel', () => {
  it('lists entries with action, actor, and target', async () => {
    apiMock.getAuditLog.mockResolvedValue(
      paginated([
        makeEntry(),
        makeEntry({
          id: 'a2',
          actor: 'system',
          action: 'extension.delete',
          target: { namespace: 'ada', id: 'gone', version: null },
        }),
      ]),
    );
    render(<AuditLogPanel onNavigate={noop} />);

    expect(await screen.findByText('Unpublished')).toBeInTheDocument();
    expect(screen.getByText('@kane')).toBeInTheDocument();
    expect(screen.getByText('@kane/demo@1.0.0')).toBeInTheDocument();
    expect(screen.getByText('system')).toBeInTheDocument();
    expect(screen.getByText('Extension deleted')).toBeInTheDocument();
    expect(screen.getByText('@ada/gone')).toBeInTheDocument();
    // Actions are described in words rather than the codes the server records.
    expect(screen.queryByText('version.yank')).toBeNull();
  });

  it('shows the system actor without an @ prefix', async () => {
    apiMock.getAuditLog.mockResolvedValue(paginated([makeEntry({ actor: 'system' })]));
    render(<AuditLogPanel onNavigate={noop} />);
    expect(await screen.findByText('system')).toBeInTheDocument();
  });

  it('summarises primitive detail fields', async () => {
    apiMock.getAuditLog.mockResolvedValue(
      paginated([
        makeEntry({
          action: 'quota.set',
          target: { namespace: 'ada', id: null, version: null },
          detail: { maxBlobBytes: 1048576, reason: null },
        }),
      ]),
    );
    render(<AuditLogPanel onNavigate={noop} />);
    expect(await screen.findByText('maxBlobBytes: 1048576')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    render(<AuditLogPanel onNavigate={noop} />);
    expect(await screen.findByText('Nothing recorded yet.')).toBeInTheDocument();
  });

  it('navigates to the target extension', async () => {
    const onNavigate = vi.fn();
    apiMock.getAuditLog.mockResolvedValue(paginated([makeEntry()]));
    render(<AuditLogPanel onNavigate={onNavigate} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Open @kane/demo@1.0.0' }));

    expect(onNavigate).toHaveBeenCalledWith('ext/kane/demo');
  });

  it('appends the next cursor page', async () => {
    const user = userEvent.setup();
    apiMock.getAuditLog.mockResolvedValueOnce(
      paginated([makeEntry({ id: 'a1' })], 'cursor-2', true),
    );
    apiMock.getAuditLog.mockResolvedValueOnce(
      paginated([
        makeEntry({
          id: 'a2',
          action: 'version.deprecate',
          target: { namespace: 'ada', id: 'old', version: '0.1.0' },
        }),
      ]),
    );
    render(<AuditLogPanel onNavigate={noop} />);

    await user.click(await screen.findByRole('button', { name: /Load older entries/ }));

    expect(await screen.findByText('Deprecated')).toBeInTheDocument();
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
    expect(apiMock.getAuditLog).toHaveBeenLastCalledWith({ cursor: 'cursor-2', limit: 50 });
    expect(screen.queryByRole('button', { name: /Load older entries/ })).toBeNull();
  });

  it('surfaces a load failure and can refresh', async () => {
    const user = userEvent.setup();
    apiMock.getAuditLog.mockRejectedValueOnce(new Error('boom'));
    render(<AuditLogPanel onNavigate={noop} />);

    expect(await screen.findByText('Failed to load the audit log')).toBeInTheDocument();

    apiMock.getAuditLog.mockResolvedValueOnce(paginated([makeEntry()]));
    await user.click(screen.getByRole('button', { name: 'Refresh audit log' }));
    expect(await screen.findByText('@kane')).toBeInTheDocument();
  });
});
