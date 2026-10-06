// Tiny wrapper: the `?worker` query cannot ride on a bare `monaco-editor/...`
// specifier (Rolldown's resolver does not apply the package exports map to
// suffixed imports), so the query is placed on this local file instead.
import 'monaco-editor/editor/editor.worker.js';
