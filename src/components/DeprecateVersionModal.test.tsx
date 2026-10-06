import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeprecateVersionModal } from './DeprecateVersionModal';
import { api } from '../services/api';
import { noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.deprecateVersion.mockResolvedValue({
    namespace: 'kane',
    id: 'demo',
    version: '1.0.0',
    status: 'deprecated',
    name: 'Demo',
    license: 'MIT',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    deprecation: 'Use 2.x instead.',
  });
});

const renderModal = (onSaved = vi.fn()) => {
  render(
    <DeprecateVersionModal
      namespace="kane"
      id="demo"
      version="1.0.0"
      onClose={noop}
      onSaved={onSaved}
    />,
  );
  return onSaved;
};

describe('DeprecateVersionModal', () => {
  it('submits the notice and reports the saved status', async () => {
    const user = userEvent.setup();
    const onSaved = renderModal();

    await user.type(screen.getByLabelText('Notice'), 'Use 2.x instead.');
    await user.click(screen.getByRole('button', { name: 'Deprecate version' }));

    expect(apiMock.deprecateVersion).toHaveBeenCalledWith(
      'kane',
      'demo',
      '1.0.0',
      'Use 2.x instead.',
    );
    expect(onSaved).toHaveBeenCalledWith('deprecated', 'Use 2.x instead.');
  });

  it('requires a non-empty notice', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Deprecate version' }));

    expect(await screen.findByText('Describe what users should use instead.')).toBeInTheDocument();
    expect(apiMock.deprecateVersion).not.toHaveBeenCalled();
  });

  it('prefills an existing deprecation message', () => {
    render(
      <DeprecateVersionModal
        namespace="kane"
        id="demo"
        version="1.0.0"
        currentMessage="Old notice"
        onClose={noop}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Notice')).toHaveValue('Old notice');
  });

  it('surfaces a save failure', async () => {
    const user = userEvent.setup();
    apiMock.deprecateVersion.mockRejectedValue(new Error('nope'));
    renderModal();

    await user.type(screen.getByLabelText('Notice'), 'Use 2.x instead.');
    await user.click(screen.getByRole('button', { name: 'Deprecate version' }));

    expect(await screen.findByText('Failed to deprecate version')).toBeInTheDocument();
  });

  it('closes without saving when cancelled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeprecateVersionModal
        namespace="kane"
        id="demo"
        version="1.0.0"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(apiMock.deprecateVersion).not.toHaveBeenCalled();
  });
});
