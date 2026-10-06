import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { Sidebar } from './components/Sidebar';
import { TermsBanner } from './components/TermsBanner';
import { CommandPalette } from './components/CommandPalette';

// Pages
import { getRouteFromLocation, navigateToRoute } from './lib/router';
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { ExtensionDetailPage } from './pages/ExtensionDetailPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthorPage } from './pages/AuthorPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { SavedPage } from './pages/SavedPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { AdminPage } from './pages/AdminPage';

export const App: React.FC = () => {
  // History-based routing: URLs are real paths (/ext/ns/id), served with an
  // index.html fallback on the server side.
  const [route, setRoute] = useState<string>(getRouteFromLocation());
  const [configRefreshKey] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromLocation());
      window.scrollTo(0, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigate = useCallback((targetRoute: string) => {
    navigateToRoute(targetRoute);
    setRoute(targetRoute);
    window.scrollTo(0, 0);
  }, []);

  // Parse route components
  const renderCurrentPage = () => {
    // Search route with optional query e.g. "search?q=foo"
    if (route.startsWith('search')) {
      const qIndex = route.indexOf('?q=');
      const query = qIndex !== -1 ? decodeURIComponent(route.substring(qIndex + 3)) : '';
      return (
        <ExplorePage
          key={`${query}-${configRefreshKey}`}
          initialQuery={query}
          onNavigate={navigate}
        />
      );
    }

    // Author profile route e.g. "author/:namespace"
    if (route.startsWith('author/')) {
      const namespace = route.substring('author/'.length);
      if (namespace) {
        return (
          <AuthorPage
            key={`${namespace}-${configRefreshKey}`}
            namespace={namespace}
            onNavigate={navigate}
          />
        );
      }
    }

    // Organization routes: "organizations" is the directory, "org/:namespace"
    // the public profile and "org/:namespace/settings" what an owner may change.
    // An organization shares its namespace with accounts, so the two are
    // addressed separately and "org/" never collides with "author/".
    if (route.startsWith('org/')) {
      const parts = route.split('/');
      const namespace = parts[1] || '';
      if (namespace && parts[2] === 'settings') {
        return (
          <OrganizationSettingsPage
            key={`${namespace}-${configRefreshKey}`}
            namespace={namespace}
            onNavigate={navigate}
          />
        );
      }
      if (namespace && !parts[2]) {
        return (
          <OrganizationPage
            key={`${namespace}-${configRefreshKey}`}
            namespace={namespace}
            onNavigate={navigate}
          />
        );
      }
    }

    // Extension detail route e.g. "ext/:namespace/:id"
    if (route.startsWith('ext/')) {
      const parts = route.split('/');
      const namespace = parts[1] || '';
      const id = parts[2] || '';
      if (namespace && id) {
        return (
          <ExtensionDetailPage
            key={`${namespace}/${id}-${configRefreshKey}`}
            namespace={namespace}
            id={id}
            onNavigate={navigate}
          />
        );
      }
    }

    switch (route) {
      case 'home':
        return <HomePage key={configRefreshKey} onNavigate={navigate} />;
      case 'login':
        return <LoginPage onNavigate={navigate} />;
      case 'signup':
        return <SignupPage onNavigate={navigate} />;
      case 'dashboard':
        return <DashboardPage key={configRefreshKey} onNavigate={navigate} />;
      case 'settings':
      case 'sessions-tokens':
        return <SettingsPage key={configRefreshKey} onNavigate={navigate} />;
      case 'organizations':
        return <OrganizationsPage key={configRefreshKey} onNavigate={navigate} />;
      case 'saved':
        return <SavedPage key={configRefreshKey} onNavigate={navigate} />;
      case 'admin':
        return <AdminPage key={configRefreshKey} onNavigate={navigate} />;
      case 'terms':
        return <TermsPage key={configRefreshKey} onNavigate={navigate} />;
      case 'privacy':
        return <PrivacyPage key={configRefreshKey} />;
      default:
        return <HomePage key={configRefreshKey} onNavigate={navigate} />;
    }
  };

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          {/* Stacks under the mobile bar, and sits beside the column at lg. */}
          <div className="flex min-h-screen flex-col bg-canvas text-ink font-sans transition-colors duration-150 lg:flex-row">
            <Sidebar
              currentRoute={route}
              onNavigate={navigate}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Global Terms Acceptance Warning Banner */}
              <TermsBanner onNavigate={navigate} />

              {/* Main Content Area */}
              <main className="flex-1">{renderCurrentPage()}</main>
            </div>

            <CommandPalette
              open={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
              onNavigate={navigate}
            />
          </div>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
