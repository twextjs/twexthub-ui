import { describe, expect, it } from 'vitest';
import { computeLineDiff } from './diff';

describe('computeLineDiff', () => {
  it('reports no changes for identical text', () => {
    const result = computeLineDiff('a\nb\n', 'a\nb\n');
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.rows.every((r) => r.type === 'context')).toBe(true);
  });

  it('detects added lines', () => {
    const result = computeLineDiff('a\n', 'a\nb\n');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    const added = result.rows.find((r) => r.type === 'added');
    expect(added?.text).toBe('b');
    expect(added?.newLine).toBe(2);
  });

  it('detects removed lines', () => {
    const result = computeLineDiff('a\nb\n', 'a\n');
    expect(result.added).toBe(0);
    expect(result.removed).toBe(1);
    expect(result.rows.find((r) => r.type === 'removed')?.oldLine).toBe(2);
  });

  it('treats a changed line as one removal and one addition', () => {
    const result = computeLineDiff('a\nold\nc\n', 'a\nnew\nc\n');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.rows.find((r) => r.type === 'removed')?.text).toBe('old');
    expect(result.rows.find((r) => r.type === 'added')?.text).toBe('new');
  });
});
