/**
 * Minimal parser for the Prometheus text exposition format.
 *
 * Only what the registry actually emits is supported: HELP/TYPE metadata
 * comments, and samples of `name{labels} value [timestamp]`. Values are parsed
 * as numbers, since every gauge/counter/histogram sample is numeric.
 */

export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface MetricFamily {
  name: string;
  type: string | null;
  help: string | null;
  samples: MetricSample[];
}

export interface ParsedMetrics {
  families: MetricFamily[];
  /** Total sample lines, excluding metadata comments. */
  sampleCount: number;
}

const METADATA = /^#\s*(HELP|TYPE)\s+(\S+)\s*([\s\S]*)$/;
const SAMPLE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(.+?)(?:\s+\d+)?\s*$/;

/** Parses `{a="1",b="2"}` into a plain object, honouring backslash escapes. */
export function parseLabels(raw: string | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!raw) return labels;

  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i])) i += 1;
    if (i >= raw.length) break;

    const eq = raw.indexOf('=', i);
    if (eq === -1) break;
    const key = raw.slice(i, eq).trim();
    i = eq + 1;

    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] !== '"') break;

    i += 1;
    let value = '';
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '\\') {
        const next = raw[i + 1];
        if (next === undefined) break;
        value += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        break;
      }
      value += ch;
      i += 1;
    }

    if (key) labels[key] = value;
  }

  return labels;
}

/** Histogram/summary series carry their metadata on the base family name. */
const SUFFIXED = /^(.*)_(bucket|sum|count)$/;

export function parsePrometheusText(text: string): ParsedMetrics {
  const byName = new Map<string, MetricFamily>();
  const order: string[] = [];
  const metadata = new Map<string, { type: string | null; help: string | null }>();
  let sampleCount = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = METADATA.exec(line);
    if (meta) {
      const [, kind, name, rest] = meta;
      const family = byName.get(name) || {
        name,
        type: null,
        help: null,
        samples: [],
      };
      if (kind === 'HELP') family.help = rest.trim() || null;
      else family.type = rest.trim() || null;
      metadata.set(name, { type: family.type, help: family.help });
      if (!byName.has(name)) {
        byName.set(name, family);
        order.push(name);
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    const sample = SAMPLE.exec(line);
    if (!sample) continue;

    const [, name, , labelBlob, valueBlob] = sample;
    const value = Number.parseFloat(valueBlob);
    if (!Number.isFinite(value)) continue;

    let family = byName.get(name);
    if (!family) {
      // Inherit the base family's metadata so `_bucket`/`_sum`/`_count` series
      // are not orphaned, and the empty base family is not rendered on its own.
      const base = SUFFIXED.exec(name)?.[1];
      const inherited = base ? metadata.get(base) : undefined;
      family = {
        name,
        type: inherited?.type ?? null,
        help: inherited?.help ?? null,
        samples: [],
      };
      byName.set(name, family);
      order.push(name);
    }

    family.samples.push({ name, labels: parseLabels(labelBlob), value });
    sampleCount += 1;
  }

  // A declared family with no samples carries no information for a reader, and
  // histogram base names only exist to attach metadata to their suffixed series.
  const families = order.map((name) => byName.get(name)!).filter((f) => f.samples.length > 0);

  return { families, sampleCount };
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—';
  let n = value;
  let unit = 0;
  while (Math.abs(n) >= 1024 && unit < BYTE_UNITS.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(n) : n.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

export function formatValue(name: string, value: number): string {
  if (/bytes$|_bytes/.test(name)) return formatBytes(value);
  if (/uptime/.test(name) || /_seconds$/.test(name)) {
    // Durations and histograms read better as uptime-style text, but a
    // sub-minute request latency is clearer in seconds.
    return value >= 60 ? formatDuration(value) : `${value.toFixed(3)}s`;
  }
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
}

export const formatLabels = (labels: Record<string, string>) =>
  Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(', ');
