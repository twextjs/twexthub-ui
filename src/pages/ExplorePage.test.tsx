import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExplorePage } from './ExplorePage';
import { api } from '../services/api';
import { makeExtension, paginated, noop } from '../test/testUtils';
import { clearSavedExtensions, toggleExtensionSaved } from '../lib/collections';
import { EXPLORE_PREFS_KEY } from '../lib/preferences';

vi.mock('../services/api');

const apiMock = vi.mocked(api);
const PAGE_RESULT = paginated(
  [makeExtension({ id: 'demo', name: 'Demo Extension' })],
  'cursor-2',
  true,
);

beforeEach(() => {
  localStorage.clear();
  clearSavedExtensions();
  apiMock.getExtensions.mockResolvedValue(PAGE_RESULT);
  apiMock.searchExtensions.mockResolvedValue(PAGE_RESULT);
});

describe('ExplorePage', () => {
  it('lists published extensions in the default grid', async () => {
    render(<ExplorePage onNavigate={noop} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explore Twext Extensions' }),
    ).toBeInTheDocument();
    expect(apiMock.getExtensions).toHaveBeenCalledWith({ cursor: undefined, limit: 12 });
    await screen.findByText('Demo Extension');
  });

  it('paginates using the server-provided cursor', async () => {
    const user = userEvent.setup();
    render(<ExplorePage onNavigate={noop} />);
    await screen.findByText('Demo Extension');

    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(apiMock.getExtensions).toHaveBeenLastCalledWith({ cursor: 'cursor-2', limit: 12 });

    await user.click(screen.getByRole('button', { name: /Previous/i }));
    expect(apiMock.getExtensions).toHaveBeenLastCalledWith({ cursor: undefined, limit: 12 });
  });

  it('performs a search when querying', async () => {
    const user = userEvent.setup();
    render(<ExplorePage onNavigate={noop} />);
    await screen.findByText('Demo Extension');
    const search = screen.getByPlaceholderText(/Search/i);
    await user.type(search, 'physics');
    await user.click(screen.getByRole('button', { name: /^Search$/i }));
    expect(apiMock.searchExtensions).toHaveBeenCalledWith('physics', {
      cursor: undefined,
      limit: 12,
    });
  });

  it('navigates to an extension detail on card click', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<ExplorePage onNavigate={onNavigate} />);
    await screen.findByText('Demo Extension');
    await user.click(screen.getByRole('button', { name: /view details for demo extension/i }));
    expect(onNavigate).toHaveBeenCalledWith('ext/kane/demo');
  });

  it('sorts the current page by name', async () => {
    apiMock.getExtensions.mockResolvedValue(
      paginated([
        makeExtension({ id: 'b', name: 'Beta' }),
        makeExtension({ id: 'a', name: 'Alpha' }),
      ]),
    );
    const user = userEvent.setup();
    render(<ExplorePage onNavigate={noop} />);
    await screen.findByText('Beta');

    await user.selectOptions(screen.getByLabelText('Sort results'), 'name');
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Alpha');
    expect(headings[1]).toHaveTextContent('Beta');
  });

  it('filters to saved extensions only', async () => {
    apiMock.getExtensions.mockResolvedValue(
      paginated([
        makeExtension({ id: 'demo', name: 'Demo Extension' }),
        makeExtension({ id: 'other', name: 'Other Extension' }),
      ]),
    );
    toggleExtensionSaved(makeExtension({ id: 'demo', name: 'Demo Extension' }));
    const user = userEvent.setup();
    render(<ExplorePage onNavigate={noop} />);
    await screen.findByText('Other Extension');

    await user.click(screen.getByRole('button', { name: /Saved/ }));
    expect(screen.getByText('Demo Extension')).toBeInTheDocument();
    expect(screen.queryByText('Other Extension')).not.toBeInTheDocument();
  });

  it('restores persisted view preferences', async () => {
    localStorage.setItem(
      EXPLORE_PREFS_KEY,
      JSON.stringify({ viewMode: 'list', limit: 24, sort: 'newest' }),
    );
    render(<ExplorePage onNavigate={noop} />);
    expect(apiMock.getExtensions).toHaveBeenCalledWith({ cursor: undefined, limit: 24 });
  });
});
