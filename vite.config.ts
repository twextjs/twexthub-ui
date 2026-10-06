import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server is the site for `npm run dev`, so it stands in for server.js:
// it injects the same-origin public API path into the page and forwards the
// whole public prefix to whatever upstream the operator configured. The client
// never learns the upstream's host — the browser only ever calls this server,
// and "localhost" in TWEXTHUB_API_URL means the *server's* loopback.
// `VITE_TWEXTHUB_API_URL` is honoured too, as a build-time pick for static
// hosts that have no proxy; when running with the dev server it only sets the
// proxy upstream, it is never baked into the client.
const DEFAULT_UPSTREAM = 'https://twexts.sdisk.us/api/v2';
const PUBLIC_API_PREFIX = '/api/v2';
const configuredUpstream =
  process.env.TWEXTHUB_API_URL ?? process.env.VITE_TWEXTHUB_API_URL ?? DEFAULT_UPSTREAM;

function upstreamOriginAndPath(base: string): { origin: string; path: string } {
  try {
    const parsed = new URL(base);
    return { origin: parsed.origin, path: parsed.pathname.replace(/\/+$/, '') };
  } catch {
    const fallback = new URL(DEFAULT_UPSTREAM);
    return { origin: fallback.origin, path: fallback.pathname.replace(/\/+$/, '') };
  }
}

const { origin: proxyTarget, path: upstreamPath } = upstreamOriginAndPath(configuredUpstream);

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Same contract as server.js: the served page tells the client to use
        // its own origin, and the proxy below relays. Without this, a baked
        // VITE_TWEXTHUB_API_URL would send the browser straight at the API.
        name: 'twexthub-config-inject',
        apply: 'serve' as const,
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              injectTo: 'head-prepend',
              children: `window.TWEXTHUB_CONFIG = {"apiBaseUrl":"${PUBLIC_API_PREFIX}"};`,
            },
          ];
        },
      },
    ],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) =>
            path.startsWith(PUBLIC_API_PREFIX)
              ? `${upstreamPath}${path.slice(PUBLIC_API_PREFIX.length)}`
              : path,
        },
      },
    },
    // Monaco's editor.worker.js is an ESM module worker; emit worker chunks
    // as ES modules so the bundled worker loads correctly.
    worker: {
      format: 'es' as const,
    },
    build: {
      // The lazily loaded Monaco chunk is intentionally large (~3 MB min).
      chunkSizeWarningLimit: 4000,
    },
  };
});
