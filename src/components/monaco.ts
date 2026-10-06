// Hand-assembled Monaco entry, bundled locally (loader.config() below
// short-circuits any CDN fallback). Composed like editor.main.js but WITHOUT
// the css/html/json/typescript language services: this editor is for source
// review and markdown editing, and services would drag in a 6.9 MB ts.worker,
// three more language workers, and diagnostics noise on reviewed third-party
// source. Includes:
//  - internal/common/workers.js — the full editor contribution set (the old
//    "editor.all"): standalone editor implementation, browser widgets, all
//    contrib features, codicon styles.
//  - editor.api.js — the exported `editor`/`languages` namespaces.
//  - Monarch grammar registers for every language this app edits (the
//    typescript register also provides the javascript grammar). These are
//    pure tokenizers: their lazy chunks import only editor.api.js. There is
//    no JSON Monarch grammar in 0.56 (JSON is service-only), so JSON content
//    renders as plain text.
import 'monaco-editor/internal/common/workers.js';
import 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/css/register.js';
import 'monaco-editor/languages/definitions/html/register.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/languages/definitions/shell/register.js';
import 'monaco-editor/languages/definitions/typescript/register.js';

export * from 'monaco-editor/editor/editor.api.js';
