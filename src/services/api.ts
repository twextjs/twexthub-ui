import { DEFAULT_API_BASE_URL, isValidApiBaseUrl, normalizeApiBaseUrl } from '../config/settings';
import {
  AuditEntry,
  AuthSessionResponse,
  AutomationToken,
  CreateOrganizationPayload,
  CreateWebhookPayload,
  DistTags,
  Extension,
  ExtensionSummary,
  ExtensionOwner,
  ExtensionOwnerInvite,
  InstanceStats,
  MarkNotificationsReadResult,
  Meta,
  NotificationList,
  Organization,
  OrganizationOwner,
  PaginatedList,
  PendingVersion,
  PrivacyDoc,
  ProblemDetails,
  Quota,
  ReviewVersionPayload,
  ServerConfig,
  ServerConfigUpdate,
  ServerSetting,
  Session,
  TermsDoc,
  UpdateOrganizationPayload,
  UpdateUserPayload,
  User,
  UserRole,
  VersionInfo,
  Webhook,
  WebhookCreated,
} from '../types/api';

const STORAGE_KEY_TOKEN = 'twexthub_auth_token';
const STORAGE_KEY_USER = 'twexthub_auth_user';

/** snake_case spellings some endpoints answer with, mapped to the camelCase the client reads. */
const SNAKE_FIELDS: Record<string, string> = {
  display_name: 'displayName',
  added_at: 'addedAt',
  created_at: 'createdAt',
  invited_by: 'invitedBy',
  last_delivery_status: 'lastDeliveryStatus',
  last_delivery_at: 'lastDeliveryAt',
};

export class ApiError extends Error {
  status: number;
  problem?: ProblemDetails;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

class ApiService {
  private token: string | null;
  private baseUrl: string = DEFAULT_API_BASE_URL;

  constructor() {
    // Purge legacy manual server URL overrides; URL is configured via config.yml / env only
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('twexthub_api_base_url');
    }
    this.token =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TOKEN) : null;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * The base as an absolute URL, for anything that leaves the page: a copied
   * install command, a Markdown badge, a feed advertised to readers. The
   * configured base is normally root-relative, which resolves against whatever
   * host the reader happens to be on — `turbowarp.org` handed `/api/v2/...`
   * would look for the API on TurboWarp's own origin. Same-origin calls stay on
   * `getBaseUrl()`.
   */
  getPublicBaseUrl(): string {
    const base = this.getBaseUrl();
    if (/^https?:\/\//i.test(base)) return base;
    if (typeof window === 'undefined' || !window.location?.origin) return base;
    return `${window.location.origin}${base.startsWith('/') ? base : `/${base}`}`;
  }

  configure(config: { apiBaseUrl?: string }) {
    if (config.apiBaseUrl && isValidApiBaseUrl(config.apiBaseUrl)) {
      this.baseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
    } else {
      this.baseUrl = DEFAULT_API_BASE_URL;
    }
  }

  setBaseUrl(url: string) {
    this.configure({ apiBaseUrl: url });
  }

  resetBaseUrl() {
    this.baseUrl = DEFAULT_API_BASE_URL;
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    }
  }

  getStoredUser(): User | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setStoredUser(user: User | null) {
    if (typeof localStorage === 'undefined') return;
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : 'Network request failed';
      throw new ApiError(`Unable to reach the TwextHub API at ${baseUrl}: ${msg}`, 0);
    }

    // 204 No Content has no body
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson =
      contentType.includes('application/json') || contentType.includes('application/problem+json');

    if (!response.ok) {
      let problem: ProblemDetails | undefined;
      let plainMessage = `Request failed with status ${response.status} (${response.statusText})`;

      if (isJson) {
        try {
          const parsed = await response.json();
          problem = parsed as ProblemDetails;
          if (problem.detail) {
            plainMessage = problem.detail;
          } else if (problem.title) {
            plainMessage = problem.title;
          }
          if (problem.errors && problem.errors.length > 0) {
            const fieldErrors = problem.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
            plainMessage = `${plainMessage} (${fieldErrors})`;
          }
        } catch {
          // ignore parse error
        }
      } else {
        const text = await response.text().catch(() => '');
        if (text) {
          plainMessage = text;
        }
      }

      throw new ApiError(plainMessage, response.status, problem);
    }

    if (isJson) {
      return this.withPagination(await response.json()) as T;
    }

    const text = await response.text();
    return text as unknown as T;
  }

  /**
   * List responses carry `_links` (self/next/prev), while the app pages with a
   * cursor. Derive the `pagination` shape the UI expects from `_links.next`:
   * `nextCursor` is the `cursor` inside the next-page URL, and `hasMore` is
   * simply whether there is a next page.
   *
   * The link may be absolute or root-relative (the server rebuilds the request
   * URL, which keeps the path but not the origin), so it is resolved against a
   * placeholder base: only the query string matters here.
   */
  private withPagination(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const record = body as Record<string, unknown>;
    if (!('_links' in record) || 'pagination' in record) return body;
    const links = record._links as { next?: string | null } | null;
    const next = typeof links?.next === 'string' && links.next.length > 0 ? links.next : null;
    let nextCursor: string | null = null;
    if (next) {
      try {
        nextCursor = new URL(next, 'http://twexthub.invalid').searchParams.get('cursor');
      } catch {
        nextCursor = null;
      }
    }
    return { ...record, pagination: { nextCursor, hasMore: next !== null } };
  }

  /**
   * The owners and webhooks endpoints answer with rows taken straight from the
   * database, so those arrive snake_case while the rest of the API is
   * camelCase. Fold the spelling the rest of the client reads onto them; a row
   * that is already camelCase (what the spec documents for webhooks) passes
   * through untouched.
   */
  private normalizeRow<T>(row: unknown): T {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row as T;
    const source = row as Record<string, unknown>;
    const out: Record<string, unknown> = { ...source };
    for (const [snake, camel] of Object.entries(SNAKE_FIELDS)) {
      if (snake in out && !(camel in out)) {
        out[camel] = out[snake];
        delete out[snake];
      }
    }
    return out as T;
  }

  private normalizeRows<T>(rows: unknown): T[] {
    if (!Array.isArray(rows)) return rows as T[];
    return rows.map((row) => this.normalizeRow<T>(row));
  }

  // --- Public Registry & Info Endpoints ---

  async getStats(): Promise<InstanceStats> {
    return this.request<InstanceStats>('/stats');
  }

  async getMeta(): Promise<Meta> {
    return this.request<Meta>('/meta');
  }

  async getExtensions(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<ExtensionSummary>> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<ExtensionSummary>>(`/extensions${qs ? `?${qs}` : ''}`);
  }

  async searchExtensions(
    searchQuery: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<PaginatedList<ExtensionSummary>> {
    const query = new URLSearchParams();
    if (searchQuery) query.set('query', searchQuery);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<ExtensionSummary>>(`/search${qs ? `?${qs}` : ''}`);
  }

  async getExtension(namespace: string, id: string): Promise<Extension> {
    return this.request<Extension>(`/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}`);
  }

  async getTrendingExtensions(): Promise<PaginatedList<ExtensionSummary>> {
    return this.request<PaginatedList<ExtensionSummary>>('/extensions/trending');
  }

  // --- Dist-tags, Owners & Webhooks (owner/admin) ---

  /** Tag name to version. `latest` is reserved and implicit. */
  async getDistTags(namespace: string, id: string): Promise<DistTags> {
    return this.request<DistTags>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/tags`,
    );
  }

  /** Points a dist-tag at an already-published version. */
  async setDistTag(namespace: string, id: string, tag: string, version: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ version }),
      },
    );
  }

  async deleteDistTag(namespace: string, id: string, tag: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' },
    );
  }

  async getExtensionOwners(namespace: string, id: string): Promise<ExtensionOwner[]> {
    const res = await this.request<{ data: ExtensionOwner[] }>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/owners`,
    );
    return this.normalizeRows<ExtensionOwner>(res.data);
  }

  async addExtensionOwner(namespace: string, id: string, ownerNamespace: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/owners/${encodeURIComponent(ownerNamespace)}`,
      { method: 'PUT' },
    );
  }

  /**
   * The invitations this caller can accept for an extension: the ones addressed
   * to their own account, plus any addressed to an organization they own. An
   * organization holds no inbox of its own, so an account acting for one has to
   * find them here.
   */
  async getPendingExtensionOwnerInvites(
    namespace: string,
    id: string,
  ): Promise<ExtensionOwnerInvite[]> {
    const res = await this.request<{ data: ExtensionOwnerInvite[] }>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/owners/pending`,
    );
    return this.normalizeRows<ExtensionOwnerInvite>(res.data);
  }

  /**
   * The second half of a co-ownership grant. An account accepts its own
   * invitation; any account on an invited organization's owner list may accept
   * for the whole organization, and one accepting speaks for the rest.
   */
  async acceptExtensionOwner(namespace: string, id: string, ownerNamespace: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/owners/${encodeURIComponent(ownerNamespace)}/accept`,
      { method: 'POST' },
    );
  }

  /**
   * Withdraws a pending invitation, or removes an accepted owner; the server
   * checks the invitation first, so one call covers both directions.
   */
  async removeExtensionOwner(namespace: string, id: string, ownerNamespace: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/owners/${encodeURIComponent(ownerNamespace)}`,
      { method: 'DELETE' },
    );
  }

  async getWebhooks(namespace: string, id: string): Promise<Webhook[]> {
    const res = await this.request<{ data: Webhook[] }>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/webhooks`,
    );
    return this.normalizeRows<Webhook>(res.data);
  }

  /** The returned secret is shown once and cannot be recovered. */
  async createWebhook(
    namespace: string,
    id: string,
    payload: CreateWebhookPayload,
  ): Promise<WebhookCreated> {
    const created = await this.request<WebhookCreated>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/webhooks`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    return this.normalizeRow<WebhookCreated>(created);
  }

  async deleteWebhook(namespace: string, id: string, webhookId: number): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/webhooks/${webhookId}`,
      { method: 'DELETE' },
    );
  }

  /** A non-null message marks the version deprecated; `null` clears it. */
  async deprecateVersion(
    namespace: string,
    id: string,
    version: string,
    message: string | null,
  ): Promise<VersionInfo> {
    return this.request<VersionInfo>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ deprecationMessage: message }),
      },
    );
  }

  async getTerms(): Promise<TermsDoc> {
    return this.request<TermsDoc>('/terms');
  }

  async getPrivacy(): Promise<PrivacyDoc> {
    return this.request<PrivacyDoc>('/privacy');
  }

  async getUsers(params?: { cursor?: string; limit?: number }): Promise<PaginatedList<User>> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<User>>(`/users${qs ? `?${qs}` : ''}`);
  }

  async getUser(namespace: string): Promise<User> {
    return this.request<User>(`/users/${encodeURIComponent(namespace)}`);
  }

  // --- Organizations ---

  /**
   * An organization is a pseudo-account: it owns a namespace, a profile and an
   * extension collection, but has no password and cannot sign in. The caller
   * becomes its first owner, so it can be changed afterwards at all.
   *
   * The namespace is shared with accounts, so a name already in use is a `409`,
   * and creation is rate limited like a signup and needs the current Terms of
   * Service accepted.
   */
  async createOrganization(payload: CreateOrganizationPayload): Promise<Organization> {
    return this.request<Organization>('/orgs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getOrganizations(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<Organization>> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<Organization>>(`/orgs${qs ? `?${qs}` : ''}`);
  }

  async getOrganization(namespace: string): Promise<Organization> {
    return this.request<Organization>(`/orgs/${encodeURIComponent(namespace)}`);
  }

  /** Only the profile fields exist here; members change through the owner list. */
  async updateOrganization(
    namespace: string,
    data: UpdateOrganizationPayload,
  ): Promise<Organization> {
    return this.request<Organization>(`/orgs/${encodeURIComponent(namespace)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /** Cascades to every extension, version, image and webhook under the namespace. */
  async deleteOrganization(namespace: string): Promise<void> {
    await this.request<void>(`/orgs/${encodeURIComponent(namespace)}`, { method: 'DELETE' });
  }

  async getOrganizationOwners(namespace: string): Promise<OrganizationOwner[]> {
    const res = await this.request<{ data: OrganizationOwner[] }>(
      `/orgs/${encodeURIComponent(namespace)}/owners`,
    );
    return this.normalizeRows<OrganizationOwner>(res.data);
  }

  /** Idempotent: an account that is already an owner is a `204`, not an error. */
  async addOrganizationOwner(namespace: string, ownerNamespace: string): Promise<void> {
    await this.request<void>(
      `/orgs/${encodeURIComponent(namespace)}/owners/${encodeURIComponent(ownerNamespace)}`,
      { method: 'PUT' },
    );
  }

  /** The last owner cannot be removed: an organization nobody owns has no way back. */
  async removeOrganizationOwner(namespace: string, ownerNamespace: string): Promise<void> {
    await this.request<void>(
      `/orgs/${encodeURIComponent(namespace)}/owners/${encodeURIComponent(ownerNamespace)}`,
      { method: 'DELETE' },
    );
  }

  /**
   * The registry listing scoped to the organization. An owner of it sees its
   * private extensions; everyone else sees only the public ones.
   */
  async getOrganizationExtensions(
    namespace: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<PaginatedList<ExtensionSummary>> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<ExtensionSummary>>(
      `/orgs/${encodeURIComponent(namespace)}/extensions${qs ? `?${qs}` : ''}`,
    );
  }

  /**
   * A webhook on an organization watches every extension in its namespace
   * instead of one `id`. The per-extension collection is separate and unaffected:
   * an id belonging to one of those is a `404` here.
   */
  async getOrganizationWebhooks(namespace: string): Promise<Webhook[]> {
    const res = await this.request<{ data: Webhook[] }>(
      `/orgs/${encodeURIComponent(namespace)}/webhooks`,
    );
    return this.normalizeRows<Webhook>(res.data);
  }

  async createOrganizationWebhook(
    namespace: string,
    payload: CreateWebhookPayload,
  ): Promise<WebhookCreated> {
    const created = await this.request<WebhookCreated>(
      `/orgs/${encodeURIComponent(namespace)}/webhooks`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    return this.normalizeRow<WebhookCreated>(created);
  }

  async deleteOrganizationWebhook(namespace: string, webhookId: number): Promise<void> {
    await this.request<void>(`/orgs/${encodeURIComponent(namespace)}/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Uploads an organization's avatar or banner. Same raw-bytes body and same
   * limits as for an account; the response is the whole updated organization,
   * which keeps the form in step with the new canonical image URL.
   */
  async uploadOrganizationImage(
    namespace: string,
    kind: 'avatar' | 'banner',
    file: Blob,
    contentType = file.type,
  ): Promise<Organization> {
    return this.request<Organization>(`/orgs/${encodeURIComponent(namespace)}/${kind}`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
    });
  }

  async deleteOrganizationImage(
    namespace: string,
    kind: 'avatar' | 'banner',
  ): Promise<Organization> {
    return this.request<Organization>(`/orgs/${encodeURIComponent(namespace)}/${kind}`, {
      method: 'DELETE',
    });
  }

  // --- Auth Endpoints ---

  // Signing in is creating a session (`POST /sessions`): the response carries
  // the session, its owner, and the one-time bearer token.
  async login(credentials: { namespace: string; password: string }): Promise<AuthSessionResponse> {
    const res = await this.request<AuthSessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(res.token);
    this.setStoredUser(res.user);
    return res;
  }

  // Creating the account and signing in are the same act (`POST /users`).
  async signup(payload: {
    namespace: string;
    password: string;
    displayName?: string;
  }): Promise<AuthSessionResponse> {
    const res = await this.request<AuthSessionResponse>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.setToken(res.token);
    this.setStoredUser(res.user);
    return res;
  }

  async logout(): Promise<void> {
    try {
      if (this.token) {
        // `current` is the session that authenticated the request, so the
        // client can sign itself out without having kept the session's id.
        await this.request<void>('/sessions/current', { method: 'DELETE' });
      }
    } finally {
      this.setToken(null);
      this.setStoredUser(null);
    }
  }

  // GET /me - returns the caller's own authenticated account
  async getMe(): Promise<User> {
    const me = await this.request<User>('/me');
    this.setStoredUser(me);
    return me;
  }

  // --- Authenticated User Operations ---

  /**
   * Acceptance is recorded on the account itself: a PATCH of
   * `termsAcceptedVersion` carrying nothing else, since the spec does not let
   * an acceptance travel alongside any other edit.
   */
  async acceptTerms(version: number): Promise<void> {
    const current = this.getStoredUser();
    if (!current) {
      throw new ApiError('No signed-in account to record the terms acceptance for', 401);
    }
    await this.request<void>(`/users/${encodeURIComponent(current.namespace)}`, {
      method: 'PATCH',
      body: JSON.stringify({ termsAcceptedVersion: version }),
    });
    current.termsAcceptedVersion = version;
    this.setStoredUser(current);
  }

  async updateUser(namespace: string, data: UpdateUserPayload): Promise<User> {
    const updated = await this.request<User>(`/users/${encodeURIComponent(namespace)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    const current = this.getStoredUser();
    if (current && current.namespace === namespace) {
      this.setStoredUser({ ...current, ...updated });
    }
    return updated;
  }

  // --- Profile image uploads ---

  /**
   * Uploads an avatar or banner. The body is the file itself rather than a
   * multipart form, so the Content-Type has to be set explicitly: `request`
   * only defaults it for string bodies, and the API sniffs the bytes anyway.
   *
   * The response is the whole updated user, which keeps the auth store and the
   * top-bar profile in step with the new canonical image URL.
   */
  async uploadProfileImage(
    namespace: string,
    kind: 'avatar' | 'banner',
    file: Blob,
    contentType = file.type,
  ): Promise<User> {
    const updated = await this.request<User>(`/users/${encodeURIComponent(namespace)}/${kind}`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
    });
    this.syncStoredUser(updated);
    return updated;
  }

  async deleteProfileImage(namespace: string, kind: 'avatar' | 'banner'): Promise<User> {
    const updated = await this.request<User>(`/users/${encodeURIComponent(namespace)}/${kind}`, {
      method: 'DELETE',
    });
    this.syncStoredUser(updated);
    return updated;
  }

  /** Keeps the locally stored user in step with a server-authoritative copy. */
  private syncStoredUser(updated: User) {
    const current = this.getStoredUser();
    if (current && current.namespace === updated.namespace) {
      this.setStoredUser({ ...current, ...updated });
    }
  }

  async deleteUser(namespace: string): Promise<void> {
    await this.request<void>(`/users/${encodeURIComponent(namespace)}`, {
      method: 'DELETE',
    });
    const current = this.getStoredUser();
    if (current && current.namespace === namespace) {
      this.setToken(null);
      this.setStoredUser(null);
    }
  }

  async getSessions(params?: {
    namespace?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<Session>> {
    const query = new URLSearchParams();
    if (params?.namespace) query.set('namespace', params.namespace);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<Session>>(`/sessions${qs ? `?${qs}` : ''}`);
  }

  async revokeSession(id: string): Promise<void> {
    await this.request<void>(`/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async getTokens(params?: {
    namespace?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<AutomationToken>> {
    const query = new URLSearchParams();
    if (params?.namespace) query.set('namespace', params.namespace);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<AutomationToken>>(`/tokens${qs ? `?${qs}` : ''}`);
  }

  async createToken(data: {
    name: string;
    scopes: string[];
    expiresInDays?: number;
  }): Promise<AutomationToken> {
    return this.request<AutomationToken>('/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateToken(
    id: string,
    data: { name?: string; scopes?: string[] },
  ): Promise<AutomationToken> {
    return this.request<AutomationToken>(`/tokens/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteToken(id: string): Promise<void> {
    await this.request<void>(`/tokens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // --- Version & Publishing Operations ---

  // `version` may be a literal SemVer string or the literal `latest`.
  async getVersion(namespace: string, id: string, version: string): Promise<VersionInfo> {
    return this.request<VersionInfo>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
    );
  }

  async deleteExtension(namespace: string, id: string): Promise<void> {
    await this.request<void>(`/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async yankVersion(namespace: string, id: string, version: string): Promise<void> {
    await this.request<void>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async downloadVersion(namespace: string, id: string, version: string): Promise<string> {
    return this.request<string>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`,
      {
        headers: {
          Accept: 'text/javascript, application/javascript, */*',
        },
      },
    );
  }

  // --- Admin Moderation & Administration Endpoints ---

  async listVersionsForReview(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<PendingVersion>> {
    const query = new URLSearchParams();
    query.set('status', 'pending');
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.request<PaginatedList<PendingVersion>>(`/versions?${query.toString()}`);
  }

  async reviewVersion(
    namespace: string,
    id: string,
    version: string,
    payload: ReviewVersionPayload,
  ): Promise<VersionInfo> {
    return this.request<VersionInfo>(
      `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  }

  async updateUserRole(namespace: string, payload: { role?: UserRole }): Promise<User> {
    return this.request<User>(`/users/${encodeURIComponent(namespace)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async updateTerms(body: string): Promise<TermsDoc> {
    return this.request<TermsDoc>('/admin/terms', {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  async updatePrivacyPolicy(body: string): Promise<PrivacyDoc> {
    return this.request<PrivacyDoc>('/admin/privacy', {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  /** Append-only trail of privileged actions, newest first. */
  async getAuditLog(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedList<AuditEntry>> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<PaginatedList<AuditEntry>>(`/admin/audit${qs ? `?${qs}` : ''}`);
  }

  async getUserQuota(namespace: string): Promise<Quota> {
    return this.request<Quota>(`/admin/users/${encodeURIComponent(namespace)}/quota`);
  }

  /** `null` resets the account to the instance default. */
  async setUserQuota(namespace: string, maxBlobBytes: number | null): Promise<Quota> {
    return this.request<Quota>(`/admin/users/${encodeURIComponent(namespace)}/quota`, {
      method: 'PATCH',
      body: JSON.stringify({ maxBlobBytes }),
    });
  }

  /**
   * The settings an admin is allowed to change, plus whether the file can hold
   * a change at all. `editable: false` means the file sits inside the container
   * rather than on a volume, so the interface should explain rather than offer
   * a form that would quietly do nothing.
   */
  async getServerConfig(): Promise<ServerConfig> {
    return this.request<ServerConfig>('/admin/config');
  }

  /**
   * Writes the given dotted settings to the configuration file and to the
   * running instance. Throws a 409 `ApiError` when the file is not persistent.
   */
  async updateServerConfig(
    settings: Record<string, ServerSetting['value']>,
  ): Promise<ServerConfigUpdate> {
    return this.request<ServerConfigUpdate>('/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  }

  /** Fans out to every existing account at insert time. Cannot be recalled. */
  async broadcastNotification(message: string): Promise<number> {
    const res = await this.request<{ created: number }>('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    return res.created;
  }

  /**
   * Prometheus text exposition. Fetched through the authenticated client
   * because a plain link or `fetch` cannot attach the bearer token, which is
   * what makes a direct navigation return 401.
   */
  async getAdminMetrics(): Promise<string> {
    return this.request<string>('/admin/metrics', {
      headers: {
        Accept: 'text/plain, */*',
      },
    });
  }

  /** Atom feed of newly published versions. */
  getAtomFeedUrl(): string {
    return `${this.getPublicBaseUrl()}/feed.atom`;
  }

  // --- Notifications ---

  /** `unreadCount` covers the whole mailbox, so one call can drive a badge. */
  async getNotifications(params?: {
    cursor?: string;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationList> {
    const query = new URLSearchParams();
    if (params?.unreadOnly) query.set('unread', 'true');
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<NotificationList>(`/notifications${qs ? `?${qs}` : ''}`);
  }

  /**
   * Read state is patched onto the collection: send either `ids` (up to 100)
   * or `all: true`, never both. Idempotent; `updated` counts only rows that
   * were not already read. Ids are digits-only strings, and the spec types the
   * array as integers, so they are sent as numbers.
   */
  async markNotificationsRead(payload: { ids: string[] } | { all: true }): Promise<number> {
    const body =
      'ids' in payload ? { ids: payload.ids.map((id) => Number(id)) } : { all: true as const };
    const res = await this.request<MarkNotificationsReadResult>('/notifications', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res.updated;
  }
}

export const api = new ApiService();
