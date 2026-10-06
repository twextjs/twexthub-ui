export type ExploreViewMode = 'grid' | 'list';
export type ExploreSort = 'newest' | 'name' | 'author';

export const EXPLORE_LIMITS = [6, 12, 24, 48];

export interface ExplorePrefs {
  viewMode: ExploreViewMode;
  limit: number;
  sort: ExploreSort;
}

export const EXPLORE_PREFS_KEY = 'twexthub_explore_prefs';

const DEFAULT_PREFS: ExplorePrefs = {
  viewMode: 'grid',
  limit: 12,
  sort: 'newest',
};

export function loadExplorePrefs(): ExplorePrefs {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(EXPLORE_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ExplorePrefs>;
    return {
      viewMode: parsed.viewMode === 'list' ? 'list' : 'grid',
      limit:
        typeof parsed.limit === 'number' && EXPLORE_LIMITS.includes(parsed.limit)
          ? parsed.limit
          : DEFAULT_PREFS.limit,
      sort: parsed.sort === 'name' || parsed.sort === 'author' ? parsed.sort : 'newest',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveExplorePrefs(prefs: ExplorePrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EXPLORE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage failures
  }
}
