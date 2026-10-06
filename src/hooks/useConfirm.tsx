import React, { useCallback, useRef, useState } from 'react';
import { ConfirmDialog, ConfirmDialogOptions } from '../components/ConfirmDialog';

/**
 * Promise-based replacement for `window.confirm`, rendered as an in-app modal.
 *
 * Usage:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title: 'Delete?', variant: 'danger' }))) return;
 *   ...
 *   return (<div>{confirmDialog}...</div>);
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(next);
    });
  }, []);

  const close = useCallback((result: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  const confirmDialog = options ? (
    <ConfirmDialog
      open
      options={options}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
