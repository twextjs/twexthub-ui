import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploadField } from './ImageUploadField';
import { formatBytes, MAX_IMAGE_BYTES } from '../lib/profile-image';
import { api, ApiError } from '../services/api';
import { User } from '../types/api';
import { makeOrganization, makeUser } from '../test/testUtils';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getBaseUrl: vi.fn(),
      uploadProfileImage: vi.fn(),
      deleteProfileImage: vi.fn(),
      uploadOrganizationImage: vi.fn(),
      deleteOrganizationImage: vi.fn(),
    },
  };
});

const apiMock = vi.mocked(api);

const USER = makeUser({ namespace: 'kane' });

function renderField(overrides: Partial<React.ComponentProps<typeof ImageUploadField>> = {}) {
  const onUploaded = vi.fn();
  const onRemoved = vi.fn();
  const onUrlValueChange = vi.fn();
  const result = render(
    <ImageUploadField
      namespace="kane"
      kind="avatar"
      label="Avatar image"
      currentUrl={null}
      fallbackUrl="https://api.test/v2/users/kane/avatar?v=0123456789abcdef"
      urlValue=""
      onUrlValueChange={onUrlValueChange}
      onUploaded={onUploaded}
      onRemoved={onRemoved}
      {...overrides}
    />,
  );
  return { ...result, onUploaded, onRemoved, onUrlValueChange };
}

function imageFile(name = 'me.png', type = 'image/png', size = 1024) {
  const file = new File(['x'.repeat(size)], name, { type });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The component renders the preview on the API base it is served through.
  apiMock.getBaseUrl.mockReturnValue('/api/v2');
  apiMock.uploadProfileImage.mockResolvedValue({
    ...USER,
    avatarUrl: '/v2/users/kane/avatar?v=0123456789abcdef',
  });
  apiMock.deleteProfileImage.mockResolvedValue({ ...USER, avatarUrl: null });
  // Only the object URL pair is faked. Spreading the class would leave a plain
  // object in place of the constructor, and `new URL(...)` elsewhere would stop
  // working, so the real one is extended instead.
  const RealURL = URL;
  vi.stubGlobal(
    'URL',
    Object.assign(class extends RealURL {}, {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    }),
  );
});

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('ImageUploadField', () => {
  it('uploads to the organization collection when the target is one', async () => {
    const user = userEvent.setup();
    // The organization endpoints answer with the whole profile, not just the
    // two image fields, so the field reads it and hands the rest on.
    apiMock.uploadOrganizationImage.mockResolvedValue(
      makeOrganization({ avatarUrl: '/v2/orgs/acme/avatar?v=0123456789abcdef', bannerUrl: null }),
    );
    const { onUploaded, onUrlValueChange } = renderField({ organization: true, namespace: 'acme' });
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    await waitFor(() => expect(apiMock.uploadOrganizationImage).toHaveBeenCalledTimes(1));
    expect(apiMock.uploadOrganizationImage.mock.calls[0][0]).toBe('acme');
    expect(apiMock.uploadOrganizationImage.mock.calls[0][1]).toBe('avatar');
    expect(onUploaded).toHaveBeenCalled();
    expect(onUrlValueChange).toHaveBeenCalledWith('/v2/orgs/acme/avatar?v=0123456789abcdef');
    // An account's endpoints are not touched for an organization.
    expect(apiMock.uploadProfileImage).not.toHaveBeenCalled();
  });

  it('removes an organization image through the organization endpoint', async () => {
    const user = userEvent.setup();
    apiMock.deleteOrganizationImage.mockResolvedValue(
      makeOrganization({ avatarUrl: null, bannerUrl: null }),
    );
    renderField({
      organization: true,
      namespace: 'acme',
      currentUrl: '/v2/orgs/acme/avatar?v=0123456789abcdef',
    });

    await user.click(screen.getByTestId('avatar-remove'));

    await waitFor(() =>
      expect(apiMock.deleteOrganizationImage).toHaveBeenCalledWith('acme', 'avatar'),
    );
    expect(apiMock.deleteProfileImage).not.toHaveBeenCalled();
  });

  it('offers removal for an organization upload published under /orgs', () => {
    renderField({
      organization: true,
      namespace: 'acme',
      currentUrl: 'https://api.example/api/v2/orgs/acme/avatar?v=0123456789abcdef',
    });

    expect(screen.getByTestId('avatar-remove')).toBeInTheDocument();
  });

  it('offers no removal for an organization image held under another collection', () => {
    renderField({
      organization: true,
      namespace: 'acme',
      currentUrl: '/v2/users/acme/avatar?v=0123456789abcdef',
    });

    // A file under /users is not this organization's, however well the version
    // happens to fit.
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
  });

  it('offers a file picker rather than demanding a URL', () => {
    renderField();
    const input = screen.getByTestId('avatar-choose');
    expect(input).toHaveAttribute('for');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;
    expect(fileInput.type).toBe('file');
    // The link field is secondary, so it is not rendered until asked for.
    expect(screen.queryByTestId('avatar-url')).toBeNull();
  });

  it('restricts the picker to the formats the API accepts', () => {
    renderField();
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;
    expect(fileInput.accept).toBe('image/png,image/jpeg,image/gif,image/webp,image/avif');
  });

  it('uploads the chosen file instead of submitting a URL', async () => {
    const user = userEvent.setup();
    const { onUploaded, onUrlValueChange } = renderField();
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    await waitFor(() => expect(apiMock.uploadProfileImage).toHaveBeenCalledTimes(1));
    const [namespace, kind, sent] = apiMock.uploadProfileImage.mock.calls[0];
    expect(namespace).toBe('kane');
    expect(kind).toBe('avatar');
    expect(sent).toBeInstanceOf(File);
    expect(onUploaded).toHaveBeenCalled();
    // The canonical URL the server reported is adopted into the form so Save
    // does not try to push a URL the user never typed.
    expect(onUrlValueChange).toHaveBeenCalledWith('/v2/users/kane/avatar?v=0123456789abcdef');
  });

  it('writes the banner URL into a banner upload, not the avatar it also carries', async () => {
    const user = userEvent.setup();
    // The server returns the whole user, so a banner upload comes back with
    // whatever avatar the account already had.
    apiMock.uploadProfileImage.mockResolvedValue({
      ...USER,
      avatarUrl: '/v2/users/kane/avatar?v=0123456789abcdef',
      bannerUrl: '/v2/users/kane/banner?v=0123456789abcdef',
    });
    const { onUrlValueChange } = renderField({ kind: 'banner' });
    const input = screen.getByTestId('banner-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    await waitFor(() => expect(apiMock.uploadProfileImage).toHaveBeenCalledTimes(1));
    expect(onUrlValueChange).toHaveBeenCalledWith('/v2/users/kane/banner?v=0123456789abcdef');
  });

  it('shows the picked image immediately, before the request resolves', async () => {
    const user = userEvent.setup();
    // Held open so the optimistic preview can be asserted before the response
    // arrives; released at the end of the test.
    let release!: (user: User) => void;
    apiMock.uploadProfileImage.mockReturnValue(
      new Promise<User>((resolve) => {
        release = resolve;
      }),
    );
    renderField();
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    expect(await screen.findByTestId('avatar-preview')).toHaveAttribute('src', 'blob:preview');
    release({ ...USER, avatarUrl: '/v2/users/kane/avatar?v=0123456789abcdef' });
  });

  it('refuses an oversized file without calling the API', async () => {
    const user = userEvent.setup();
    renderField();
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile('big.png', 'image/png', MAX_IMAGE_BYTES + 1));

    expect(await screen.findByTestId('avatar-error')).toHaveTextContent(/larger|limit|2\.0 MB/i);
    expect(apiMock.uploadProfileImage).not.toHaveBeenCalled();
  });

  it('surfaces the API message and drops the preview when an upload fails', async () => {
    const user = userEvent.setup();
    apiMock.uploadProfileImage.mockRejectedValue(
      new ApiError('Unsupported image type. Upload a PNG, JPEG, GIF, WebP, or AVIF file.', 415),
    );
    renderField({ currentUrl: 'https://cdn.example/old.png' });
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    expect(await screen.findByTestId('avatar-error')).toHaveTextContent(/Unsupported image type/);
    // Falls back to the image the server still reports, not the failed pick.
    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      'https://cdn.example/old.png',
    );
    expect(screen.getByTestId('avatar-preview')).not.toHaveAttribute('src', 'blob:preview');
  });

  it('reports a generic failure when the error is not an ApiError', async () => {
    const user = userEvent.setup();
    apiMock.uploadProfileImage.mockRejectedValue(new Error('boom'));
    renderField();
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;

    await user.upload(fileInput, imageFile());

    expect(await screen.findByTestId('avatar-error')).toHaveTextContent(/Upload failed/);
  });

  it('removes an uploaded image through the API', async () => {
    const user = userEvent.setup();
    const { onRemoved, onUrlValueChange } = renderField({
      currentUrl: '/v2/users/kane/avatar?v=0123456789abcdef',
    });

    await user.click(screen.getByTestId('avatar-remove'));

    await waitFor(() => expect(apiMock.deleteProfileImage).toHaveBeenCalledWith('kane', 'avatar'));
    expect(onRemoved).toHaveBeenCalled();
    expect(onUrlValueChange).toHaveBeenCalledWith('');
  });

  it('offers no remove control for a link, even one on a similar path', () => {
    renderField({ currentUrl: 'https://cdn.example/users/kane/avatar.png' });
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
  });

  it('offers no remove control for the same path without a version', () => {
    // The instance serves that path too, but without the version it is a moving
    // target, so it is not treated as a file that can be removed from here.
    renderField({ currentUrl: '/v2/users/kane/avatar' });
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
  });

  it("offers no remove control for another account's upload", () => {
    renderField({ currentUrl: '/v2/users/someone-else/avatar?v=0123456789abcdef' });
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
  });

  it('offers no remove control when there is no image', () => {
    renderField();
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
  });

  it('offers removal for an upload and calls the server', async () => {
    const user = userEvent.setup();
    apiMock.deleteProfileImage.mockResolvedValue({
      ...USER,
      avatarUrl: 'https://cdn.example/fallback.png',
    });
    renderField({ currentUrl: 'https://api.example/api/v2/users/kane/avatar?v=0123456789abcdef' });

    await user.click(screen.getByTestId('avatar-remove'));

    await waitFor(() => expect(apiMock.deleteProfileImage).toHaveBeenCalledWith('kane', 'avatar'));
  });

  it('offers no removal for a link, which is cleared in the field instead', () => {
    // Removing a link is a PATCH, not a DELETE of an upload, and offering the
    // button here would promise a change the endpoint cannot make.
    renderField({ currentUrl: 'https://cdn.example/external.png' });

    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      'https://cdn.example/external.png',
    );
    expect(screen.queryByTestId('avatar-remove')).toBeNull();
    expect(apiMock.deleteProfileImage).not.toHaveBeenCalled();
  });

  it('keeps the link option collapsed until requested, then edits the parent value', async () => {
    const user = userEvent.setup();
    const { onUrlValueChange } = renderField();

    await user.click(screen.getByTestId('avatar-toggle-url'));
    const field = screen.getByTestId('avatar-url');
    await user.type(field, 'h');

    expect(onUrlValueChange).toHaveBeenCalledWith('h');
  });

  it('falls back to the registry identicon when nothing is set', () => {
    renderField();
    expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
      'src',
      '/api/v2/users/kane/avatar?v=0123456789abcdef',
    );
    expect(screen.queryByTestId('avatar-empty')).toBeNull();
  });

  it('shows an empty placeholder when there is no fallback either', () => {
    renderField({ kind: 'banner', label: 'Banner image', fallbackUrl: undefined });
    expect(screen.getByTestId('banner-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('banner-preview')).toBeNull();
  });

  it('adopts a changed currentUrl and drops the optimistic preview', async () => {
    const user = userEvent.setup();
    const { rerender } = renderField({ currentUrl: null });
    const input = screen.getByTestId('avatar-choose');
    const fileInput = document.getElementById(input.getAttribute('for')!) as HTMLInputElement;
    await user.upload(fileInput, imageFile());
    await waitFor(() => expect(apiMock.uploadProfileImage).toHaveBeenCalled());

    rerender(
      <ImageUploadField
        namespace="kane"
        kind="avatar"
        label="Avatar image"
        currentUrl="/v2/users/kane/avatar?v=0123456789abcdef"
        fallbackUrl="https://api.test/v2/users/kane/avatar?v=0123456789abcdef"
        urlValue="/v2/users/kane/avatar?v=0123456789abcdef"
        onUrlValueChange={vi.fn()}
        onUploaded={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('avatar-preview')).toHaveAttribute(
        'src',
        '/api/v2/users/kane/avatar?v=0123456789abcdef',
      ),
    );
  });
});
