(function () {
  'use strict';

  if (window.FishHookMediaLoader) return;

  const hydratedUrls = new WeakMap();

  function revokeObjectUrl(el) {
    const previous = hydratedUrls.get(el);
    if (previous) {
      URL.revokeObjectURL(previous);
      hydratedUrls.delete(el);
    }
  }

  async function hydrateElement(el) {
    const url = String(el.getAttribute('data-fishhook-media-url') || '').trim();
    if (!url || el.dataset.fishhookMediaHydrated === 'true') return;

    el.dataset.fishhookMediaHydrated = 'pending';

    try {
      const response = await fetch(url, {
        credentials: 'include',
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      revokeObjectUrl(el);
      const objectUrl = URL.createObjectURL(blob);
      hydratedUrls.set(el, objectUrl);

      if (el.tagName === 'VIDEO') {
        el.src = objectUrl;
      } else if (el.tagName === 'IMG') {
        el.src = objectUrl;
      } else if (el.tagName === 'A') {
        el.dataset.fishhookMediaHydrated = 'true';
        return;
      }

      el.dataset.fishhookMediaHydrated = 'true';
      el.classList.remove('fishhook-jira-media--loading');
    } catch (error) {
      el.dataset.fishhookMediaHydrated = 'error';
      el.classList.add('fishhook-jira-media--failed');
      console.warn('[fishhook][media] Failed to load attachment.', { url, error: String(error) });
    }
  }

  async function hydrate(root) {
    if (!root) return;
    const elements = root.querySelectorAll('[data-fishhook-media-url]');
    await Promise.all([...elements].map((el) => hydrateElement(el)));
  }

  window.FishHookMediaLoader = { hydrate };
})();
