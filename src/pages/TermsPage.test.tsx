import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TermsPage } from './TermsPage';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { makeAuthState, makeUser, noop } from '../test/testUtils';

vi.mock('../services/api');
vi.mock('../context/AuthContext');

const apiMock = vi.mocked(api);
const useAuthMock = vi.mocked(useAuth);

beforeEach(() => {
  apiMock.getTerms.mockResolvedValue({
    version: 7,
    body: '# Twext Terms\n\nThese are the terms.',
    updatedAt: '2026-08-01T00:00:00Z',
  });
  useAuthMock.mockReset();
});

describe('TermsPage', () => {
  it('renders the terms document and version', async () => {
    useAuthMock.mockReturnValue(makeAuthState({ hasAcceptedCurrentTerms: true }));
    render(<TermsPage onNavigate={noop} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(await screen.findByText('Version 7')).toBeInTheDocument();
    expect(screen.getByText(/These are the terms/)).toBeInTheDocument();
  });

  it('invites signed-out visitors to sign in', async () => {
    useAuthMock.mockReturnValue(makeAuthState({ user: null, token: null, isAuthenticated: false }));
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<TermsPage onNavigate={onNavigate} />);
    expect(
      await screen.findByText(/Sign in to your author account to record your terms acceptance/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Sign in$/ }));
    expect(onNavigate).toHaveBeenCalledWith('login');
  });

  it('lets an authenticated user accept the current terms', async () => {
    const authState = makeAuthState({
      user: makeUser({ termsAcceptedVersion: 6 }),
      hasAcceptedCurrentTerms: false,
      latestTermsVersion: 7,
    });
    useAuthMock.mockReturnValue(authState);
    render(<TermsPage onNavigate={noop} />);
    const accept = await screen.findByRole('button', { name: /Accept Terms of Service/ });
    await userEvent.click(accept);
    expect(authState.acceptCurrentTerms).toHaveBeenCalled();
  });

  it('shows an accepted confirmation to users already in compliance', async () => {
    useAuthMock.mockReturnValue(makeAuthState({ hasAcceptedCurrentTerms: true }));
    render(<TermsPage onNavigate={noop} />);
    expect(await screen.findByText(/Accepted by Kane/)).toBeInTheDocument();
  });

  it('explains that nothing has been published instead of demanding acceptance', async () => {
    apiMock.getTerms.mockRejectedValue(new ApiError('Not Found', 404));
    useAuthMock.mockReturnValue(makeAuthState({ hasTerms: false, hasAcceptedCurrentTerms: true }));
    render(<TermsPage onNavigate={noop} />);

    expect(await screen.findByText('No Terms of Service have been published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept Terms/ })).toBeNull();
    expect(screen.queryByText(/Action Required: Acceptance Needed/)).toBeNull();
  });

  it('still reports a genuine load failure', async () => {
    apiMock.getTerms.mockRejectedValue(new ApiError('Internal Server Error', 500));
    useAuthMock.mockReturnValue(makeAuthState({ hasAcceptedCurrentTerms: true }));
    render(<TermsPage onNavigate={noop} />);
    expect(await screen.findByText('Internal Server Error')).toBeInTheDocument();
  });
});
