(function () {
  'use strict';

  if (window.FishHookImageLightbox) return;

  const PREVIEW_ROOT_SELECTOR = '.fishhook-objectives-inject, .fishhook-desc-panel__body';
  let closeAria = 'Close';
  let overlay = null;
  let keyDownHandler = null;
  let listenerReady = false;

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function isZoomableImage(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (!img.closest(PREVIEW_ROOT_SELECTOR)) return false;
    if (img.closest('.fishhook-image-lightbox')) return false;
    if (img.classList.contains('fishhook-jira-media--loading')) return false;
    if (img.classList.contains('fishhook-jira-media--failed')) return false;

    const src = String(img.currentSrc || img.getAttribute('src') || '').trim();
    return Boolean(src);
  }

  function ensureOverlay() {
    if (overlay) {
      overlay.querySelector('.fishhook-image-lightbox__close')?.setAttribute('aria-label', closeAria);
      overlay.setAttribute('aria-label', closeAria);
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'fishhook-image-lightbox';
    overlay.className = 'fishhook-image-lightbox';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', closeAria);
    overlay.innerHTML =
      `<button type="button" class="fishhook-image-lightbox__close" aria-label="${escapeAttr(closeAria)}">×</button>` +
      `<img class="fishhook-image-lightbox__img" alt="" />`;

    overlay.querySelector('.fishhook-image-lightbox__close')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('fishhook-image-lightbox--open');
    document.body.classList.remove('fishhook-image-lightbox-active');

    const img = overlay.querySelector('.fishhook-image-lightbox__img');
    if (img) {
      img.removeAttribute('src');
      img.alt = '';
    }

    if (keyDownHandler) {
      document.removeEventListener('keydown', keyDownHandler);
      keyDownHandler = null;
    }
  }

  function open(img) {
    const layer = ensureOverlay();
    const lite = layer.querySelector('.fishhook-image-lightbox__img');
    if (!lite) return;

    lite.src = img.currentSrc || img.src;
    lite.alt = img.getAttribute('alt') || '';
    layer.hidden = false;
    layer.classList.add('fishhook-image-lightbox--open');
    document.body.classList.add('fishhook-image-lightbox-active');
    layer.querySelector('.fishhook-image-lightbox__close')?.focus();

    if (!keyDownHandler) {
      keyDownHandler = (event) => {
        if (event.key === 'Escape') close();
      };
      document.addEventListener('keydown', keyDownHandler);
    }
  }

  function onPreviewClick(event) {
    const img = event.target.closest('img');
    if (!isZoomableImage(img)) return;

    event.preventDefault();
    event.stopPropagation();
    open(img);
  }

  function ensureListener() {
    if (listenerReady) return;
    listenerReady = true;
    document.addEventListener('click', onPreviewClick, true);
  }

  function attach(_root, options = {}) {
    if (options.closeAria) closeAria = options.closeAria;
    ensureListener();
  }

  window.FishHookImageLightbox = { attach, close };
})();
