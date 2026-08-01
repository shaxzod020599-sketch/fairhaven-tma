/**
 * Cache-bust guard. Runs before any application bundle.
 *
 * Lives in its own file rather than inline in index.html so the Content
 * Security Policy can forbid inline scripts entirely: with `script-src 'self'
 * https://telegram.org` and no 'unsafe-inline', an injected <script> cannot
 * execute. The build id arrives on the script tag's data attribute, which is
 * markup rather than code and so is unaffected.
 *
 * Loaded without defer/async so it completes before the module bundle starts.
 */
(function () {
  try {
    var tag = document.currentScript;
    var buildId = (tag && tag.dataset && tag.dataset.buildId) || '';
    if (!buildId || buildId === '__BUILD_ID__') return;

    var storageKey = 'fh-build-id';
    var reloadFlag = 'fh-reloaded-at';
    var saved = localStorage.getItem(storageKey);
    if (saved === buildId) return;

    // New build (or first visit) — drop any cached assets.
    if (window.caches && caches.keys) {
      caches.keys()
        .then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); })
        .catch(function () {});
    }
    localStorage.setItem(storageKey, buildId);

    // Reload once per build id. Without this guard a device whose storage is
    // wiped on every load would reload forever.
    var lastReload = sessionStorage.getItem(reloadFlag);
    if (saved !== null && lastReload !== buildId) {
      sessionStorage.setItem(reloadFlag, buildId);
      window.location.replace(window.location.pathname + '?v=' + buildId);
    }
  } catch (e) {
    // Private mode blocks storage; a stale cache is better than a blank page.
  }
})();
