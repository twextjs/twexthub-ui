import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { makeAuthState, noop } from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const useAuthMock = vi.mocked(useAuth);
let authState: ReturnType<typeof makeAuthState>;

beforeEach(() => {
  authState = makeAuthState({ user: null, token: null, isAuthenticated: false });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue(authState);
});

describe('LoginPage', () => {
  const namespaceInput = () => screen.getByPlaceholderText('your-username');
  const passwordInput = () => screen.getByLabelText('Password');

  it('renders the sign-in form', () => {
    render(<LoginPage onNavigate={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Twext' })).toBeInTheDocument();
    expect(namespaceInput()).toBeInTheDocument();
    expect(passwordInput()).toBeInTheDocument();
  });

  it('validates empty submissions', () => {
    render(<LoginPage onNavigate={noop} />);
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(screen.getByText('Please enter your username and password.')).toBeInTheDocument();
    expect(authState.login).not.toHaveBeenCalled();
  });

  it('logs in with a lowercased namespace and navigates to the dashboard', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<LoginPage onNavigate={onNavigate} />);
    await user.type(namespaceInput(), 'Kane');
    await user.type(passwordInput(), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(authState.login).toHaveBeenCalledWith('kane', 'secret');
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('surfaces authentication errors', async () => {
    authState.login.mockRejectedValue(new ApiError('Invalid credentials.', 401));
    const user = userEvent.setup();
    render(<LoginPage onNavigate={noop} />);
    await user.type(namespaceInput(), 'kane');
    await user.type(passwordInput(), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument();
  });

  it('links to the signup page', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<LoginPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /Sign up/ }));
    expect(onNavigate).toHaveBeenCalledWith('signup');
  });
});
