// Function to toggle dark mode
const darkModeToggle = document.getElementById('darkModeToggle');

if (darkModeToggle) {
  const toggleDarkMode = () => {
    const html = document.querySelector('html');
    const currentTheme = html.getAttribute('data-bs-theme');

    if (currentTheme === 'dark') {
      html.removeAttribute('data-bs-theme');
      darkModeToggle.textContent = 'Dark Mode';
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-bs-theme', 'dark');
      darkModeToggle.textContent = 'Light Mode';
      localStorage.setItem('theme', 'dark');
    }
  };

  const storedTheme = localStorage.getItem('theme');
  const html = document.querySelector('html');

  if (storedTheme) {
    html.setAttribute('data-bs-theme', storedTheme);
    darkModeToggle.textContent = storedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  } else {
    html.setAttribute('data-bs-theme', 'dark');
    darkModeToggle.textContent = 'Light Mode';
    localStorage.setItem('theme', 'dark');
  }

  darkModeToggle.addEventListener('click', toggleDarkMode);
}