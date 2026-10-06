import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme('light')}>set-light</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
});

describe('ThemeContext', () => {
  it('defaults to light without stored or system preference', () => {
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles between light and dark and persists the choice', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('twexthub_theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('initializes to dark when a dark theme is stored', () => {
    localStorage.setItem('twexthub_theme', 'dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('honors setTheme and updates the document class', async () => {
    const user = userEvent.setup();
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    await user.click(screen.getByRole('button', { name: 'set-light' }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(localStorage.getItem('twexthub_theme')).toBe('light');
  });

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useTheme must be used within a ThemeProvider');
  });
});
