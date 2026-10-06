import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TermsBanner } from './TermsBanner';
import { useAuth } from '../context/AuthContext';
import { makeAuthState, noop } from '../test/testUtils';

vi.mock('../context/AuthContext');

const useAuthMock = vi.mocked(useAuth);

beforeEach(() => {
  useAuthMock.mockReset();
});

describe('TermsBanner', () => {
  it('renders nothing for signed-out users', () => {
    useAuthMock.mockReturnValue(
      makeAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        hasAcceptedCurrentTerms: false,
      }),
    );
    const { container } = render(<TermsBanner onNavigate={noop} />);
    expect(container).toHaveTextContent('');
  });

  it('renders nothing when the user has accepted the current terms', () => {
    useAuthMock.mockReturnValue(makeAuthState({ hasAcceptedCurrentTerms: true }));
    const { container } = render(<TermsBanner onNavigate={noop} />);
    expect(container).toHaveTextContent('');
  });

  it('prompts users to review or accept updated terms', async () => {
    const authState = makeAuthState({ hasAcceptedCurrentTerms: false, latestTermsVersion: 9 });
    useAuthMock.mockReturnValue(authState);
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<TermsBanner onNavigate={onNavigate} />);
    expect(screen.getByText('Action Required:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Review Terms/ }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
  });

  it('accepts the current terms through the context', async () => {
    const authState = makeAuthState({ hasAcceptedCurrentTerms: false, latestTermsVersion: 9 });
    useAuthMock.mockReturnValue(authState);
    const user = userEvent.setup();
    render(<TermsBanner onNavigate={noop} />);
    await user.click(screen.getByRole('button', { name: /Accept Current Terms/ }));
    expect(authState.acceptCurrentTerms).toHaveBeenCalled();
  });

  it('renders nothing when the registry has published no terms', () => {
    useAuthMock.mockReturnValue(
      makeAuthState({ hasTerms: false, hasAcceptedCurrentTerms: false, latestTermsVersion: null }),
    );
    const { container } = render(<TermsBanner onNavigate={noop} />);
    expect(container).toHaveTextContent('');
  });
});
