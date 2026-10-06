import { describe, expect, it } from 'vitest';
import {
  isOwnImageUrl,
  looksLikeOwnUploadUrl,
  profileImagePath,
  toSameOriginImageUrl,
} from './profile-image';

describe('looksLikeOwnUploadUrl', () => {
  it('accepts an upload on either kind with its version stamp', () => {
    expect(looksLikeOwnUploadUrl('/v2/users/kane/avatar?v=0123456789abcdef')).toBe(true);
    expect(
      looksLikeOwnUploadUrl('https://reg.example/api/v2/users/kane/banner?v=abcdef0123456789'),
    ).toBe(true);
  });

  it('accepts an organization upload on either kind', () => {
    expect(looksLikeOwnUploadUrl('/v2/orgs/acme/avatar?v=0123456789abcdef')).toBe(true);
    expect(
      looksLikeOwnUploadUrl('https://reg.example/api/v2/orgs/acme/banner?v=abcdef0123456789'),
    ).toBe(true);
  });

  it('rejects a link, a missing version, and a foreign path shape', () => {
    expect(looksLikeOwnUploadUrl('https://cdn.example/users/kane/avatar.png')).toBe(false);
    expect(looksLikeOwnUploadUrl('/v2/users/kane/avatar')).toBe(false);
    expect(looksLikeOwnUploadUrl(null)).toBe(false);
  });
});

describe('isOwnImageUrl', () => {
  it('recognises an upload of the collection being managed', () => {
    expect(isOwnImageUrl('/v2/users/kane/avatar?v=0123456789abcdef', 'kane', 'avatar')).toBe(true);
    expect(
      isOwnImageUrl(
        'https://api.test/v2/orgs/acme/banner?v=0123456789abcdef',
        'acme',
        'banner',
        true,
      ),
    ).toBe(true);
  });

  it('keeps the two collections apart when a namespace is both', () => {
    // `acme` is an account and an organization, and each has its own files, so
    // one namespace's address is not the other's.
    const url = '/v2/users/acme/avatar?v=0123456789abcdef';
    expect(isOwnImageUrl(url, 'acme', 'avatar', true)).toBe(false);
    expect(isOwnImageUrl('/v2/orgs/acme/avatar?v=0123456789abcdef', 'acme', 'avatar')).toBe(false);
  });

  it('rejects another namespace, another kind, and a missing version', () => {
    expect(isOwnImageUrl('/v2/users/kane/avatar?v=0123456789abcdef', 'ada', 'avatar')).toBe(false);
    expect(isOwnImageUrl('/v2/users/kane/avatar?v=0123456789abcdef', 'kane', 'banner')).toBe(false);
    expect(isOwnImageUrl('/v2/users/kane/avatar', 'kane', 'avatar')).toBe(false);
  });
});

describe('profileImagePath', () => {
  it('names the collection a namespace of that sort uploads into', () => {
    expect(profileImagePath('kane', 'avatar')).toBe('users/kane/avatar');
    expect(profileImagePath('acme', 'banner', true)).toBe('orgs/acme/banner');
  });
});

describe('toSameOriginImageUrl', () => {
  it('passes through no image and an already same-origin address', () => {
    expect(toSameOriginImageUrl(null, 'https://api.test/v2')).toBeNull();
    expect(toSameOriginImageUrl(undefined, 'https://api.test/v2')).toBeUndefined();
    expect(toSameOriginImageUrl('/api/v2/users/kane/avatar?v=0123456789abcdef', '/api/v2')).toBe(
      '/api/v2/users/kane/avatar?v=0123456789abcdef',
    );
  });

  it('rewrites the API origin onto the public prefix when the base is absolute', () => {
    const base = 'https://api.test/v2';
    expect(
      toSameOriginImageUrl('https://api.test/v2/users/kane/avatar?v=0123456789abcdef', base),
    ).toBe('/api/v2/users/kane/avatar?v=0123456789abcdef');
    expect(toSameOriginImageUrl('/v2/users/kane/avatar?v=0123456789abcdef', base)).toBe(
      '/api/v2/users/kane/avatar?v=0123456789abcdef',
    );
    expect(
      toSameOriginImageUrl('https://api.test/api/v2/users/kane/avatar?v=0123456789abcdef', base),
    ).toBe('/api/v2/users/kane/avatar?v=0123456789abcdef');
  });

  it('leaves an address on the API origin outside the base path alone', () => {
    expect(toSameOriginImageUrl('https://api.test/files/kane.png', 'https://api.test/v2')).toBe(
      'https://api.test/files/kane.png',
    );
  });

  it('leaves a linked address on a foreign host alone', () => {
    expect(
      toSameOriginImageUrl('https://cdn.example/users/kane/avatar.png', 'https://api.test/v2'),
    ).toBe('https://cdn.example/users/kane/avatar.png');
  });

  it('serves an upload through the site even when the base is the public prefix', () => {
    expect(
      toSameOriginImageUrl(
        'https://reg.example/api/v2/users/kane/avatar?v=0123456789abcdef',
        '/api/v2',
      ),
    ).toBe('/api/v2/users/kane/avatar?v=0123456789abcdef');
  });

  it('reads the API base back off an upload address when the page base is relative', () => {
    expect(
      toSameOriginImageUrl(
        'http://localhost:3000/v2/users/kane/avatar?v=f2b793f29742e826',
        '/api/v2',
      ),
    ).toBe('/api/v2/users/kane/avatar?v=f2b793f29742e826');
    expect(
      toSameOriginImageUrl(
        'https://reg.example/api/v2/users/kane/avatar?v=0123456789abcdef',
        '/api/v2',
      ),
    ).toBe('/api/v2/users/kane/avatar?v=0123456789abcdef');
  });

  it('reads the base back off an organization upload address too', () => {
    expect(
      toSameOriginImageUrl(
        'http://localhost:3000/v2/orgs/acme/avatar?v=f2b793f29742e826',
        '/api/v2',
      ),
    ).toBe('/api/v2/orgs/acme/avatar?v=f2b793f29742e826');
  });

  it('keeps a foreign upload address when an absolute base is set', () => {
    expect(
      toSameOriginImageUrl(
        'https://other.example/api/v2/users/kane/avatar?v=0123456789abcdef',
        'https://api.test/v2',
      ),
    ).toBe('https://other.example/api/v2/users/kane/avatar?v=0123456789abcdef');
  });
});
