import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ACCEPTED_IMAGE_TYPES,
  formatBytes,
  isOwnImageUrl,
  MAX_IMAGE_BYTES,
  toSameOriginImageUrl,
} from '../lib/profile-image';
import { ApiError, api } from '../services/api';
import { ProfileImages } from '../types/api';
import { Icon } from './Icon';

interface ImageUploadFieldProps {
  namespace: string;
  kind: 'avatar' | 'banner';
  label: string;
  /** The image the server currently reports: an upload path or an external URL. */
  currentUrl: string | null;
  /** Shown when there is no image at all, e.g. the avatar identicon. */
  fallbackUrl?: string;
  /**
   * The link the form will submit. Held by the parent so the settings form
   * keeps one Save button for every field; an upload writes the canonical path
   * the server returns straight into it.
   */
  urlValue: string;
  onUrlValueChange: (value: string) => void;
  /**
   * Uploads to `/orgs/{namespace}` instead of `/users/{namespace}`. Either
   * collection answers with the whole profile, so what comes back is read for
   * its image fields alone.
   */
  organization?: boolean;
  onUploaded: (profile: ProfileImages) => void;
  onRemoved?: (profile: ProfileImages) => void;
  round?: boolean;
}

/**
 * Picks a local image and uploads it, rather than asking for a URL.
 *
 * The link input stays available but collapsed. An upload is what the instance
 * serves and is the obvious path; a link points at someone else's host, which
 * can go away or be blocked, so it is the secondary option. The two are kept
 * side by side on the server, and the link takes over only once the upload is
 * removed, so switching between them costs one click either way.
 *
 * An account and an organization are served the same endpoints apart from the
 * collection, and each answers an upload with the whole profile, so the field
 * is shared and only the target and the reported type differ.
 */
export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  namespace,
  kind,
  label,
  currentUrl,
  fallbackUrl,
  urlValue,
  onUrlValueChange,
  organization = false,
  onUploaded,
  onRemoved,
  round = false,
}) => {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // A failed upload has to fall back to what the server still reports, so the
  // optimistic preview is dropped whenever currentUrl moves under us.
  useEffect(() => {
    setLocalPreview(null);
  }, [currentUrl]);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMAGE_BYTES) {
        setError(
          `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMAGE_BYTES)}.`,
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setPending(true);
      setError(null);
      // Show the picked file straight away so the change is visible while the
      // request is in flight rather than only after it resolves.
      const objectUrl = URL.createObjectURL(file);
      setLocalPreview(objectUrl);
      try {
        const updated = organization
          ? await api.uploadOrganizationImage(namespace, kind, file)
          : await api.uploadProfileImage(namespace, kind, file);
        // Adopt the server's canonical URL so the form state and the saved
        // profile agree even though the user never typed it. Either profile
        // carries both images, so take the one this field owns.
        onUrlValueChange((kind === 'avatar' ? updated.avatarUrl : updated.bannerUrl) ?? '');
        onUploaded(updated);
      } catch (err) {
        setLocalPreview(null);
        setError(err instanceof ApiError ? err.message : 'Upload failed. Try again.');
      } finally {
        URL.revokeObjectURL(objectUrl);
        setPending(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [namespace, kind, organization, onUrlValueChange, onUploaded],
  );

  const remove = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const updated = organization
        ? await api.deleteOrganizationImage(namespace, kind)
        : await api.deleteProfileImage(namespace, kind);
      onUrlValueChange('');
      setLocalPreview(null);
      onRemoved?.(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the image.');
    } finally {
      setPending(false);
    }
  }, [namespace, kind, organization, onUrlValueChange, onRemoved]);

  // The server reports an upload as this account's own canonical path, carrying
  // the version of the bytes, and a link as whatever the account pointed at, so
  // the two are told apart by that version rather than by the path alone. Only
  // an upload can be removed from here: a link is cleared in the field below it
  // and saved, which is also the only way to tell the instance to stop
  // reporting it.
  const isUpload = isOwnImageUrl(currentUrl, namespace, kind, organization);
  const hasImage = Boolean(currentUrl || localPreview);
  // The preview is rewritten onto the same origin the API is served through,
  // so the browser fetches the picture from this site's server rather than
  // straight off the API host, yet what the form submits (urlValue) stays the
  // raw address for the API to store.
  const displayed =
    localPreview ?? toSameOriginImageUrl(currentUrl ?? fallbackUrl, api.getBaseUrl()) ?? null;
  const shape = round ? 'rounded-full' : 'rounded-lg';
  // The server crops and scales every uploaded banner to 3000x1000, so the
  // preview shows that ratio rather than one invented for the field: what a
  // banner is framed to here is what a profile page crops it to.
  const dimensions = round ? 'w-14 h-14' : 'w-36 h-12';

  return (
    <div className="sm:col-span-2 space-y-2">
      <span className="label block text-ink-2">
        <Icon name="add_photo_alternate" className="icon-xs inline mr-1" />
        {label}
      </span>

      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {displayed ? (
            <img
              src={displayed}
              alt={`${label} preview`}
              data-testid={`${kind}-preview`}
              className={`${shape} ${dimensions} object-cover bg-wash dark:bg-raised border border-line`}
            />
          ) : (
            <div
              data-testid={`${kind}-empty`}
              className={`${shape} ${dimensions} flex items-center justify-center bg-wash dark:bg-raised border border-dashed border-line text-ink-3`}
            >
              <Icon name="add_photo_alternate" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <label
              htmlFor={inputId}
              className="btn btn-secondary text-xs inline-flex items-center gap-1.5 cursor-pointer"
              data-testid={`${kind}-choose`}
            >
              {pending ? (
                <Icon name="progress_activity" className="icon-sm animate-spin" />
              ) : (
                <Icon name="upload" className="icon-sm" />
              )}
              {hasImage ? 'Replace image' : 'Choose image'}
            </label>

            {isUpload && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={pending}
                className="btn btn-ghost text-xs inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400"
                data-testid={`${kind}-remove`}
              >
                <Icon name="delete" className="icon-sm" />
                Remove
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowUrlInput((open) => !open)}
              className="text-meta text-ink-3 hover:text-ink-2 underline inline-flex items-center gap-1"
              data-testid={`${kind}-toggle-url`}
            >
              {showUrlInput ? (
                <Icon name="close" className="icon-xs" />
              ) : (
                <Icon name="link" className="icon-xs" />
              )}
              {showUrlInput ? 'Hide link option' : 'Or use an image link'}
            </button>
          </div>

          <p className="text-meta text-ink-3">
            PNG, JPEG, GIF, WebP, or AVIF, up to {formatBytes(MAX_IMAGE_BYTES)}. Uploaded images are
            stored and served by this site.
          </p>

          {showUrlInput && (
            <div className="space-y-1">
              <label htmlFor={`${inputId}-url`} className="text-meta text-ink-3 block">
                Image URL
              </label>
              <input
                id={`${inputId}-url`}
                type="url"
                value={urlValue}
                onChange={(e) => onUrlValueChange(e.target.value)}
                maxLength={400}
                placeholder="https://example.com/image.png"
                className="input text-xs"
                autoComplete="off"
                data-testid={`${kind}-url`}
              />
              <p className="text-meta text-ink-3">
                A link is referenced rather than uploaded, so it depends on another host staying up.
                {isUpload
                  ? ' The uploaded image is used while it exists; this is the fallback if it is removed.'
                  : ''}
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="text-meta text-rose-600 dark:text-rose-400 flex items-start gap-1"
              data-testid={`${kind}-error`}
            >
              <Icon name="error" className="icon-sm shrink-0" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
