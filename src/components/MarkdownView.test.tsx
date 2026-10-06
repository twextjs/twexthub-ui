import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

describe('MarkdownView', () => {
  it('syntax-highlights fenced code blocks', () => {
    const { container } = render(<MarkdownView content={'```js\nconst x = 1;\n```'} />);
    const code = container.querySelector('code.code-highlight');
    expect(code).not.toBeNull();
    expect(code?.innerHTML).toContain('token keyword');
    expect(code?.innerHTML).toContain('token number');
  });

  it('leaves inline code unstyled by the highlighter', () => {
    const { container } = render(<MarkdownView content={'Use `npm test` to run.'} />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code).not.toHaveClass('code-highlight');
    expect(code?.textContent).toBe('npm test');
  });
});
