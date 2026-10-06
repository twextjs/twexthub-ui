import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRouteFromLocation, migrateLegacyHash, navigateToRoute, routeToPath } from './router';

describe('routeToPath', () => {
  it('maps home to /', () => {
    expect(routeToPath('home')).toBe('/');
    expect(routeToPath('')).toBe('/');
  });

  it('prefixes other routes with / and leaves absolute paths alone', () => {
    expect(routeToPath('search')).toBe('/search');
    expect(routeToPath('ext/ada/calc')).toBe('/ext/ada/calc');
    expect(routeToPath('/search?q=foo')).toBe('/search?q=foo');
  });
});

describe('getRouteFromLocation', () => {
  const originalPathname = window.location.pathname;

  const setLocation = (path: string) => window.history.replaceState(null, '', `${path}`);

  beforeEach(() => {
    setLocation('/');
  });

  afterEach(() => {
    setLocation(originalPathname);
  });

  it('reads the route from the URL path', () => {
    setLocation('/ext/ada/calc');
    expect(getRouteFromLocation()).toBe('ext/ada/calc');
  });

  it('trims slashes and falls back to home', () => {
    setLocation('/search/?q=foo');
    expect(getRouteFromLocation()).toBe('search?q=foo');
    setLocation('/');
    expect(getRouteFromLocation()).toBe('home');
  });
});

describe('navigateToRoute', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pushes a new history entry', () => {
    navigateToRoute('ext/ada/calc');
    expect(window.location.pathname).toBe('/ext/ada/calc');
    expect(window.history.length).toBeGreaterThan(1);
  });

  it('splits query-bearing routes into pathname and search', () => {
    navigateToRoute('search?q=foo');
    expect(window.location.pathname).toBe('/search');
    expect(window.location.search).toBe('?q=foo');
  });

  it('does not push a duplicate entry for the same URL', () => {
    navigateToRoute('search?q=foo');
    const length = window.history.length;
    navigateToRoute('search?q=foo');
    expect(window.history.length).toBe(length);
  });

  it('keeps search params out of the route when navigating home', () => {
    window.history.replaceState(null, '', '/search?q=foo');
    navigateToRoute('home');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/');
  });
});

describe('migrateLegacyHash', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('rewrites legacy hash URLs to paths', () => {
    window.history.replaceState(null, '', '/#/ext/ada/calc');
    migrateLegacyHash();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/ext/ada/calc');
  });

  it('leaves plain URLs alone', () => {
    window.history.replaceState(null, '', '/search?q=foo');
    migrateLegacyHash();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/search?q=foo');
  });

  it('leaves in-page anchors alone', () => {
    window.history.replaceState(null, '', '/ext/ada/calc#readme');
    migrateLegacyHash();
    expect(window.location.pathname).toBe('/ext/ada/calc');
    expect(window.location.hash).toBe('#readme');
  });

  it('leaves a bare trailing hash alone', () => {
    window.history.replaceState(null, '', '/search?q=foo#');
    migrateLegacyHash();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/search?q=foo');
  });
});
