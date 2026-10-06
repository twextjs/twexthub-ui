/**
 * Shared between the profile image upload UI and its tests.
 *
 * Lives outside the component file so that module keeps exporting only a
 * component, which is what makes React Fast Refresh work in development.
 */

import { DEFAULT_API_BASE_URL } from '../config/settings';

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];

/** Kept in step with the server's limits.maxProfileImageBytes default. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The digest prefix the server stamps on the uploads it publishes. */
const VERSION = /^[0-9a-f]{16}$/;

/**
 * An upload path, for either sort of namespace: the server publishes profile
 * images of an organization under `/orgs` and those of an account under
 * `/users`, and stamps the same version query on both. The two namespaces can
 * be the same name, so the collection is what tells the files apart.
 */
const OWN_UPLOAD_PATH = /\/(?:users|orgs)\/[^/]+\/(?:avatar|banner)$/;

/** The collection a namespace's images live under, by what sort of namespace it is. */
export function profileImagePath(
  namespace: string,
  kind: 'avatar' | 'banner',
  organization = false,
): string {
  return `${organization ? 'orgs' : 'users'}/${namespace}/${kind}`;
}

/**
 * Whether a reported image URL is this instance serving one of its own files,
 * as opposed to an address the profile linked to.
 *
 * The server publishes an upload as `/{collection}/{namespace}/{kind}` with a
 * prefix of the content digest as a `v` parameter, because the URL has to name
 * the bytes it serves: a re-upload changes them. The path, the collection and
 * the version are all checked, since only the server's own serializer pairs
 * that exact shape together. The origin is deliberately not compared: the
 * address a browser uses to reach the API can differ from the one the server
 * considers public, and refusing to recognise an upload over that difference
 * would hide the remove control.
 */
export function isOwnImageUrl(
  url: string | null | undefined,
  namespace: string,
  kind: 'avatar' | 'banner',
  organization = false,
) {
  if (!url) return false;
  // The server publishes an absolute URL, but a root-relative one still names
  // the same file, so it is parsed against a placeholder base rather than
  // discarded. Only the path and the version are inspected, so the placeholder
  // origin is never compared against anything.
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return (
    OWN_UPLOAD_PATH.test(parsed.pathname) &&
    parsed.pathname.endsWith(`/${profileImagePath(namespace, kind, organization)}`) &&
    VERSION.test(parsed.searchParams.get('v') ?? '')
  );
}

/**
 * Whether a URL names one of this instance's own uploads for any namespace,
 * rather than an address the profile linked to.
 *
 * The same shape `isOwnImageUrl` checks, minus the namespace, the kind and the
 * collection. That is what the image elements need when choosing whether an
 * address is safe to rewrite onto this site's own origin.
 */
export function looksLikeOwnUploadUrl(url: string | null | undefined) {
  if (!url) return false;
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return OWN_UPLOAD_PATH.test(parsed.pathname) && VERSION.test(parsed.searchParams.get('v') ?? '');
}

/**
 * The src an <img> should use so the browser pulls the picture through this
 * site's own server instead of straight off the API host.
 *
 * The server reports an upload relative to its API base, so with an absolute
 * base the reported address alone is absolute too and points the browser at
 * the API host. When that address lives on the API origin it is rewritten to
 * the public `${DEFAULT_API_BASE_URL}` prefix the site proxies. Addresses on
 * any other origin are left as they are: a link is someone else's host by
 * design, and no request to it should be forced through this site.
 *
 * A page served through the proxy sees only the relative prefix, so there is
 * no origin to compare against. There the upload path itself carries the
 * address's API base (`/v2`, `${DEFAULT_API_BASE_URL}`, ...) ahead of
 * `/users/...`, which is read back and swapped for the public prefix. That
 * keeps the browser on the site's origin even though the registered address
 * names the API host.
 */
export function toSameOriginImageUrl(value: string | null | undefined, apiBaseUrl: string) {
  if (!value) return value;
  if (value.startsWith(DEFAULT_API_BASE_URL)) return value;
  const base = /^https?:\/\//i.test(apiBaseUrl) ? parseUrl(apiBaseUrl) : null;
  if (base) {
    const basePath = base.pathname.replace(/\/+$/, '');
    if (basePath && (value === basePath || value.startsWith(`${basePath}/`))) {
      return DEFAULT_API_BASE_URL + value.slice(basePath.length);
    }
    const parsed = parseUrl(value);
    if (parsed?.origin === base.origin) {
      if (basePath && parsed.pathname.startsWith(`${basePath}/`)) {
        return DEFAULT_API_BASE_URL + parsed.pathname.slice(basePath.length) + parsed.search;
      }
      if (parsed.pathname.startsWith(DEFAULT_API_BASE_URL)) {
        return parsed.pathname + parsed.search;
      }
    }
    return value;
  }
  if (looksLikeOwnUploadUrl(value)) {
    const parsed = parseUrl(value);
    // The path ahead of `/users/...` or `/orgs/...` is the API base the registry
    // published against, not part of the image address.
    const addressBase = parsed!.pathname.replace(OWN_UPLOAD_PATH, '');
    return DEFAULT_API_BASE_URL + parsed!.pathname.slice(addressBase.length) + parsed!.search;
  }
  return value;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(value, 'http://placeholder.invalid');
    } catch {
      return null;
    }
  }
}
