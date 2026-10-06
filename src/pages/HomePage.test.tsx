import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';
import { api } from '../services/api';
import { makeExtension, makeStats, paginated, noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.getStats.mockResolvedValue(makeStats());
  apiMock.getExtensions.mockResolvedValue(paginated([makeExtension()]));
  apiMock.getTrendingExtensions.mockResolvedValue(paginated([]));
});

describe('HomePage instance stats', () => {
  it('shows every total the v1 Stats schema requires', async () => {
    render(<HomePage onNavigate={noop} />);

    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('authors')).toBeInTheDocument();
    expect(screen.getByText(/pending/)).toBeInTheDocument();
    expect(screen.getByText('downloads')).toBeInTheDocument();
  });

  it('formats large download counts', async () => {
    apiMock.getStats.mockResolvedValue(makeStats({ downloads: 1234567 }));
    render(<HomePage onNavigate={noop} />);

    expect(await screen.findByText('1,234,567')).toBeInTheDocument();
  });

  it('renders a zero download count rather than hiding it', async () => {
    apiMock.getStats.mockResolvedValue(makeStats({ downloads: 0 }));
    render(<HomePage onNavigate={noop} />);

    expect(await screen.findByText('downloads')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('tolerates a response that omits part of the schema', async () => {
    apiMock.getStats.mockResolvedValue(makeStats({ downloads: undefined }));
    render(<HomePage onNavigate={noop} />);

    expect(await screen.findByText('downloads')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
