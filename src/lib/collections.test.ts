import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecentExtensions,
  clearSavedExtensions,
  getRecentSnapshot,
  getSavedSnapshot,
  isExtensionSaved,
  removeExtensionSaved,
  toggleExtensionSaved,
  recordExtensionView,
} from './collections';
import { makeExtension } from '../test/testUtils';

beforeEach(() => {
  clearSavedExtensions();
  clearRecentExtensions();
});

describe('saved extensions', () => {
  it('toggles an extension in and out of the saved list', () => {
    const ext = makeExtension({ namespace: 'ada', id: 'calc', name: 'Calc' });
    expect(toggleExtensionSaved(ext)).toBe(true);
    expect(isExtensionSaved('ada', 'calc')).toBe(true);
    expect(getSavedSnapshot()).toHaveLength(1);

    expect(toggleExtensionSaved(ext)).toBe(false);
    expect(isExtensionSaved('ada', 'calc')).toBe(false);
    expect(getSavedSnapshot()).toHaveLength(0);
  });

  it('stores newest saved extensions first and removes selectively', () => {
    toggleExtensionSaved(makeExtension({ id: 'one', name: 'One' }));
    toggleExtensionSaved(makeExtension({ id: 'two', name: 'Two' }));

    expect(getSavedSnapshot().map((s) => s.id)).toEqual(['two', 'one']);

    removeExtensionSaved('kane', 'one');
    expect(getSavedSnapshot().map((s) => s.id)).toEqual(['two']);
  });
});

describe('recently viewed', () => {
  it('de-duplicates and keeps the most recent first', () => {
    recordExtensionView(makeExtension({ id: 'one', name: 'One' }));
    recordExtensionView(makeExtension({ id: 'two', name: 'Two' }));
    recordExtensionView(makeExtension({ id: 'one', name: 'One' }));

    expect(getRecentSnapshot().map((r) => r.id)).toEqual(['one', 'two']);
  });

  it('caps the list at twelve entries', () => {
    for (let i = 0; i < 15; i += 1) {
      recordExtensionView(makeExtension({ id: `ext-${i}`, name: `Ext ${i}` }));
    }
    expect(getRecentSnapshot()).toHaveLength(12);
    expect(getRecentSnapshot()[0].id).toBe('ext-14');
  });
});
