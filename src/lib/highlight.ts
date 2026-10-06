import Prism from 'prismjs/components/prism-core';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';

export type HighlightLanguage = 'javascript' | 'markdown' | 'markup' | 'css' | 'json' | 'bash';

const LANGUAGE_ALIASES: Record<string, HighlightLanguage | string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  md: 'markdown',
  markdown: 'markdown',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  json: 'json',
  css: 'css',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function normalizeLanguage(language?: string | null): string {
  if (!language) return 'plain';
  const resolved = LANGUAGE_ALIASES[language.toLowerCase()] || language.toLowerCase();
  return Prism.languages[resolved] ? resolved : 'plain';
}

export function highlightCode(code: string, language?: string | null): string {
  const lang = normalizeLanguage(language);
  const grammar = lang === 'plain' ? undefined : Prism.languages[lang];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, lang);
}
