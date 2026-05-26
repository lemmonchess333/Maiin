/**
 * Pre-React boot script. Two jobs:
 *   1. Apply dark mode synchronously before the first paint so users
 *      with the dark preference don't see a flash of light theme.
 *   2. Restore the route from the query string set by 404.html (the
 *      GitHub Pages SPA redirect hack).
 *
 * 2026-05-26 audit PR 4 (finding #9) — moved out of an inline
 * `<script>` block in index.html so the page CSP can drop
 * `'unsafe-inline'` from `script-src`. Inline scripts are XSS
 * amplifiers; an external file works because we control the path
 * and the file lives in our `public/` (copied verbatim by Vite to
 * the output bucket). `<script src="...">` without async/defer
 * preserves the synchronous before-paint behaviour the inline
 * script had.
 */
(function () {
  var d = localStorage.getItem("tropos-dark-mode");
  if (
    d === "true" ||
    (d === null && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }
  // GitHub Pages SPA redirect: restore route from query string set by 404.html
  (function (l) {
    if (l.search[1] === "/") {
      var decoded = l.search
        .slice(1)
        .split("&")
        .map(function (s) {
          return s.replace(/~and~/g, "&");
        })
        .join("?");
      window.history.replaceState(
        null,
        null,
        l.pathname.slice(0, -1) + decoded + l.hash
      );
    }
  })(window.location);
})();
