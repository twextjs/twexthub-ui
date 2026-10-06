import { useCallback, useSyncExternalStore } from 'react';
import {
  clearRecentExtensions,
  clearSavedExtensions,
  ExtensionIdentity,
  getRecentSnapshot,
  getSavedSnapshot,
  recordExtensionView,
  removeExtensionSaved,
  subscribe,
  toggleExtensionSaved,
} from '../lib/collections';

export function useSavedExtensions() {
  const saved = useSyncExternalStore(subscribe, getSavedSnapshot, getSavedSnapshot);

  const isSaved = useCallback(
    (namespace: string, id: string) =>
      saved.some((item) => item.namespace === namespace && item.id === id),
    [saved],
  );

  const toggle = useCallback((extension: ExtensionIdentity) => toggleExtensionSaved(extension), []);
  const remove = useCallback(
    (namespace: string, id: string) => removeExtensionSaved(namespace, id),
    [],
  );
  const clear = useCallback(() => clearSavedExtensions(), []);

  return { saved, isSaved, toggle, remove, clear };
}

export function useRecentExtensions() {
  const recent = useSyncExternalStore(subscribe, getRecentSnapshot, getRecentSnapshot);
  const record = useCallback((extension: ExtensionIdentity) => recordExtensionView(extension), []);
  const clear = useCallback(() => clearRecentExtensions(), []);
  return { recent, record, clear };
}
