import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BadgePanel } from './BadgePanel';
import { api } from '../services/api';
import { DEFAULT_API_BASE_URL } from '../config/settings';
import { noop } from '../test/testUtils';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

// The badge URL is copied into Markdown and rendered on other sites, so it has
// to be absolute rather than relative to whoever is reading the README.
const base = `${window.location.origin}${DEFAULT_API_BASE_URL}`;

beforeEach(() => {
  apiMock.getBaseUrl.mockReturnValue(DEFAULT_API_BASE_URL);
  apiMock.getPublicBaseUrl.mockReturnValue(base);
});

describe('BadgePanel', () => {
  it('previews and links the combined badge by default', () => {
    render(<BadgePanel namespace="kane" id="demo" onClose={noop} />);

    const img = screen.getByAltText('Badge for @kane/demo');
    expect(img).toHaveAttribute('src', `${base}/badge/@kane/demo`);
    expect(
      screen.getByText(`![version + downloads](${base}/badge/@kane/demo)`),
    ).toBeInTheDocument();
  });

  it('emits the combined badge exactly once for multiple facts', async () => {
    const user = userEvent.setup();
    render(<BadgePanel namespace="kane" id="demo" onClose={noop} />);

    await user.click(screen.getByRole('checkbox', { name: 'License' }));

    // All three facts collapse into one image, not one image per fact.
    expect(
      screen.getByText(`![version + downloads + license](${base}/badge/@kane/demo)`),
    ).toBeInTheDocument();
  });

  it('uses the one-fact endpoint when a single fact is selected', async () => {
    const user = userEvent.setup();
    render(<BadgePanel namespace="kane" id="demo" onClose={noop} />);

    await user.click(screen.getByRole('checkbox', { name: 'Downloads' }));

    expect(screen.getByAltText('Badge for @kane/demo')).toHaveAttribute(
      'src',
      `${base}/badge/@kane/demo/version`,
    );
  });

  it('encodes the extension name and a custom left-pill label', async () => {
    const user = userEvent.setup();
    render(<BadgePanel namespace="my ns" id="de/mo" onClose={noop} />);

    await user.type(screen.getByLabelText('Left-pill text (optional)'), 'my badge');

    expect(screen.getByAltText('Badge for @my ns/de/mo')).toHaveAttribute(
      'src',
      `${base}/badge/@my%20ns/de%2Fmo?label=my%20badge`,
    );
  });

  it('prompts to select a fact when every fact is deselected', async () => {
    const user = userEvent.setup();
    render(<BadgePanel namespace="kane" id="demo" onClose={noop} />);

    await user.click(screen.getByRole('checkbox', { name: 'Version' }));
    await user.click(screen.getByRole('checkbox', { name: 'Downloads' }));

    expect(screen.getByText('Select at least one fact to preview.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Copy/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('closes via the close button and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BadgePanel namespace="kane" id="demo" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
