import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPage } from './PrivacyPage';
import { api } from '../services/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.getPrivacy.mockResolvedValue({
    version: 5,
    body: '# Privacy Policy\n\nWe collect minimal data.',
    updatedAt: '2026-08-01T00:00:00Z',
  });
});

describe('PrivacyPage', () => {
  it('renders the privacy document and its version', async () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(await screen.findByText('Version 5')).toBeInTheDocument();
    expect(screen.getByText(/We collect minimal data/)).toBeInTheDocument();
  });

  it('surfaces the error state when the document cannot be fetched', async () => {
    apiMock.getPrivacy.mockRejectedValue(new Error('Service unavailable'));
    render(<PrivacyPage />);
    expect(
      await screen.findByText('Failed to load Privacy Policy from server'),
    ).toBeInTheDocument();
  });
});
