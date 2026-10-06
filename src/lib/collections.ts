import { Extension, ExtensionVersion } from '../types/api';

/**
 * The identity a saved/recent item keeps: satisfied by a detail payload, a
 * list or search row, and a card alike.
 */
export interface ExtensionIdentity {
  namespace: string;
  id: string;
  name: string;
  description?: string;
  shortDescription?: string;
  author?: Extension['author'];
  /** Latest published version, as detail and list rows spell it. */
  version?: string;
  /** Legacy local-storage spelling kept for previously saved items. */
  latestVersion?: string;
  versions?: ExtensionVersion[];
}

const SAVED_KEY = 'twexthub_saved_extensions';
const RECENT_KEY = 'twexthub_recent_extensions';
const RECENT_LIMIT = 12;

export interface SavedExtension {
  namespace: string;
  id: string;
  name: string;
  description?: string;
  author?: string;
  latestVersion?: string;
  savedAt: string;
}

export interface RecentExtension {
  namespace: string;
  id: string;
  name: string;
  viewedAt: string;
}

const listeners = new Set<() => void>();
let savedCache: SavedExtension[] | null = null;
let recentCache: RecentExtension[] | null = null;

function read<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode / restricted iframe); keep in-memory only.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSavedSnapshot(): SavedExtension[] {
  if (savedCache === null) savedCache = read<SavedExtension>(SAVED_KEY);
  return savedCache;
}

export function getRecentSnapshot(): RecentExtension[] {
  if (recentCache === null) recentCache = read<RecentExtension>(RECENT_KEY);
  return recentCache;
}

export function extensionAuthor(extension: ExtensionIdentity): string {
  if (typeof extension.author === 'object' && extension.author !== null) {
    return extension.author.displayName || extension.author.namespace;
  }
  return extension.author || extension.namespace;
}

function toSaved(extension: ExtensionIdentity): SavedExtension {
  return {
    namespace: extension.namespace,
    id: extension.id,
    name: extension.name,
    description: extension.shortDescription || extension.description,
    author: extensionAuthor(extension),
    latestVersion: extension.version || extension.latestVersion || extension.versions?.[0]?.version,
    savedAt: new Date().toISOString(),
  };
}

export function isExtensionSaved(namespace: string, id: string): boolean {
  return getSavedSnapshot().some((item) => item.namespace === namespace && item.id === id);
}

/** Toggles the saved state. Returns `true` when the extension is now saved. */
export function toggleExtensionSaved(extension: ExtensionIdentity): boolean {
  const current = getSavedSnapshot();
  const exists = current.some(
    (item) => item.namespace === extension.namespace && item.id === extension.id,
  );
  const next = exists
    ? current.filter(
        (item) => !(item.namespace === extension.namespace && item.id === extension.id),
      )
    : [toSaved(extension), ...current];
  savedCache = next;
  write(SAVED_KEY, next);
  emit();
  return !exists;
}

export function removeExtensionSaved(namespace: string, id: string): void {
  const next = getSavedSnapshot().filter(
    (item) => !(item.namespace === namespace && item.id === id),
  );
  savedCache = next;
  write(SAVED_KEY, next);
  emit();
}

export function clearSavedExtensions(): void {
  savedCache = [];
  write(SAVED_KEY, []);
  emit();
}

export function recordExtensionView(extension: ExtensionIdentity): void {
  const ref: RecentExtension = {
    namespace: extension.namespace,
    id: extension.id,
    name: extension.name,
    viewedAt: new Date().toISOString(),
  };
  const next = [
    ref,
    ...getRecentSnapshot().filter(
      (item) => !(item.namespace === extension.namespace && item.id === extension.id),
    ),
  ].slice(0, RECENT_LIMIT);
  recentCache = next;
  write(RECENT_KEY, next);
  emit();
}

export function clearRecentExtensions(): void {
  recentCache = [];
  write(RECENT_KEY, []);
  emit();
}

// Keep multiple tabs in sync by invalidating caches when another tab writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SAVED_KEY) {
      savedCache = null;
      emit();
    }
    if (event.key === RECENT_KEY) {
      recentCache = null;
      emit();
    }
  });
}
