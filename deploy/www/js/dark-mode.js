/**
 * Dark Mode Theme Manager
 *
 * Provides dark/light theme switching functionality with localStorage persistence.
 * Supports both mobile and desktop toggle buttons and updates icon indicators.
 *
 * @module dark-mode
 * @requires localStorage
 */

// DOM Elements
const darkModeToggleMobile = document.getElementById('darkModeToggleMobile');
const darkModeToggleDesktop = document.getElementById('darkModeToggleDesktop');

if (darkModeToggleMobile || darkModeToggleDesktop) {
  const html = document.documentElement;
  const iconSpans = document.querySelectorAll('.darkModeIcon');
  const themeLogo = document.getElementById('themeLogo');

  /**
   * Applies the specified theme to the document and updates UI elements.
   *
   * @param {string} theme - The theme to apply ('dark' or 'light')
   *
   * Sets the data-bs-theme attribute on the HTML element and updates
   * all theme toggle icons to match the current theme (🌙 for dark, ☀️ for light).
   * Also updates the logo image based on the theme.
   * Persists the choice to localStorage for future sessions.
   */
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      html.setAttribute('data-bs-theme', 'dark');
      iconSpans.forEach(icon => icon.textContent = '🌙');
      if (themeLogo) {
        themeLogo.src = 'img/logo-dark.png'; // Dark mode logo (white text)
      }
    } else {
      html.removeAttribute('data-bs-theme');
      iconSpans.forEach(icon => icon.textContent = '☀️');
      if (themeLogo) {
        themeLogo.src = 'img/logo-light.png'; // Light mode logo (black text)
      }
    }
    localStorage.setItem('theme', theme);
  };

  /**
   * Toggles between dark and light themes.
   *
   * Reads the current theme from the DOM and switches to the opposite theme.
   * Uses applyTheme() to apply the change and persist it.
   */
  const toggleDarkMode = () => {
    const currentTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  };

  // Initialize theme from localStorage (defaults to dark mode)
  const storedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(storedTheme);

  // Attach event listeners to toggle buttons
  if (darkModeToggleMobile) {
    darkModeToggleMobile.addEventListener('click', toggleDarkMode);
  }
  if (darkModeToggleDesktop) {
    darkModeToggleDesktop.addEventListener('click', toggleDarkMode);
  }
}