import React, { lazy, Suspense } from 'react';
import { HighlightLanguage } from '../lib/highlight';

const MonacoSourceEditor = lazy(() =>
  import('./MonacoSourceEditor').then((m) => ({ default: m.MonacoSourceEditor })),
);

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  language?: HighlightLanguage;
  readOnly?: boolean;
}

const loadingFallback = (
  <div className="h-full min-h-[12rem] flex items-center justify-center text-xs text-ink-3 font-mono bg-surface border border-line rounded-lg">
    Loading editor...
  </div>
);

// Lazy wrapper so the Monaco chunk only loads when an editor actually renders.
export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  label,
  language = 'javascript',
  readOnly = false,
}) => (
  <Suspense fallback={loadingFallback}>
    <MonacoSourceEditor
      value={value}
      onChange={onChange}
      label={label}
      language={language}
      readOnly={readOnly}
    />
  </Suspense>
);
