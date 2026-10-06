import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { createServer, request as httpRequest, globalAgent as httpGlobalAgent } from 'node:http';
import { request as httpsRequest, globalAgent as httpsGlobalAgent } from 'node:https';
import { extname, join, resolve, sep } from 'node:path';

const DEFAULT_UPSTREAM_API_BASE_URL = 'https://twexts.sdisk.us/api/v2';
const WEB_ROOT = resolve(process.env.WEB_ROOT ?? 'dist');

const rawPort = Number(process.env.TWEXTHUB_PORT ?? 3000);
const PORT = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 3000;

const INDEX_NAME = 'index.html';

/**
 * The path the browser is allowed to know about. Every `/api/v2/...` call the
 * page makes lands here and is forwarded to `upstreamApiBaseUrl`, so clients
 * never learn — or reach for — the API host themselves. That keeps `localhost`
 * in operator config meaning the *server's* loopback, not the user's.
 */
const PUBLIC_API_PREFIX = '/api/v2';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

function isLoopbackHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

// Remote APIs must use HTTPS so injected credentials never travel in
// cleartext; plain HTTP is accepted only for loopback development URLs.
function isValidApiBaseUrl(raw) {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeApiBaseUrl(raw) {
  return raw.trim().replace(/\/+$/, '');
}

function unquoteYamlScalar(value) {
  if (value.length < 2) return value;
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return value;
  if (value.at(-1) !== quote) return null;
  return value.slice(1, -1);
}

function readApiBaseUrlFromYaml(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line === '---') continue;
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match || match[1] !== 'apiBaseUrl') continue;
    const value = unquoteYamlScalar(match[2].replace(/\s+#.*$/, '').trim());
    if (!value) return null;
    return value;
  }
  return null;
}

export { readApiBaseUrlFromYaml };

function resolveConfigPath() {
  const cliPath = process.argv[2];
  if (cliPath && existsSync(cliPath)) return cliPath;
  for (const candidate of ['config.yml', 'config.yaml']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveUpstreamApiBaseUrl() {
  let url = DEFAULT_UPSTREAM_API_BASE_URL;
  const configPath = resolveConfigPath();
  if (configPath) {
    const fromFile = readApiBaseUrlFromYaml(readFileSync(configPath, 'utf8'));
    if (fromFile && isValidApiBaseUrl(fromFile)) {
      url = normalizeApiBaseUrl(fromFile);
    } else {
      console.warn(`Ignoring invalid apiBaseUrl in ${configPath}.`);
    }
  }
  const fromEnv = process.env.TWEXTHUB_API_URL;
  if (fromEnv) {
    if (isValidApiBaseUrl(fromEnv)) {
      url = normalizeApiBaseUrl(fromEnv);
    } else {
      console.warn(`Ignoring invalid TWEXTHUB_API_URL "${fromEnv}".`);
    }
  }
  return url;
}

/** The API this server forwards the public `/api/v2` prefix to. */
const upstreamApiBaseUrl = resolveUpstreamApiBaseUrl();

function injectConfig(html) {
  const config = JSON.stringify({ apiBaseUrl: PUBLIC_API_PREFIX }).replace(/</g, '\\u003c');
  return html.replace(
    /<head([^>]*)>/,
    (match) => `${match}<script>window.TWEXTHUB_CONFIG = ${config};</script>`,
  );
}

/**
 * Map a request that landed on the public API path to its upstream URL. The
 * public prefix is the part `server.js` owns, so `/api/v2/resource?q=1` over a
 * base of `https://registry.example/api/v2` forwards to
 * `https://registry.example/api/v2/resource?q=1`.
 */
export function proxyTargetFor(urlPath, search, baseUrl = upstreamApiBaseUrl) {
  const rest = urlPath.slice(PUBLIC_API_PREFIX.length);
  return `${baseUrl}${rest}${search}`;
}

function isApiPath(urlPath) {
  return urlPath === PUBLIC_API_PREFIX || urlPath.startsWith(`${PUBLIC_API_PREFIX}/`);
}

/**
 * `new URL` collapses `..` segments, so a target built from a decoded path can
 * land outside the upstream's own base path — `/api/v2/..%2f..%2fadmin` would
 * reach `/admin` on the upstream host. Anything that resolves off the base is
 * not a route this proxy owns, so it is refused rather than forwarded.
 */
export function isWithinUpstreamBase(target, baseUrl = upstreamApiBaseUrl) {
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/, '');
  return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
}

// Headers that describe a single connection, not the resource, and must be
// renegotiated end to end rather than copied across the hop.
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function filterHopByHop(headers) {
  const filtered = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) filtered[name] = value;
  }
  return filtered;
}

const UPSTREAM_TIMEOUT_MS = 60_000;

function proxyApi(req, res, urlPath, parsedUrl) {
  let target;
  try {
    // Assembled from the raw pathname: a decoded path can still hold `%2e%2e`
    // segments, which `new URL` resolves as `..` and walks out of the base.
    target = new URL(proxyTargetFor(parsedUrl.pathname, parsedUrl.search));
  } catch {
    sendStatus(res, 502, 'Bad Gateway');
    return;
  }

  if (!isWithinUpstreamBase(target)) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }

  const transport = target.protocol === 'http:' ? httpRequest : httpsRequest;
  const proxyReq = transport(
    target,
    {
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      res.writeHead(
        upstreamRes.statusCode ?? 502,
        upstreamRes.statusMessage ?? undefined,
        filterHopByHop(upstreamRes.headers),
      );
      upstreamRes.pipe(res);
    },
  );

  proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => proxyReq.destroy(new Error('Upstream timed out')));
  proxyReq.on('error', (err) => {
    console.error(`[proxy] ${req.method} ${urlPath} -> ${err.code}: ${err.message}`);
    if (!res.headersSent) {
      sendStatus(res, 502, 'Bad Gateway');
    } else {
      res.destroy();
    }
  });

  req.pipe(proxyReq);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATED_ASSET_CACHE = 'public, max-age=300, stale-while-revalidate=600';

// Vite content-addresses emitted assets as `name-[hash].ext`; hashed names are
// safe to cache forever, stable names (e.g. regularLogoSquare.svg) are not.
function isContentAddressed(filePath) {
  return /[-.][0-9a-f]{8,}\.\w+$/i.test(filePath);
}

function serveFile(req, res, filePath) {
  const stream = createReadStream(filePath);
  let opened = false;
  stream.on('open', () => {
    opened = true;
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': isContentAddressed(filePath)
        ? IMMUTABLE_ASSET_CACHE
        : REVALIDATED_ASSET_CACHE,
    });
    stream.pipe(res);
  });
  stream.on('error', (err) => {
    if (!opened) {
      if (err.code === 'ENOENT') {
        res.writeHead(404).end('Not Found');
      } else {
        res.writeHead(500).end('Internal Server Error');
      }
    } else {
      // Headers are already sent; abort the response instead of committing
      // another status code.
      res.destroy();
    }
  });
}

function serveIndex(req, res, indexFile) {
  if (!existsSync(indexFile)) {
    sendStatus(res, 404, 'Not Found');
    return;
  }
  const html = injectConfig(readFileSync(indexFile, 'utf8'));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

function sendStatus(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
}

const server = createServer((req, res) => {
  let parsedUrl;
  let urlPath;
  try {
    parsedUrl = new URL(req.url ?? '/', 'http://localhost');
    urlPath = decodeURIComponent(parsedUrl.pathname);
  } catch {
    sendStatus(res, 400, 'Bad Request');
    return;
  }

  if (urlPath.includes('\0')) {
    sendStatus(res, 400, 'Bad Request');
    return;
  }

  const segments = urlPath.split('/').filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }

  // The API is the server's job now: forward any method, verbatim, and let
  // the upstream speak for itself.
  if (isApiPath(urlPath)) {
    proxyApi(req, res, urlPath, parsedUrl);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendStatus(res, 405, 'Method Not Allowed');
    return;
  }

  const filePath = resolve(join(WEB_ROOT, urlPath));
  const insideRoot = filePath === WEB_ROOT || filePath.startsWith(WEB_ROOT + sep);
  if (!insideRoot) {
    sendStatus(res, 403, 'Forbidden');
    return;
  }

  const indexFile = join(WEB_ROOT, INDEX_NAME);
  if (filePath === indexFile) {
    serveIndex(req, res, indexFile);
    return;
  }

  if (isFile(filePath)) {
    serveFile(req, res, filePath);
    return;
  }

  serveIndex(req, res, indexFile);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TwextHub Web UI listening on http://localhost:${PORT}`);
  console.log(
    `Serving ${WEB_ROOT} — ${PUBLIC_API_PREFIX} proxied to TwextHub API at ${upstreamApiBaseUrl}`,
  );
});

export const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Stop listening and drain, then exit. The container runs this process as PID
 * 1, where the kernel ignores the default dispositions of SIGTERM and SIGINT,
 * so without a handler `docker stop` burns its whole grace period waiting and
 * the process only dies by SIGKILL. With one, the process gets to close the
 * listener, wrap up what is in flight, and exit on its own — well under the
 * engine's default 10s.
 *
 * @param {{ close: (callback?: () => void) => void }} serverInstance
 * @param {{ onExit?: (code: number) => void, graceMs?: number }} [options]
 */
export function shutdown(
  serverInstance,
  {
    onExit = (code) => {
      process.exit(code);
    },
    graceMs = SHUTDOWN_GRACE_MS,
  } = {},
) {
  // `server.close` stops new connections and closes idle keep-alive ones, then
  // waits for active responses. If one never finishes, this timer still bounds
  // the stop; it is unref'd so an otherwise quiescent process can exit first.
  const forceExit = setTimeout(() => {
    console.error(`Shutdown grace period of ${graceMs}ms expired; exiting.`);
    onExit(1);
  }, graceMs);
  forceExit.unref();

  serverInstance.close(() => onExit(0));

  // Proxy sockets to the upstream sit on Node's global agents; pooled ones
  // would otherwise hold the event loop open past the listener.
  httpGlobalAgent.destroy();
  httpsGlobalAgent.destroy();
}

process.on('SIGTERM', () => shutdown(server));
process.on('SIGINT', () => shutdown(server));
