import React, { useEffect, useRef } from 'react';
import { Editor, loader } from '@monaco-editor/react';
// Bundle Monaco locally via our hand-assembled entry (see monaco.ts):
// full editor contributions + the Monarch grammars this app edits, but none
// of the language services — so no 6.9 MB ts.worker, no CSS/HTML/JSON
// workers, and no diagnostics noise on reviewed third-party source.
// loader.config() below short-circuits the loader's CDN behavior entirely —
// nothing is fetched from jsdelivr.
import * as monaco from './monaco';
import EditorWorker from './monacoEditorWorker.js?worker';
import { useTheme } from '../context/ThemeContext';
import { DARK_THEME, defineMonacoThemes, LIGHT_THEME } from './monacoThemes';

loader.config({ monaco });

// One shared base worker for every editor instance. Language-service workers
// are not wired: this editor is for source review and markdown editing, and
// the Monarch grammars used here tokenize on the main thread.
let editorWorker: Worker | null = null;
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => {
    if (!editorWorker) {
      editorWorker = new EditorWorker();
    }
    return editorWorker;
  },
};

interface MonacoSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  language: string;
  readOnly?: boolean;
}

export const MonacoSourceEditor: React.FC<MonacoSourceEditorProps> = ({
  value,
  onChange,
  label,
  language,
  readOnly = false,
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const stateRef = useRef<Map<string, monaco.editor.ICodeEditorViewState | null>>(new Map());
  const languageRef = useRef(language);
  languageRef.current = language;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Apply external value changes without clobbering view state, and remember
  // per-language state so remounts feel continuous.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.getValue() === value) return;

    const key = languageRef.current;
    stateRef.current.set(key, editor.saveViewState());
    model.setValue(value);
    const restored = stateRef.current.get(key);
    if (restored) {
      editor.restoreViewState(restored);
    }
    editor.setScrollTop(0);
  }, [value]);

  useEffect(
    () => () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    },
    [],
  );

  return (
    <Editor
      height="100%"
      language={language}
      theme={theme === 'dark' ? DARK_THEME : LIGHT_THEME}
      defaultValue={value}
      onChange={(next) => onChangeRef.current(next ?? '')}
      beforeMount={(monacoInstance) => {
        defineMonacoThemes(monacoInstance);
      }}
      onMount={(editor, monacoInstance) => {
        editorRef.current = editor;
        defineMonacoThemes(monacoInstance);
      }}
      options={{
        readOnly,
        domReadOnly: readOnly,
        ariaLabel: label,
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        fixedOverflowWidgets: true,
        renderLineHighlight: readOnly ? 'none' : 'line',
        lineNumbersMinChars: 3,
        padding: { top: 8, bottom: 8 },
      }}
    />
  );
};
