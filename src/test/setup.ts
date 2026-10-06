import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// Monaco needs layout APIs and workers jsdom cannot provide, and tests treat
// the editor as a plain textarea with the same observable surface (label,
// readonly, value, onChange). Mock the inner Monaco wrapper first so the real
// Monaco bundle and its worker are never pulled into jsdom.
vi.mock('../components/MonacoSourceEditor', async () => {
  const { forwardRef } = await import('react');
  const MonacoSourceEditor = forwardRef<
    HTMLTextAreaElement,
    {
      value: string;
      onChange: (value: string) => void;
      label: string;
      language?: string;
      readOnly?: boolean;
    }
  >(function MockMonacoSourceEditor({ value, onChange, label, readOnly }, ref) {
    return React.createElement('textarea', {
      ref,
      readOnly,
      'aria-label': label,
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    });
  });
  return { MonacoSourceEditor };
});

// Belt-and-braces: if anything imports the react wrapper directly, give it the
// same textarea surface and a no-op loader.
vi.mock('@monaco-editor/react', async () => {
  const { forwardRef } = await import('react');
  const Editor = forwardRef<
    HTMLTextAreaElement,
    {
      value?: string;
      defaultValue?: string;
      onChange?: (value: string | undefined) => void;
      options?: { readOnly?: boolean; ariaLabel?: string };
    }
  >(function MockMonacoEditor({ value, defaultValue, onChange, options }, ref) {
    return React.createElement('textarea', {
      ref,
      readOnly: options?.readOnly,
      'aria-label': options?.ariaLabel,
      value: value ?? defaultValue ?? '',
      onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
    });
  });
  return {
    default: Editor,
    Editor,
    loader: { config: () => {}, init: () => Promise.resolve({}) },
  };
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!('scrollIntoView' in window)) {
  Element.prototype.scrollIntoView = () => {};
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(() => Promise.resolve()) },
  });
}
