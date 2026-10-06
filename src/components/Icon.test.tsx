import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './Icon';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `missing rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Icon', () => {
  it('renders the name as a class, not as text', () => {
    const { container } = render(<Icon name="close" />);
    const span = container.firstElementChild as HTMLElement;

    expect(span.className).toContain('icon');
    expect(span.className).toContain('i-close');
    // A ligature is ordinary text. Left in the element it lands in the text
    // content of every label around it.
    expect(span.textContent).toBe('');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<Icon name="close" />);
    // The control around the icon carries the accessible name, so the glyph
    // must stay out of it.
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks a filled icon through the FILL axis', () => {
    const { container } = render(<Icon name="bookmark" filled />);
    expect((container.firstElementChild as HTMLElement).className).toContain('icon-filled');
  });

  it('keeps caller classes', () => {
    const { container } = render(<Icon name="close" className="text-ink-3 shrink-0" />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.className).toContain('text-ink-3');
    expect(span.className).toContain('shrink-0');
  });

  it('tracks the surrounding font size unless given an explicit step', () => {
    // A fixed size here left unsized icons a full 16px inside text-xs labels
    // and small buttons, which read as misaligned.
    expect(rule('.icon')).toContain('font-size: inherit');
  });

  it('offers size steps that override the inherited size', () => {
    for (const [step, size] of [
      ['.icon-xs', '0.75rem'],
      ['.icon-sm', '0.875rem'],
      ['.icon-lg', '1.25rem'],
      ['.icon-xl', '1.5rem'],
      ['.icon-2xl', '2rem'],
      ['.icon-3xl', '2.5rem'],
    ] as const) {
      expect(rule(step)).toContain(`font-size: ${size}`);
    }
  });
});
