import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricsModal } from './MetricsModal';
import { ApiError, api } from '../services/api';
import { noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const SAMPLE = `# HELP twexthub_uptime_seconds Process uptime in seconds.
# TYPE twexthub_uptime_seconds gauge
twexthub_uptime_seconds 90061
# HELP twexthub_storage_bytes Bytes currently stored.
# TYPE twexthub_storage_bytes gauge
twexthub_storage_bytes 5242880
# HELP twexthub_http_requests_total Requests by route.
# TYPE twexthub_http_requests_total counter
twexthub_http_requests_total{method="GET",route="/v2/extensions",status="200"} 4213
`;

beforeEach(() => {
  apiMock.getAdminMetrics.mockResolvedValue(SAMPLE);
});

describe('MetricsModal', () => {
  it('fetches metrics through the authenticated client', async () => {
    render(<MetricsModal onClose={noop} />);
    await waitFor(() => expect(apiMock.getAdminMetrics).toHaveBeenCalled());
  });

  it('renders unlabelled gauges as cards', async () => {
    render(<MetricsModal onClose={noop} />);

    expect(await screen.findByText('twexthub_uptime_seconds')).toBeInTheDocument();
    expect(screen.getByText('1d 1h 1m 1s')).toBeInTheDocument();
    expect(screen.getByText('5.0 MiB')).toBeInTheDocument();
  });

  it('renders labelled series as a table', async () => {
    render(<MetricsModal onClose={noop} />);

    expect(await screen.findByText('Breakdown')).toBeInTheDocument();
    const labelCell = await screen.findByText(/method="GET"/);
    expect(labelCell).toHaveTextContent('method="GET", route="/v2/extensions", status="200"');
    expect(screen.getByText('4,213')).toBeInTheDocument();
  });

  it('summarises family and sample counts', async () => {
    render(<MetricsModal onClose={noop} />);
    expect(await screen.findByText('3 stats • 3 data points')).toBeInTheDocument();
  });

  it('switches to a raw read-only view and back', async () => {
    const user = userEvent.setup();
    render(<MetricsModal onClose={noop} />);
    await screen.findByText('twexthub_uptime_seconds');

    await user.click(screen.getByRole('button', { name: 'Raw text' }));
    expect(screen.getByRole('button', { name: 'Rendered view' })).toBeInTheDocument();
    expect(screen.queryByText('Current values')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Rendered view' }));
    expect(screen.getByText('Current values')).toBeInTheDocument();
  });

  it('explains the 401 on an unauthorized response', async () => {
    apiMock.getAdminMetrics.mockRejectedValue(new ApiError('Unauthorized', 401));
    render(<MetricsModal onClose={noop} />);

    expect(await screen.findByText(/Couldn't load the statistics:/)).toBeInTheDocument();
    expect(screen.getByText(/Only administrators can view these numbers/)).toBeInTheDocument();
  });

  it('reports a non-auth failure without the 401 explanation', async () => {
    apiMock.getAdminMetrics.mockRejectedValue(new ApiError('Upstream exploded', 500));
    render(<MetricsModal onClose={noop} />);

    expect(await screen.findByText(/Upstream exploded/)).toBeInTheDocument();
    expect(screen.queryByText(/Only administrators can view these numbers/)).toBeNull();
  });

  it('handles an empty exposition', async () => {
    apiMock.getAdminMetrics.mockResolvedValue('');
    render(<MetricsModal onClose={noop} />);
    expect(await screen.findByText('No statistics to show yet.')).toBeInTheDocument();
  });

  it('refetches on refresh', async () => {
    const user = userEvent.setup();
    render(<MetricsModal onClose={noop} />);
    await screen.findByText('twexthub_uptime_seconds');

    await user.click(screen.getByRole('button', { name: 'Refresh metrics' }));

    await waitFor(() => expect(apiMock.getAdminMetrics).toHaveBeenCalledTimes(2));
  });

  it('copies the raw exposition', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<MetricsModal onClose={noop} />);
    await screen.findByText('twexthub_uptime_seconds');

    // fireEvent, because userEvent.setup() installs its own clipboard stub.
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SAMPLE));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('disables copy when there is no data', async () => {
    apiMock.getAdminMetrics.mockResolvedValue('');
    render(<MetricsModal onClose={noop} />);
    await screen.findByText('No statistics to show yet.');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});
