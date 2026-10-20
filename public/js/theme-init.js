/* Blocking, tiny: applies the saved theme before first paint so there is no flash. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('asb:settings:v1') || '{}')
    var t = s.theme === 'light' || s.theme === 'dark' ? s.theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.dataset.theme = t
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#0a1a20' : '#0c4a3c'
  } catch (e) { document.documentElement.dataset.theme = 'light' }
})()
