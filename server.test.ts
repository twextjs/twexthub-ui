import { describe, expect, it, vi } from 'vitest';

// Importing server.js starts an HTTP server; keep the side effects out of tests.
vi.mock('node:http', () => {
  const createServer = vi.fn(() => ({ listen: vi.fn() }));
  const globalAgent = { destroy: vi.fn() };
  return { createServer, globalAgent, default: { createServer, globalAgent } };
});

import { isWithinUpstreamBase, proxyTargetFor, readApiBaseUrlFromYaml, shutdown } from './server.js';

describe('readApiBaseUrlFromYaml', () => {
  it('reads unquoted values', () => {
    expect(readApiBaseUrlFromYaml('apiBaseUrl: https://registry.example.com/api/v2')).toBe(
      'https://registry.example.com/api/v2',
    );
  });

  it('reads double-quoted values without the surrounding quotes', () => {
    expect(readApiBaseUrlFromYaml('apiBaseUrl: "http://localhost:8080/api/v2"')).toBe(
      'http://localhost:8080/api/v2',
    );
  });

  it('reads single-quoted values without the surrounding quotes', () => {
    expect(readApiBaseUrlFromYaml("apiBaseUrl: 'http://localhost:8080/api/v2'")).toBe(
      'http://localhost:8080/api/v2',
    );
  });

  it('strips trailing comments and whitespace before unquoting', () => {
    expect(readApiBaseUrlFromYaml('apiBaseUrl:  "https://a.example/api/v2"  # the registry')).toBe(
      'https://a.example/api/v2',
    );
  });

  it('returns null for missing or mismatched quotes', () => {
    expect(readApiBaseUrlFromYaml('apiBaseUrl:\nother: value')).toBeNull();
    expect(readApiBaseUrlFromYaml('apiBaseUrl: "https://a.example/api/v2')).toBeNull();
  });

  it('ignores other keys and comments', () => {
    expect(readApiBaseUrlFromYaml('# apiBaseUrl: https://ignored/api/v2\nfoo: bar')).toBeNull();
  });
});

describe('proxyTargetFor', () => {
  it('forwards the public API path onto the upstream base, keeping the query', () => {
    expect(
      proxyTargetFor('/api/v2/extensions', '?q=pen&page=2', 'https://registry.example/api/v2'),
    ).toBe('https://registry.example/api/v2/extensions?q=pen&page=2');
  });

  it('maps the bare public root onto the upstream root', () => {
    expect(proxyTargetFor('/api/v2', '', 'http://localhost:8080/api/v2')).toBe(
      'http://localhost:8080/api/v2',
    );
  });

  it('strips the public prefix, never the upstream one', () => {
    expect(proxyTargetFor('/api/v2/a/b', '?x=1', 'http://localhost:8080/api/v2')).toBe(
      'http://localhost:8080/api/v2/a/b?x=1',
    );
  });
});

describe('isWithinUpstreamBase', () => {
  const base = 'https://registry.example/api/v2';

  it('accepts the base itself and anything below it', () => {
    expect(isWithinUpstreamBase(new URL('https://registry.example/api/v2'), base)).toBe(true);
    expect(isWithinUpstreamBase(new URL('https://registry.example/api/v2/extensions'), base)).toBe(
      true,
    );
  });

  it('keeps a double-encoded dot segment from collapsing out of the base', () => {
    // `%252e` survives one decode as `%2e`, which the URL parser still reads as
    // a `..` segment. Building from the raw path keeps the whole thing opaque.
    const raw = '/api/v2/%252e%252e/%252e%252e/admin/keys';
    expect(new URL(proxyTargetFor(decodeURIComponent(raw), '', base)).pathname).toBe('/admin/keys');
    expect(new URL(proxyTargetFor(raw, '', base)).pathname).toBe(raw);
  });

  it('rejects a target that resolved above the base path', () => {
    expect(isWithinUpstreamBase(new URL('https://registry.example/admin/keys'), base)).toBe(false);
  });

  it('rejects a sibling path that only shares a prefix string', () => {
    expect(isWithinUpstreamBase(new URL('https://registry.example/api/v20/keys'), base)).toBe(
      false,
    );
  });

  it('accepts any path when the base is a bare origin', () => {
    expect(
      isWithinUpstreamBase(
        new URL('https://registry.example/anything'),
        'https://registry.example',
      ),
    ).toBe(true);
  });
});

describe('shutdown', () => {
  it('closes the listener and exits 0 once connections drain', () => {
    const onExit = vi.fn();
    const server = { close: vi.fn((cb) => cb()) };

    shutdown(server, { onExit });

    expect(server.close).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it('bounds the stop when a response never finishes', () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      const server = { close: vi.fn() };

      shutdown(server, { onExit, graceMs: 5_000 });
      expect(onExit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5_000);
      expect(onExit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
