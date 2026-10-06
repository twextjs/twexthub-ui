import { Change, diffLines } from 'diff';

export type DiffRowType = 'context' | 'added' | 'removed';

export interface DiffRow {
  type: DiffRowType;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface LineDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

export function computeLineDiff(oldText: string, newText: string): LineDiff {
  const changes: Change[] = diffLines(oldText || '', newText || '');
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;

  for (const change of changes) {
    const type: DiffRowType = change.added ? 'added' : change.removed ? 'removed' : 'context';
    const lines = change.value.split('\n');
    // `diffLines` keeps the trailing newline, which yields one empty final element.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    for (const text of lines) {
      if (type === 'added') {
        rows.push({ type, text, newLine });
        newLine += 1;
        added += 1;
      } else if (type === 'removed') {
        rows.push({ type, text, oldLine });
        oldLine += 1;
        removed += 1;
      } else {
        rows.push({ type, text, oldLine, newLine });
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return { rows, added, removed };
}
