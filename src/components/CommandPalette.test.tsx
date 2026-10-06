import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { makeAdminUser, makeExtension, makeAuthState, paginated } from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');
vi.mock('../context/ThemeContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);
const useThemeMock = vi.mocked(useTheme);

beforeEach(() => {
  apiMock.searchExtensions.mockResolvedValue(paginated([makeExtension({ name: 'Calculator' })]));
  useAuthMock.mockReturnValue(makeAuthState({ user: makeAdminUser() }));
  useThemeMock.mockReturnValue({ theme: 'light', toggleTheme: vi.fn(), setTheme: vi.fn() });
});

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    const { container } = renderPalette(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists navigation commands when open', () => {
    renderPalette(true);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Saved Extensions/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Registry Administration/ })).toBeInTheDocument();
  });

  it('filters commands as the user types', async () => {
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByLabelText('Command palette search'), 'saved');
    expect(screen.getByRole('option', { name: /Saved Extensions/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Home/ })).not.toBeInTheDocument();
  });

  it('searches extensions and navigates on selection', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open onClose={vi.fn()} onNavigate={onNavigate} />);

    await user.type(screen.getByLabelText('Command palette search'), 'calc');
    const option = await screen.findByRole('option', { name: /Calculator/ });
    expect(apiMock.searchExtensions).toHaveBeenCalledWith('calc', { limit: 6 });

    await user.click(option);
    expect(onNavigate).toHaveBeenCalledWith('ext/kane/demo');
  });

  it('runs the active command with the keyboard', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open onClose={vi.fn()} onNavigate={onNavigate} />);

    await user.type(screen.getByLabelText('Command palette search'), 'home');
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('home');
  });
});

function renderPalette(open: boolean) {
  return render(<CommandPalette open={open} onClose={vi.fn()} onNavigate={vi.fn()} />);
}
