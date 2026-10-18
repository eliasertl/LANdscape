// Applies the stored theme before first paint to avoid a flash. Loaded as an
// external script because the CSP forbids inline scripts.
(function () {
  try {
    var stored = localStorage.getItem('landscape.theme') || 'system';
    var dark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
