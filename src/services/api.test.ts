import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { DEFAULT_API_BASE_URL } from '../config/settings';
import { paginated, makeExtension, makeOrganization, makeUser } from '../test/testUtils';

const JSON_HEADERS = { 'content-type': 'application/json' };

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = JSON_HEADERS,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('ApiService', () => {
  const fetchMock = vi.fn();
  const baseUrl = DEFAULT_API_BASE_URL;

  beforeEach(() => {
    localStorage.clear();
    api.setToken(null);
    api.setStoredUser(null);
    api.resetBaseUrl();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('defaults to the official TwextHub API base URL', () => {
    expect(api.getBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('uses the base URL configured via config.yml/env', () => {
    api.configure({ apiBaseUrl: 'https://hub.example.com/api/v1' });
    expect(api.getBaseUrl()).toBe('https://hub.example.com/api/v1');
  });

  it('falls back to the enforced default when the configured URL is invalid', () => {
    api.setBaseUrl('not a url');
    expect(api.getBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('resets to the enforced default', () => {
    api.setBaseUrl('https://hub.example.com/api/v1');
    api.resetBaseUrl();
    expect(api.getBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('resolves the public base against the page origin, for URLs that leave the page', () => {
    expect(api.getPublicBaseUrl()).toBe(`${window.location.origin}${DEFAULT_API_BASE_URL}`);
  });

  it('leaves an already absolute base alone in the public base', () => {
    api.configure({ apiBaseUrl: 'https://hub.example.com/api/v1' });
    expect(api.getPublicBaseUrl()).toBe('https://hub.example.com/api/v1');
  });

  it('GETs a JSON endpoint and parses the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ published: 12, pending: 3, authors: 5 }));
    await expect(api.getStats()).resolves.toEqual({ published: 12, pending: 3, authors: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/stats`,
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('serializes cursor and limit query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.getExtensions({ cursor: 'abc', limit: 6 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/extensions?cursor=abc&limit=6`);
  });

  it('searchExtensions sends the query parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.searchExtensions('gamepad', { limit: 12 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/search?query=gamepad&limit=12`);
  });

  it('URL-encodes namespace and id path segments', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeUser()));
    await api.getExtension('a/b', 'c d');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@a%2Fb/c%20d`);
  });

  it('attaches a Bearer authorization header when a token is present', async () => {
    api.setToken('tok-abc');
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.getExtensions();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/extensions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-abc' }),
      }),
    );
  });

  it('login POSTs JSON and persists token + user to localStorage', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'tok-123', user: makeUser(), session: { id: 's1' } }),
    );
    const res = await api.login({ namespace: 'kane', password: 'secret' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/sessions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ namespace: 'kane', password: 'secret' }),
      }),
    );
    expect(res.token).toBe('tok-123');
    expect(localStorage.getItem('twexthub_auth_token')).toBe('tok-123');
    expect(JSON.parse(localStorage.getItem('twexthub_auth_user')!)).toEqual(makeUser());
    expect(api.getToken()).toBe('tok-123');
  });

  it('surfaces an RFC 7807 problem+json payload as a typed ApiError', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Namespace already registered.',
      errors: [{ field: 'namespace', message: 'is taken' }],
    };
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(problem), {
          status: 422,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    await expect(api.signup({ namespace: 'kane', password: 'xxxx1234' })).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 422,
        problem: expect.objectContaining({ detail: 'Namespace already registered.' }),
      }),
    );
    await expect(api.signup({ namespace: 'kane', password: 'xxxx1234' })).rejects.toThrow(
      'Namespace already registered. (namespace: is taken)',
    );
  });

  it('throws ApiError with status 0 on network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.getStats()).rejects.toEqual(
      expect.objectContaining({ name: 'ApiError', status: 0 }),
    );
    await expect(api.getStats()).rejects.toThrow(/Unable to reach the TwextHub API/);
  });

  it('records terms acceptance on the account, and resolves undefined for 204', async () => {
    api.setStoredUser(makeUser());
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.acceptTerms(2)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/users/kane`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ termsAcceptedVersion: 2 }),
      }),
    );
  });

  it('logout revokes the session server-side then clears local credentials', async () => {
    api.setToken('tok-123');
    api.setStoredUser(makeUser());
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.logout();
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/sessions/current`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(api.getToken()).toBeNull();
    expect(localStorage.getItem('twexthub_auth_token')).toBeNull();
    expect(localStorage.getItem('twexthub_auth_user')).toBeNull();
  });

  it('getMe refreshes the stored user profile', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeUser({ role: 'admin' })));
    const me = await api.getMe();
    expect(api.getStoredUser()).toEqual(makeUser({ role: 'admin' }));
    expect(me.role).toBe('admin');
  });

  it('getVersion fetches a single version by SemVer or latest', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ version: '1.2.3', status: 'published' })),
    );
    await api.getVersion('kane', 'demo', '1.2.3');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/versions/1.2.3`);

    await api.getVersion('kane', 'demo', 'latest');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/@kane/demo/versions/latest`);
  });

  it('listVersionsForReview requests the pending moderation queue', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.listVersionsForReview({ cursor: 'abc' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/versions?status=pending&cursor=abc`);
  });

  it('reviewVersion PATCHes the version review endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'approved' }));
    await api.reviewVersion('kane', 'demo', '1.0.0', { status: 'approved' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/@kane/demo/versions/1.0.0`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
    );
  });

  it('updateUserRole PATCHes the user endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeUser({ namespace: 'ada', role: 'admin' })));
    await api.updateUserRole('ada', { role: 'admin' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/users/ada`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }),
    );
  });

  it('updateTerms and updatePrivacyPolicy PATCH the admin document endpoints', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ version: 3, body: '# Doc' })),
    );
    await api.updateTerms('# Terms');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/admin/terms`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ body: '# Terms' }) }),
    );

    await api.updatePrivacyPolicy('# Privacy');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/admin/privacy`);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ body: '# Privacy' }) }),
    );
  });

  it('createToken forwards the expiration window', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'tok-1', name: 'ci', scopes: ['publish'] }));
    await api.createToken({ name: 'ci', scopes: ['publish'], expiresInDays: 30 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/tokens`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'ci', scopes: ['publish'], expiresInDays: 30 }),
      }),
    );
  });

  it('getTrendingExtensions reads the trending endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([makeExtension({ id: 'hot' })])));
    const res = await api.getTrendingExtensions();
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/extensions/trending`);
    expect(res.data?.[0]?.id).toBe('hot');
  });

  it('getDistTags unwraps the tag-to-version map', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ latest: '1.2.0', next: '2.0.0-rc.1' }));
    await expect(api.getDistTags('kane', 'demo')).resolves.toEqual({
      latest: '1.2.0',
      next: '2.0.0-rc.1',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/tags`);
  });

  it('setDistTag and deleteDistTag target the encoded tag path', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.setDistTag('kane', 'demo', 'next', '1.0.0');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/tags/next`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ version: '1.0.0' }) }),
    );

    await api.deleteDistTag('kane', 'demo', 'next');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/@kane/demo/tags/next`);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('getExtensionOwners unwraps the data array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ namespace: 'ada', displayName: 'Ada' }] }));
    await expect(api.getExtensionOwners('kane', 'demo')).resolves.toEqual([
      { namespace: 'ada', displayName: 'Ada' },
    ]);
  });

  it('folds the snake_case owner rows the spec documents onto the camelCase shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            namespace: 'ada',
            display_name: 'Ada',
            role: 'admin',
            added_at: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    await expect(api.getExtensionOwners('kane', 'demo')).resolves.toEqual([
      { namespace: 'ada', displayName: 'Ada', role: 'admin', addedAt: '2026-01-01T00:00:00Z' },
    ]);
  });

  it('derives pagination from a root-relative _links.next', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [makeExtension()],
        _links: {
          self: '/api/v2/extensions',
          next: '/api/v2/extensions?limit=20&cursor=abc123',
          prev: null,
        },
      }),
    );
    const res = await api.getExtensions();
    expect(res.pagination).toEqual({ nextCursor: 'abc123', hasMore: true });
  });

  it('reports the end of the list when _links.next is null', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], _links: { self: '/api/v2/extensions', next: null, prev: null } }),
    );
    const res = await api.getExtensions();
    expect(res.pagination).toEqual({ nextCursor: null, hasMore: false });
  });

  it('addExtensionOwner and removeExtensionOwner use PUT and DELETE on the owner path', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.addExtensionOwner('kane', 'demo', 'ada');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/owners/ada`);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'PUT' }));

    await api.removeExtensionOwner('kane', 'demo', 'ada');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/@kane/demo/owners/ada`);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('getWebhooks unwraps the data array', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 1,
            url: 'https://ci.example.com/hook',
            events: ['version.published'],
            active: true,
          },
        ],
      }),
    );
    const hooks = await api.getWebhooks('kane', 'demo');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/webhooks`);
    expect(hooks[0].id).toBe(1);
  });

  it('createWebhook POSTs the payload and returns the one-time secret', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          id: 7,
          url: 'https://ci.example.com/hook',
          events: ['version.published', 'owners.changed'],
          active: true,
          secret: 'whsec_abc',
        },
        201,
      ),
    );
    const created = await api.createWebhook('kane', 'demo', {
      url: 'https://ci.example.com/hook',
      events: ['version.published', 'owners.changed'],
    });
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://ci.example.com/hook',
          events: ['version.published', 'owners.changed'],
        }),
      }),
    );
    expect(created.secret).toBe('whsec_abc');
  });

  it('deleteWebhook targets the numeric webhook id', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.deleteWebhook('kane', 'demo', 7);
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/webhooks/7`);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('createOrganization POSTs the namespace to the org collection', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeOrganization(), 201));
    const org = await api.createOrganization({ namespace: 'acme', displayName: 'Acme Inc' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ namespace: 'acme', displayName: 'Acme Inc' }),
      }),
    );
    expect(org.namespace).toBe('acme');
  });

  it('getOrganizations serializes cursor and limit', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.getOrganizations({ cursor: 'c1', limit: 24 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs?cursor=c1&limit=24`);
  });

  it('getOrganization URL-encodes the namespace', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeOrganization()));
    await api.getOrganization('a/b');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/a%2Fb`);
  });

  it('updateOrganization PATCHes the profile, and deleteOrganization removes it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeOrganization()));
    await api.updateOrganization('acme', { displayName: 'Acme', bio: null });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Acme', bio: null }),
      }),
    );

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.deleteOrganization('acme');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/orgs/acme`);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('getOrganizationOwners unwraps the data array', async () => {
    // The server writes this collection in camelCase, unlike the extension
    // owner rows, so the row is handed back as it arrived.
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            namespace: 'kane',
            displayName: 'Kane',
            avatarUrl: null,
            addedAt: '2026-01-05T00:00:00Z',
          },
        ],
      }),
    );
    const owners = await api.getOrganizationOwners('acme');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme/owners`);
    expect(owners[0]).toEqual({
      namespace: 'kane',
      displayName: 'Kane',
      avatarUrl: null,
      addedAt: '2026-01-05T00:00:00Z',
    });
  });

  it('adds and removes an owner with PUT and DELETE on the owner path', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.addOrganizationOwner('acme', 'ada');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme/owners/ada`);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'PUT' }));

    await api.removeOrganizationOwner('acme', 'ada');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/orgs/acme/owners/ada`);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('getOrganizationExtensions uses the organization listing, with paging', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.getOrganizationExtensions('acme', { cursor: 'c2' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme/extensions?cursor=c2`);
  });

  it('organization webhooks live beside the namespace rather than under an id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: 3, url: 'https://ci.example.com/hook', events: ['owners.changed'], active: true },
        ],
      }),
    );
    const hooks = await api.getOrganizationWebhooks('acme');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme/webhooks`);
    expect(hooks[0].id).toBe(3);

    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          id: 4,
          url: 'https://ci.example.com/hook',
          events: ['version.published'],
          active: true,
          secret: 'whsec_org',
        },
        201,
      ),
    );
    const created = await api.createOrganizationWebhook('acme', {
      url: 'https://ci.example.com/hook',
      events: ['version.published'],
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/orgs/acme/webhooks`);
    expect(created.secret).toBe('whsec_org');

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.deleteOrganizationWebhook('acme', 4);
    expect(fetchMock.mock.calls[2][0]).toBe(`${baseUrl}/orgs/acme/webhooks/4`);
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('organization image uploads send the raw bytes and answer with the profile', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(makeOrganization({ avatarUrl: '/orgs/acme/avatar?v=0123456789abcdef' })),
    );
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const updated = await api.uploadOrganizationImage('acme', 'avatar', file);
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/orgs/acme/avatar`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: file,
        headers: expect.objectContaining({ 'Content-Type': 'image/png' }),
      }),
    );
    expect(updated.avatarUrl).toBe('/orgs/acme/avatar?v=0123456789abcdef');

    fetchMock.mockResolvedValue(jsonResponse(makeOrganization({ avatarUrl: null })));
    const cleared = await api.deleteOrganizationImage('acme', 'avatar');
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/orgs/acme/avatar`);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    expect(cleared.avatarUrl).toBeNull();
  });

  it("getPendingExtensionOwnerInvites reads the caller's own inbox", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            namespace: 'acme',
            display_name: 'Acme Inc',
            kind: 'organization',
            created_at: '2026-02-01T00:00:00Z',
            invited_by: 'kane',
          },
        ],
      }),
    );
    const invites = await api.getPendingExtensionOwnerInvites('kane', 'demo');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/owners/pending`);
    expect(invites[0].kind).toBe('organization');
    expect(invites[0].invitedBy).toBe('kane');
  });

  it('acceptExtensionOwner POSTs to the accept half of the grant', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await api.acceptExtensionOwner('kane', 'demo', 'acme');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/owners/acme/accept`);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('deprecateVersion PATCHes a message, and sends null to clear', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          namespace: 'kane',
          id: 'demo',
          version: '1.0.0',
          status: 'deprecated',
          name: 'Demo',
          license: 'MIT',
          description: '',
          createdAt: '2026-01-01T00:00:00Z',
          deprecation: 'Use 2.x',
        }),
      ),
    );
    const res = await api.deprecateVersion('kane', 'demo', '1.0.0', 'Use 2.x');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/@kane/demo/versions/1.0.0`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ deprecationMessage: 'Use 2.x' }),
      }),
    );
    expect(res.status).toBe('deprecated');

    await api.deprecateVersion('kane', 'demo', '1.0.0', null);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ deprecationMessage: null }) }),
    );
  });

  it('getAuditLog serializes cursor and limit', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paginated([])));
    await api.getAuditLog({ cursor: 'c1', limit: 25 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/admin/audit?cursor=c1&limit=25`);
  });

  it('getUserQuota and setUserQuota hit the admin quota endpoint', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ namespace: 'ada', blobBytes: 1024, maxBlobBytes: null })),
    );
    await api.getUserQuota('ada');
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/admin/users/ada/quota`);

    await api.setUserQuota('ada', 500);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ maxBlobBytes: 500 }) }),
    );

    await api.setUserQuota('ada', null);
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ maxBlobBytes: null }) }),
    );
  });

  it('getNotifications surfaces the whole-mailbox unreadCount', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: '9',
            kind: 'review.approved',
            message: 'Approved',
            payload: {},
            read: false,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        unreadCount: 4,
        pagination: { nextCursor: null, hasMore: false },
      }),
    );
    const res = await api.getNotifications({ limit: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/notifications?limit=10`);
    expect(res.unreadCount).toBe(4);
    expect(res.data?.[0]?.kind).toBe('review.approved');
  });

  it('getNotifications sets unread=true and the cursor when filtering', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], unreadCount: 0, pagination: { nextCursor: null, hasMore: false } }),
    );
    await api.getNotifications({ unreadOnly: true, cursor: 'n1' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/notifications?unread=true&cursor=n1`);
  });

  it('markNotificationsRead returns the updated count and accepts ids or all', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ updated: 2 })));
    await expect(api.markNotificationsRead({ ids: ['1', '2'] })).resolves.toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/notifications`);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ids: [1, 2] }),
      }),
    );

    await api.markNotificationsRead({ all: true });
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ all: true }) }),
    );
  });
});
