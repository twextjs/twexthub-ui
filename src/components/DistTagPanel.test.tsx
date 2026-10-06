import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DistTagPanel } from './DistTagPanel';
import { api } from '../services/api';
import { noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.getDistTags.mockResolvedValue({});
});

const renderPanel = (publishedVersions = ['1.0.0', '0.9.0']) =>
  render(
    <DistTagPanel
      namespace="kane"
      id="demo"
      publishedVersions={publishedVersions}
      onClose={noop}
    />,
  );

describe('DistTagPanel', () => {
  it('lists tags and marks latest as reserved', async () => {
    apiMock.getDistTags.mockResolvedValue({ latest: '1.0.0', next: '0.9.0' });
    renderPanel();

    expect(await screen.findByText('latest')).toBeInTheDocument();
    expect(screen.getByText('next')).toBeInTheDocument();
    expect(screen.getByText('reserved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tag latest' })).toBeNull();
  });

  it('shows an empty state when no tags exist', async () => {
    renderPanel();
    expect(await screen.findByText('No dist-tags yet.')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    apiMock.getDistTags.mockRejectedValue(new Error('boom'));
    renderPanel();
    expect(await screen.findByText('Failed to load dist-tags')).toBeInTheDocument();
  });

  it('saves a new tag pointing at the chosen version', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByLabelText('Tag'), 'next');
    await user.selectOptions(screen.getByLabelText('Version'), '0.9.0');
    await user.click(screen.getByRole('button', { name: /Save tag/ }));

    expect(apiMock.setDistTag).toHaveBeenCalledWith('kane', 'demo', 'next', '0.9.0');
  });

  it('rejects an invalid tag name', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('No dist-tags yet.');

    await user.type(screen.getByLabelText('Tag'), 'bad tag!');
    await user.click(screen.getByRole('button', { name: /Save tag/ }));

    expect(await screen.findByText('Use 1-30 letters, digits, or hyphens.')).toBeInTheDocument();
    expect(apiMock.setDistTag).not.toHaveBeenCalled();
  });

  it('refuses to set the reserved latest tag', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('No dist-tags yet.');

    await user.type(screen.getByLabelText('Tag'), 'latest');
    await user.click(screen.getByRole('button', { name: /Save tag/ }));

    expect(
      await screen.findByText('"latest" is reserved and always points at the newest version.'),
    ).toBeInTheDocument();
    expect(apiMock.setDistTag).not.toHaveBeenCalled();
  });

  it('reports a save failure', async () => {
    const user = userEvent.setup();
    apiMock.setDistTag.mockRejectedValue(new Error('nope'));
    renderPanel();
    await screen.findByText('No dist-tags yet.');

    await user.type(screen.getByLabelText('Tag'), 'next');
    await user.click(screen.getByRole('button', { name: /Save tag/ }));

    expect(await screen.findByText('Failed to save dist-tag')).toBeInTheDocument();
  });

  it('disables the form when there are no published versions', async () => {
    renderPanel([]);
    expect(await screen.findByText(/No published versions to tag yet\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save tag/ })).toBeDisabled();
  });

  it('confirms then removes a tag', async () => {
    const user = userEvent.setup();
    apiMock.getDistTags.mockResolvedValue({ latest: '1.0.0', next: '0.9.0' });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Remove tag next' }));
    await user.click(await screen.findByRole('button', { name: 'Remove tag' }));

    await waitFor(() => expect(apiMock.deleteDistTag).toHaveBeenCalledWith('kane', 'demo', 'next'));
    await waitFor(() => expect(screen.queryByText('next')).toBeNull());
  });

  it('keeps the tag when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    apiMock.getDistTags.mockResolvedValue({ next: '0.9.0' });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Remove tag next' }));
    await user.click(await screen.findByRole('button', { name: /Cancel/ }));

    expect(apiMock.deleteDistTag).not.toHaveBeenCalled();
    expect(screen.getByText('next')).toBeInTheDocument();
  });
});
