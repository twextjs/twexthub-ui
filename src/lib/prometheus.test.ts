import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatValue,
  parseLabels,
  parsePrometheusText,
} from './prometheus';

const SAMPLE = `# HELP twexthub_uptime_seconds Process uptime in seconds.
# TYPE twexthub_uptime_seconds gauge
twexthub_uptime_seconds 1234.5
# HELP twexthub_accounts_total Accounts by role.
# TYPE twexthub_accounts_total gauge
twexthub_accounts_total{role="admin"} 3
twexthub_accounts_total{role="normal"} 57
# HELP twexthub_http_requests_total Requests by route.
# TYPE twexthub_http_requests_total counter
twexthub_http_requests_total{method="GET",route="/v2/extensions",status="200"} 4213
twexthub_http_requests_total{method="POST",route="/v2/versions",status="201"} 88
# HELP twexthub_http_request_duration_seconds Request latency.
# TYPE twexthub_http_request_duration_seconds histogram
twexthub_http_request_duration_seconds_bucket{route="/v2/extensions",le="0.05"} 900
twexthub_http_request_duration_seconds_count{route="/v2/extensions"} 1000
`;

describe('parsePrometheusText', () => {
  it('captures HELP and TYPE metadata', () => {
    const { families } = parsePrometheusText(SAMPLE);
    const uptime = families.find((f) => f.name === 'twexthub_uptime_seconds');
    expect(uptime?.type).toBe('gauge');
    expect(uptime?.help).toBe('Process uptime in seconds.');
  });

  it('parses unlabelled samples', () => {
    const { families } = parsePrometheusText(SAMPLE);
    const uptime = families.find((f) => f.name === 'twexthub_uptime_seconds');
    expect(uptime?.samples).toEqual([
      { name: 'twexthub_uptime_seconds', labels: {}, value: 1234.5 },
    ]);
  });

  it('parses labelled samples and keeps family grouping', () => {
    const { families } = parsePrometheusText(SAMPLE);
    const accounts = families.find((f) => f.name === 'twexthub_accounts_total');
    expect(accounts?.samples).toHaveLength(2);
    expect(accounts?.samples[0].labels).toEqual({ role: 'admin' });
    expect(accounts?.samples[1].value).toBe(57);
  });

  it('inherits histogram metadata onto the suffixed series', () => {
    const { families } = parsePrometheusText(SAMPLE);
    const bucket = families.find((f) => f.name === 'twexthub_http_request_duration_seconds_bucket');
    expect(bucket?.type).toBe('histogram');
    expect(bucket?.help).toBe('Request latency.');
  });

  it('parses multiple labels per sample', () => {
    const { families } = parsePrometheusText(SAMPLE);
    const requests = families.find((f) => f.name === 'twexthub_http_requests_total');
    expect(requests?.samples[0].labels).toEqual({
      method: 'GET',
      route: '/v2/extensions',
      status: '200',
    });
  });

  it('ignores trailing timestamps', () => {
    const { families } = parsePrometheusText('twexthub_x_total 5 1700000000000\n');
    expect(families[0].samples[0].value).toBe(5);
  });

  it('counts samples but not metadata comments', () => {
    const { sampleCount, families } = parsePrometheusText(SAMPLE);
    expect(sampleCount).toBe(7);
    // The histogram base name only exists to attach metadata, so it is not
    // rendered as its own family.
    expect(families.map((f) => f.name)).toEqual([
      'twexthub_uptime_seconds',
      'twexthub_accounts_total',
      'twexthub_http_requests_total',
      'twexthub_http_request_duration_seconds_bucket',
      'twexthub_http_request_duration_seconds_count',
    ]);
  });

  it('creates a family for samples with no preceding metadata', () => {
    const { families } = parsePrometheusText('twexthub_orphan 1\n');
    expect(families).toHaveLength(1);
    expect(families[0].type).toBeNull();
  });

  it('tolerates an empty body', () => {
    expect(parsePrometheusText('')).toEqual({ families: [], sampleCount: 0 });
  });

  it('skips unparseable lines instead of throwing', () => {
    const { families } = parsePrometheusText('not a metric line\n\ntwexthub_ok 1\n');
    expect(families).toHaveLength(1);
    expect(families[0].name).toBe('twexthub_ok');
  });

  it('skips non-numeric values', () => {
    const { families } = parsePrometheusText('twexthub_bad NaN-ish\ntwexthub_good 2\n');
    expect(families.map((f) => f.name)).toEqual(['twexthub_good']);
  });
});

describe('parseLabels', () => {
  it('returns an empty object for undefined', () => {
    expect(parseLabels(undefined)).toEqual({});
  });

  it('handles escaped quotes and backslashes', () => {
    expect(parseLabels('msg="a \\"quoted\\" value",path="c:\\\\x"')).toEqual({
      msg: 'a "quoted" value',
      path: 'c:\\x',
    });
  });

  it('ignores surrounding whitespace and commas', () => {
    expect(parseLabels('  a = "1" ,  b = "2" ')).toEqual({ a: '1', b: '2' });
  });

  it('preserves empty label values', () => {
    expect(parseLabels('a=""')).toEqual({ a: '' });
  });
});

describe('formatting', () => {
  it('formats bytes with binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MiB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GiB');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(90061)).toBe('1d 1h 1m 1s');
    expect(formatDuration(3600)).toBe('1h');
  });

  it('formats integer values with separators', () => {
    expect(formatValue('twexthub_downloads_total', 4213)).toBe('4,213');
  });

  it('formats fractional values with two decimals', () => {
    expect(formatValue('twexthub_ratio', 0.12345)).toBe('0.12');
  });

  it('routes byte-suffixed names through byte formatting', () => {
    expect(formatValue('twexthub_storage_bytes', 2048)).toBe('2.0 KiB');
  });

  it('routes uptime through duration formatting', () => {
    expect(formatValue('twexthub_uptime_seconds', 1234.5)).toBe('20m 34s');
  });
});
