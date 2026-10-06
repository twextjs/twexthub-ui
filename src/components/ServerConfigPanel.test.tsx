import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerConfigPanel } from './ServerConfigPanel';
import { ApiError, api } from '../services/api';
import { renderWithProviders } from '../test/testUtils';
import type { ServerConfig, ServerSetting } from '../types/api';

vi.mock('../services/api');

const apiMock = vi.mocked(api);

const limitSetting: ServerSetting = {
  key: 'limits.maxProfileImageBytes',
  label: 'Profile image size',
  help: 'Applies to avatars and banners.',
  type: 'bytes',
  min: 65536,
  max: 16777216,
  restartRequired: false,
  value: 2097152,
};

const baseUrlSetting: ServerSetting = {
  key: 'publicBaseUrl',
  label: 'Public base URL',
  type: 'url',
  min: null,
  max: null,
  restartRequired: false,
  value: 'https://hub.example',
};

const restartSetting: ServerSetting = {
  key: 'auth.sessionTtlDays',
  label: 'Session lifetime',
  type: 'number',
  min: 1,
  max: 365,
  restartRequired: true,
  value: 7,
};

const unsetSetting: ServerSetting = {
  key: 'compiler.timeoutMs',
  label: 'Compile timeout',
  type: 'number',
  min: 100,
  max: 60000,
  restartRequired: false,
  value: null,
};

const config = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  editable: true,
  reason: null,
  configPath: '/etc/twexthub/config.yaml',
  settings: [limitSetting, baseUrlSetting, restartSetting, unsetSetting],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getServerConfig.mockResolvedValue(config());
  apiMock.updateServerConfig.mockImplementation(async (patch) => {
    const changed: Record<
      string,
      { before: ServerSetting['value']; after: ServerSetting['value'] }
    > = {};
    for (const [key, after] of Object.entries(patch)) changed[key] = { before: null, after };
    return {
      changed,
      restartRequired: Object.keys(patch).filter(
        (key) => config().settings.find((s) => s.key === key)?.restartRequired,
      ),
      settings: config().settings.map((s) =>
        key_in(patch, s.key) ? { ...s, value: patch[s.key] as ServerSetting['value'] } : s,
      ),
    };
  });
});

function key_in(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

const save = () => screen.getByRole('button', { name: /Save changes/ });

describe('ServerConfigPanel', () => {
  it('reads the settings and explains where they are written', async () => {
    renderWithProviders(<ServerConfigPanel />);

    expect(await screen.findByLabelText(/Profile image size/)).toHaveValue(2097152);
    expect(screen.getByRole('heading', { name: 'Site settings' })).toBeInTheDocument();
    expect(screen.getByText(/Applies to avatars and banners\./)).toBeInTheDocument();
  });

  it('keeps the save button disabled until something changes', async () => {
    renderWithProviders(<ServerConfigPanel />);
    expect(await screen.findByLabelText(/Profile image size/)).toBeInTheDocument();
    expect(save()).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Profile image size/));
    await userEvent.type(screen.getByLabelText(/Profile image size/), '3145728');
    expect(save()).toBeEnabled();
  });

  it('sends only the settings that changed, and reports what it applied', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Profile image size/);

    await userEvent.clear(input);
    await userEvent.type(input, '4194304');
    await userEvent.click(save());

    await waitFor(() => expect(apiMock.updateServerConfig).toHaveBeenCalledTimes(1));
    expect(apiMock.updateServerConfig).toHaveBeenCalledWith({
      'limits.maxProfileImageBytes': 4194304,
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(await screen.findByText(/Updated Profile image size/)).toBeInTheDocument();
  });

  it('refuses to submit a value the setting does not accept', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Profile image size/);

    await userEvent.clear(input);
    await userEvent.type(input, '99999999');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(save()).toBeDisabled();
    expect(await screen.findByText(/At most 16777216\./)).toBeInTheDocument();
    expect(screen.getByText(/1 setting needs a fix before saving/)).toBeInTheDocument();
    expect(apiMock.updateServerConfig).not.toHaveBeenCalled();
  });

  it('leaves a setting the file never set alone, rather than flagging it', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = (await screen.findByLabelText(/Compile timeout/)) as HTMLInputElement;

    expect(input).toHaveValue(null);
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/needs a fix before saving/)).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('unsets a value by clearing its field, instead of storing zero', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Profile image size/);

    await userEvent.clear(input);
    expect(input).not.toHaveAttribute('aria-invalid');
    await userEvent.click(save());

    await waitFor(() =>
      expect(apiMock.updateServerConfig).toHaveBeenCalledWith({
        'limits.maxProfileImageBytes': null,
      }),
    );
  });

  it('will not submit a base URL that is not one', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Public base URL/);

    await userEvent.clear(input);
    await userEvent.type(input, 'hub.example');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(save()).toBeDisabled();
    expect(await screen.findByText(/Start with http/)).toBeInTheDocument();
  });

  it('unsets a base URL by clearing its field, the way numbers behave', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = (await screen.findByLabelText(/Public base URL/)) as HTMLInputElement;

    await userEvent.clear(input);
    // An empty field means the file stops mentioning the key, so it is not a
    // value that needs fixing.
    expect(input).not.toHaveAttribute('aria-invalid');
    await userEvent.click(save());

    await waitFor(() =>
      expect(apiMock.updateServerConfig).toHaveBeenCalledWith({ publicBaseUrl: null }),
    );
  });

  it('treats a whitespace-only base URL as unset rather than as a missing scheme', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = (await screen.findByLabelText(/Public base URL/)) as HTMLInputElement;

    await userEvent.clear(input);
    await userEvent.type(input, '   ');

    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Start with http/)).not.toBeInTheDocument();
  });

  it('says a setting needs a restart once it has been written', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Session lifetime/);

    await userEvent.clear(input);
    await userEvent.type(input, '30');
    expect(screen.getByText(/needs a restart/)).toBeInTheDocument();

    await userEvent.click(save());
    expect(
      await screen.findByText(/Session lifetime only takes effect after a restart/),
    ).toBeInTheDocument();
  });

  it('shows a setting the file leaves unset as such', async () => {
    renderWithProviders(<ServerConfigPanel />);
    expect(await screen.findByText('not set in the file')).toBeInTheDocument();
  });

  it('reads a list of origins as one per line', async () => {
    apiMock.getServerConfig.mockResolvedValue(
      config({
        settings: [
          {
            key: 'cors.allowedOrigins',
            label: 'Allowed origins',
            type: 'origins',
            min: null,
            max: null,
            restartRequired: false,
            value: ['https://a.example', 'https://b.example'],
          },
        ],
      }),
    );
    renderWithProviders(<ServerConfigPanel />);
    const input = (await screen.findByLabelText(/Allowed origins/)) as HTMLTextAreaElement;
    expect(input.value).toBe('https://a.example\nhttps://b.example');

    await userEvent.clear(input);
    await userEvent.type(input, 'https://c.example{Enter}https://d.example');
    await userEvent.click(save());

    await waitFor(() =>
      expect(apiMock.updateServerConfig).toHaveBeenCalledWith({
        'cors.allowedOrigins': ['https://c.example', 'https://d.example'],
      }),
    );
  });

  it('turns a boolean setting into a checkbox', async () => {
    apiMock.getServerConfig.mockResolvedValue(
      config({
        settings: [
          {
            key: 'logging.requests',
            label: 'Request logging',
            type: 'boolean',
            min: null,
            max: null,
            restartRequired: false,
            value: false,
          },
        ],
      }),
    );
    renderWithProviders(<ServerConfigPanel />);

    const box = await screen.findByLabelText(/Disabled/);
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    await userEvent.click(save());

    await waitFor(() =>
      expect(apiMock.updateServerConfig).toHaveBeenCalledWith({ 'logging.requests': true }),
    );
  });

  it('discards an edit without sending anything', async () => {
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Profile image size/);

    await userEvent.clear(input);
    await userEvent.type(input, '3145728');
    await userEvent.click(screen.getByRole('button', { name: /Discard/ }));

    expect(input).toHaveValue(2097152);
    expect(save()).toBeDisabled();
    expect(apiMock.updateServerConfig).not.toHaveBeenCalled();
  });

  it('explains a read-only file instead of offering a form that cannot save', async () => {
    apiMock.getServerConfig.mockResolvedValue(
      config({
        editable: false,
        reason: 'The file is inside the container. Mount it as a volume to change it.',
      }),
    );
    renderWithProviders(<ServerConfigPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot save its own settings/i);
    expect(alert).toHaveTextContent(/Mount it as a volume/);
    expect(screen.getByLabelText(/Profile image size/)).toBeDisabled();
    expect(screen.getByLabelText(/Public base URL/)).toBeDisabled();
    expect(save()).toBeDisabled();
  });

  it('says the server refused the write, rather than reporting a change', async () => {
    apiMock.updateServerConfig.mockRejectedValue(
      new ApiError('The configuration file is not on a volume.', 409),
    );
    renderWithProviders(<ServerConfigPanel />);
    const input = await screen.findByLabelText(/Profile image size/);

    await userEvent.clear(input);
    await userEvent.type(input, '3145728');
    await userEvent.click(save());

    expect(await screen.findByText(/not on a volume/)).toBeInTheDocument();
    expect(apiMock.updateServerConfig).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the settings cannot be read at all', async () => {
    apiMock.getServerConfig.mockRejectedValueOnce(new ApiError('Forbidden', 403));
    renderWithProviders(<ServerConfigPanel />);

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByLabelText(/Profile image size/)).toBeInTheDocument();
  });
});
