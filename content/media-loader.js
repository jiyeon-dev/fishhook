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

  function fetchAttachmentBlob(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'FISHHOOK_FETCH_JIRA_ATTACHMENT', url }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || 'FETCH_FAILED'));
            return;
          }
          resolve(
            new Blob([response.buffer], {
              type: response.contentType || 'application/octet-stream',
            })
          );
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function hydrateElement(el) {
    const url = String(el.getAttribute('data-fishhook-media-url') || '').trim();
    if (!url || el.dataset.fishhookMediaHydrated === 'true') return;

    if (el.tagName === 'IMG' && String(el.getAttribute('src') || '').trim()) return;

    el.dataset.fishhookMediaHydrated = 'pending';

    try {
      const blob = await fetchAttachmentBlob(url);
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
