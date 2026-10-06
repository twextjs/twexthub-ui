import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrendingPanel } from './TrendingPanel';
import { ApiError, api } from '../services/api';
import { noop, paginated } from '../test/testUtils';
import type { ExtensionSummary } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const makeSummary = (overrides: Partial<ExtensionSummary> = {}): ExtensionSummary => ({
  namespace: 'kane',
  id: 'demo',
  name: 'Demo Extension',
  version: '2.1.0',
  description: 'A test extension.',
  publishedAt: '2026-03-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  apiMock.getTrendingExtensions.mockResolvedValue(paginated([]));
});

describe('TrendingPanel', () => {
  it('ranks extensions by their API position', async () => {
    apiMock.getTrendingExtensions.mockResolvedValue(
      paginated([
        makeSummary({ namespace: 'ada', id: 'alpha', name: 'Alpha' }),
        makeSummary({ namespace: 'bob', id: 'beta', name: 'Beta', version: '0.4.2' }),
      ]),
    );
    render(<TrendingPanel onNavigate={noop} />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the summary version field, not latestVersion', async () => {
    apiMock.getTrendingExtensions.mockResolvedValue(paginated([makeSummary({ version: '3.4.5' })]));
    render(<TrendingPanel onNavigate={noop} />);
    expect(await screen.findByText('v3.4.5')).toBeInTheDocument();
  });

  it('navigates to the extension', async () => {
    const onNavigate = vi.fn();
    apiMock.getTrendingExtensions.mockResolvedValue(
      paginated([makeSummary({ namespace: 'ada', id: 'alpha' })]),
    );
    render(<TrendingPanel onNavigate={onNavigate} />);

    await userEvent.click(await screen.findByText('Demo Extension'));

    expect(onNavigate).toHaveBeenCalledWith('ext/ada/alpha');
  });

  it('truncates to the requested limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeSummary({ id: `ext-${i}`, name: `Ext ${i}` }),
    );
    apiMock.getTrendingExtensions.mockResolvedValue(paginated(many));
    render(<TrendingPanel onNavigate={noop} limit={5} />);

    expect(await screen.findByText('Ext 0')).toBeInTheDocument();
    expect(screen.getByText('Ext 4')).toBeInTheDocument();
    expect(screen.queryByText('Ext 5')).toBeNull();
  });

  it('renders nothing when the registry has no ranked extensions', async () => {
    const { container } = render(<TrendingPanel onNavigate={noop} />);
    await vi.waitFor(() => expect(apiMock.getTrendingExtensions).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing on failure but does not throw', async () => {
    apiMock.getTrendingExtensions.mockRejectedValue(new ApiError('boom', 500));
    const { container } = render(<TrendingPanel onNavigate={noop} />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
