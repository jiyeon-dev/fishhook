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

  // Mirrors `arrayBufferToBase64` in background.js — see the note there for why
  // the bytes cross the message boundary as a string.
  function base64ToBlob(base64, contentType) {
    const binary = atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType || 'application/octet-stream' });
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
          resolve(base64ToBlob(response.base64, response.contentType));
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

  window.FishHookMediaLoader = { hydrate, fetchBlob: fetchAttachmentBlob, base64ToBlob };
})();
