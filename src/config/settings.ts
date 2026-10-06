/**
 * The browser only ever talks to its own origin: `server.js` (production) and
 * the Vite dev server both forward `/api/v2` to the configured upstream, so
 * "the API" is wherever this page is served from. An absolute URL remains a
 * valid override for static hosts that have no proxy (see `VITE_TWEXTHUB_API_URL`).
 */
export const DEFAULT_API_BASE_URL = '/api/v2';

export interface AppConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    TWEXTHUB_CONFIG?: { apiBaseUrl?: unknown };
  }
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Remote APIs must use HTTPS so bearer tokens never travel in cleartext and
 * to avoid mixed-content failures on HTTPS-hosted pages. Plain HTTP is only
 * accepted for loopback development URLs such as http://localhost:8080/api/v2.
 *
 * A root-relative path (`/api/v2`) is accepted too: it keeps every call on the
 * page's own origin, where a server-side proxy forwards it to the real API.
 * That is the default now, so `localhost` in operator config never has to mean
 * the *client's* localhost again.
 */
export function isValidApiBaseUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//') && !/\s/.test(trimmed);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeApiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function resolveApiBaseUrl(): string {
  const buildUrl = import.meta.env.VITE_TWEXTHUB_API_URL as string | undefined;
  const runtimeUrl = typeof window !== 'undefined' ? window.TWEXTHUB_CONFIG?.apiBaseUrl : undefined;

  const candidates: Array<{ value: string; source: string }> = [
    { value: DEFAULT_API_BASE_URL, source: 'default' },
  ];
  const configured: Array<{ raw: unknown; source: string }> = [
    { raw: buildUrl, source: 'build env (VITE_TWEXTHUB_API_URL)' },
    { raw: runtimeUrl, source: 'server (config file / TWEXTHUB_API_URL)' },
  ];

  for (const candidate of configured) {
    if (typeof candidate.raw !== 'string' || !candidate.raw.trim()) continue;
    if (isValidApiBaseUrl(candidate.raw)) {
      candidates.push({ value: normalizeApiBaseUrl(candidate.raw), source: candidate.source });
    } else {
      console.warn(`Ignoring invalid API base URL from ${candidate.source}: "${candidate.raw}".`);
    }
  }

  const chosen = candidates[candidates.length - 1];
  if (chosen.source !== 'default') {
    console.info(`TwextHub API base URL: ${chosen.value} (${chosen.source}).`);
  }
  return chosen.value;
}

export function getAppConfig(): AppConfig {
  return { apiBaseUrl: resolveApiBaseUrl() };
}
