import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupPage } from './SignupPage';
import { useAuth } from '../context/AuthContext';
import { makeAuthState, noop } from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const useAuthMock = vi.mocked(useAuth);
let authState: ReturnType<typeof makeAuthState>;

beforeEach(() => {
  authState = makeAuthState({
    user: null,
    token: null,
    isAuthenticated: false,
    latestTermsVersion: 4,
  });
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue(authState);
});

describe('SignupPage', () => {
  const namespaceInput = () => screen.getByPlaceholderText('your-username');
  const displayNameInput = () => screen.getByPlaceholderText('e.g. Kane Marshall');
  const passwordInput = () => screen.getByPlaceholderText('Minimum 8 characters');

  it('renders the registration form and terms version link', () => {
    render(<SignupPage onNavigate={noop} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create an account' }),
    ).toBeInTheDocument();
    expect(namespaceInput()).toBeInTheDocument();
    expect(displayNameInput()).toBeInTheDocument();
    expect(screen.getByText('Terms of Service (v4)')).toBeInTheDocument();
  });

  it('requires a namespace and password', () => {
    render(<SignupPage onNavigate={noop} />);
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(screen.getByText('Please choose a username and password.')).toBeInTheDocument();
  });

  it('enforces a minimum password length', async () => {
    const user = userEvent.setup();
    render(<SignupPage onNavigate={noop} />);
    await user.type(namespaceInput(), 'kane');
    await user.type(passwordInput(), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Password must be at least 8 characters long.')).toBeInTheDocument();
  });

  it('requires agreeing to the terms', async () => {
    const user = userEvent.setup();
    render(<SignupPage onNavigate={noop} />);
    await user.type(namespaceInput(), 'kane');
    await user.type(passwordInput(), 'long-enough-pass');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/You must agree to the Terms of Service/)).toBeInTheDocument();
  });

  it('signs up, accepts the current terms, and routes to the dashboard', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SignupPage onNavigate={onNavigate} />);
    await user.type(namespaceInput(), 'Kane');
    await user.type(displayNameInput(), 'Kane Marshall');
    await user.type(passwordInput(), 'long-enough-pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(authState.signup).toHaveBeenCalledWith('kane', 'long-enough-pass', 'Kane Marshall');
    expect(authState.acceptCurrentTerms).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('links to the login page', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SignupPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /^Sign in$/ }));
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('omits the terms consent and acceptance call when nothing is published', async () => {
    const onNavigate = vi.fn();
    authState = makeAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      hasTerms: false,
      latestTermsVersion: null,
    });
    useAuthMock.mockReturnValue(authState);
    const user = userEvent.setup();
    render(<SignupPage onNavigate={onNavigate} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/Terms of Service/)).toBeNull();

    await user.type(namespaceInput(), 'kane');
    await user.type(passwordInput(), 'long-enough-pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(authState.signup).toHaveBeenCalled();
    expect(authState.acceptCurrentTerms).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });
});
