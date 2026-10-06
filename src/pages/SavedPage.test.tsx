import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedPage } from './SavedPage';
import {
  clearRecentExtensions,
  clearSavedExtensions,
  toggleExtensionSaved,
} from '../lib/collections';
import { makeExtension, noop } from '../test/testUtils';

beforeEach(() => {
  clearSavedExtensions();
  clearRecentExtensions();
});

describe('SavedPage', () => {
  it('shows an empty state with a browse action', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SavedPage onNavigate={onNavigate} />);

    expect(screen.getByText('No saved extensions yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browse extensions' }));
    expect(onNavigate).toHaveBeenCalledWith('search');
  });

  it('lists saved extensions and removes them via the card toggle', async () => {
    toggleExtensionSaved(makeExtension({ namespace: 'ada', id: 'calc', name: 'Calculator' }));
    render(<SavedPage onNavigate={noop} />);

    expect(screen.getByText('Calculator')).toBeInTheDocument();
    expect(screen.getByText('Saved Extensions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Remove Calculator from saved/ }));
    expect(screen.getByText('No saved extensions yet')).toBeInTheDocument();
  });

  it('clears the whole list after confirmation', async () => {
    toggleExtensionSaved(makeExtension({ namespace: 'ada', id: 'calc', name: 'Calculator' }));
    const user = userEvent.setup();
    render(<SavedPage onNavigate={noop} />);

    await user.click(screen.getByRole('button', { name: /Clear all/ }));
    await user.click(screen.getByRole('button', { name: 'Clear saved list' }));

    expect(screen.getByText('No saved extensions yet')).toBeInTheDocument();
  });
});
