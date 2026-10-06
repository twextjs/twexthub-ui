import { describe, expect, it } from 'vitest';
import { timestampedFilename, toCsv } from './csv';

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('builds a header row and values', () => {
    const csv = toCsv([
      { a: 1, b: 'two' },
      { a: 2, b: 'three' },
    ]);
    expect(csv).toBe('a,b\n1,two\n2,three');
  });

  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv([{ note: 'a,b', quote: 'say "hi"', multi: 'line1\nline2' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it.each([
    ["=cmd|' /C calc!'!A0", "'=cmd|' /C calc!'!A0"],
    ['+2+2', "'+2+2"],
    ['-1+2', "'-1+2"],
    ['@SUM(1)', "'@SUM(1)"],
    ['\tsum', "'\tsum"],
    ['\rsum', '"\'\rsum"'],
  ])('defuses formula-prefixed value %j', (dangerous, expected) => {
    expect(toCsv([{ payload: dangerous }])).toBe(`payload\n${expected}`);
  });

  it('does not prefix values that merely contain a dangerous character later', () => {
    expect(toCsv([{ payload: 'a=b' }])).toBe('payload\na=b');
  });
});

describe('timestampedFilename', () => {
  it('includes the base name, date, and extension', () => {
    expect(timestampedFilename('export', 'csv')).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
