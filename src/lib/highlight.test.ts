import { describe, expect, it } from 'vitest';
import { highlightCode, normalizeLanguage } from './highlight';

describe('highlight', () => {
  it('highlights JavaScript keywords, strings, and numbers', () => {
    const html = highlightCode("const answer = 'yes';\nreturn 42;", 'javascript');
    expect(html).toContain('token keyword');
    expect(html).toContain('token string');
    expect(html).toContain('token number');
  });

  it('highlights Markdown markup', () => {
    const html = highlightCode('# Title\n\n- item\n\n> quote', 'markdown');
    expect(html).toContain('token title');
    expect(html).toContain('token list');
  });

  it('escapes HTML for unknown languages', () => {
    const html = highlightCode('<script>alert(1)</script>', 'nope');
    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('token');
  });

  it('normalizes common language aliases', () => {
    expect(normalizeLanguage('js')).toBe('javascript');
    expect(normalizeLanguage('ts')).toBe('javascript');
    expect(normalizeLanguage('md')).toBe('markdown');
    expect(normalizeLanguage('html')).toBe('markup');
    expect(normalizeLanguage('css')).toBe('css');
    expect(normalizeLanguage('sh')).toBe('bash');
    expect(normalizeLanguage('unknown')).toBe('plain');
    expect(normalizeLanguage(undefined)).toBe('plain');
  });

  it('highlights CSS selectors, properties, and values', () => {
    const html = highlightCode('.card { color: red; }', 'css');
    expect(html).toContain('token selector');
    expect(html).toContain('token property');
  });
});
