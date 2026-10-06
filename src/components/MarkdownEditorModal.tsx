import React, { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { MarkdownView } from './MarkdownView';
import { Icon } from './Icon';
import { Modal } from './Modal';

type EditorMode = 'write' | 'preview' | 'split';

interface MarkdownEditorModalProps {
  title: string;
  version: number;
  value: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (body: string) => Promise<void>;
}

export const MarkdownEditorModal: React.FC<MarkdownEditorModalProps> = ({
  title,
  version,
  value,
  isSaving,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<EditorMode>('split');
  const [saveError, setSaveError] = useState<string | null>(null);

  // The hook owns Escape (preserving the existing close behavior), focus,
  // and Tab trapping.

  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save document');
    }
  };

  const lineCount = draft ? draft.split('\n').length : 0;
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;

  const modeButton = (target: EditorMode, label: string, icon: React.ReactNode) => (
    <button
      key={target}
      onClick={() => setMode(target)}
      aria-pressed={mode === target}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-meta font-medium transition-colors ${
        mode === target
          ? 'bg-lilac-100 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300'
          : 'text-ink-3 hover:text-ink hover:bg-wash dark:hover:bg-raised'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <Modal variant="fullscreen" labelledById="markdown-editor-title" onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="markdown-editor-title"
              className="text-base font-display font-semibold text-ink truncate"
            >
              {title}
            </h2>
            <span className="chip bg-lilac-50 dark:bg-lilac-900 text-lilac-700 dark:text-lilac-300 border-lilac-200 dark:border-lilac-800 font-mono text-meta">
              revision #{version}
            </span>
          </div>
          <p className="text-meta text-ink-3">
            Markdown policy editor — changes publish a new revision users may need to re-accept.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-ink-3 hover:text-ink transition-colors shrink-0"
          aria-label={`Close ${title} editor`}
        >
          <Icon name="close" className="icon-lg" />
        </button>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center justify-end px-5 py-2.5 bg-wash dark:bg-raised border-b border-line">
        <div className="flex items-center gap-0.5 border border-line rounded-lg p-0.5 bg-surface dark:bg-surface">
          {modeButton('write', 'Write', <Icon name="edit" className="icon-xs" />)}
          {modeButton('preview', 'Preview', <Icon name="visibility" className="icon-xs" />)}
          {modeButton('split', 'Split', <Icon name="view_column" className="icon-xs" />)}
        </div>
      </div>

      {saveError && (
        <div className="px-5 py-2 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200">
          {saveError}
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
        {mode === 'preview' ? (
          <div className="h-full overflow-auto border border-line rounded-lg bg-surface p-6">
            <MarkdownView content={draft} />
          </div>
        ) : mode === 'write' ? (
          <CodeEditor
            label={`${title} markdown editor`}
            language="markdown"
            value={draft}
            onChange={setDraft}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <CodeEditor
              label={`${title} markdown editor`}
              language="markdown"
              value={draft}
              onChange={setDraft}
            />
            <div className="hidden lg:block h-full overflow-auto border border-line rounded-lg bg-surface p-6">
              <MarkdownView content={draft} />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-line bg-wash dark:bg-raised text-meta text-ink-3 font-mono">
        <span>
          Markdown • {lineCount} lines • {wordCount} words • {charCount} chars
        </span>
        <span>Changes are not published until you save.</span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || draft === value}
          className="btn btn-primary btn-sm disabled:opacity-50"
        >
          <Icon name="save" className="icon-sm" />
          <span>{isSaving ? 'Publishing...' : 'Publish Revision'}</span>
        </button>
      </div>
    </Modal>
  );
};
