// Function to toggle dark mode
const darkModeToggle = document.getElementById('darkModeToggle');

if (darkModeToggle) {
  const html = document.documentElement;
  const iconSpan = document.getElementById('darkModeIcon');

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      html.setAttribute('data-bs-theme', 'dark');
      if (iconSpan) iconSpan.textContent = '🌙';   // dark = luna
    } else {
      html.removeAttribute('data-bs-theme');       // light = default
      if (iconSpan) iconSpan.textContent = '☀️';   // light = sole
    }
    localStorage.setItem('theme', theme);
  };

  const toggleDarkMode = () => {
    const currentTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  };

  // init da localStorage (default: dark)
  const storedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(storedTheme);

  darkModeToggle.addEventListener('click', toggleDarkMode);
}