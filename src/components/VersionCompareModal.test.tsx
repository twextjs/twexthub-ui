import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionCompareModal } from './VersionCompareModal';
import { api } from '../services/api';
import { noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.getVersion.mockImplementation(async (_ns, _id, version) => ({
    namespace: 'kane',
    id: 'demo',
    version,
    status: 'published',
    name: 'Demo',
    license: 'MIT',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
  }));
  apiMock.downloadVersion.mockImplementation(async (_ns, _id, version) =>
    version === '1.0.0' ? 'line one\nold line\n' : 'line one\nnew line\n',
  );
});

describe('VersionCompareModal', () => {
  it('loads both versions and shows the diff', async () => {
    render(
      <VersionCompareModal
        namespace="kane"
        id="demo"
        versions={[
          { version: '1.0.0', status: 'published' },
          { version: '2.0.0', status: 'published' },
        ]}
        onClose={noop}
      />,
    );

    expect(await screen.findByText('+1 added')).toBeInTheDocument();
    expect(screen.getByText('-1 removed')).toBeInTheDocument();
    expect(apiMock.getVersion).toHaveBeenCalledWith('kane', 'demo', '1.0.0');
    expect(apiMock.getVersion).toHaveBeenCalledWith('kane', 'demo', '2.0.0');
  });

  it('swaps the compared versions', async () => {
    const user = userEvent.setup();
    render(
      <VersionCompareModal
        namespace="kane"
        id="demo"
        versions={[
          { version: '1.0.0', status: 'published' },
          { version: '2.0.0', status: 'published' },
        ]}
        onClose={noop}
      />,
    );
    await screen.findByText('+1 added');

    const base = screen.getByLabelText('Base version') as HTMLSelectElement;
    const compare = screen.getByLabelText('Compare version') as HTMLSelectElement;
    expect(base.value).toBe('1.0.0');
    expect(compare.value).toBe('2.0.0');

    await user.click(screen.getByRole('button', { name: 'Swap versions' }));
    expect((screen.getByLabelText('Base version') as HTMLSelectElement).value).toBe('2.0.0');
    expect((screen.getByLabelText('Compare version') as HTMLSelectElement).value).toBe('1.0.0');
  });

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <VersionCompareModal
        namespace="kane"
        id="demo"
        versions={[
          { version: '1.0.0', status: 'published' },
          { version: '2.0.0', status: 'published' },
        ]}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Close comparison' }));
    expect(onClose).toHaveBeenCalled();
  });
});
