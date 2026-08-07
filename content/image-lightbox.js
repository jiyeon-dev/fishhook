(function () {
  'use strict';

  if (window.FishHookImageLightbox) return;

  const PREVIEW_ROOT_SELECTOR = '.fishhook-objectives-inject, .fishhook-desc-panel__body';
  let closeAria = 'Close';
  let overlay = null;
  let keyDownHandler = null;
  let listenerReady = false;
  let onCloseCallback = null;

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
      `<div class="fishhook-image-lightbox__stage"></div>`;

    overlay.querySelector('.fishhook-image-lightbox__close')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.classList?.contains('fishhook-image-lightbox__stage')) {
        close();
      }
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('fishhook-image-lightbox--open');
    document.body.classList.remove('fishhook-image-lightbox-active');

    const stage = overlay.querySelector('.fishhook-image-lightbox__stage');
    if (stage) stage.innerHTML = '';

    if (keyDownHandler) {
      document.removeEventListener('keydown', keyDownHandler);
      keyDownHandler = null;
    }

    // Lets the opener release blob URLs it created for the preview.
    const callback = onCloseCallback;
    onCloseCallback = null;
    if (typeof callback === 'function') {
      try {
        callback();
      } catch (_) {}
    }
  }

  // Shows an arbitrary element (image, iframe, <pre>) in the same overlay so the
  // close affordances stay identical across attachment types.
  function openNode(node, options = {}) {
    if (!node) return;
    const layer = ensureOverlay();
    const stage = layer.querySelector('.fishhook-image-lightbox__stage');
    if (!stage) return;

    onCloseCallback = typeof options.onClose === 'function' ? options.onClose : null;

    stage.innerHTML = '';
    stage.appendChild(node);
    layer.setAttribute('aria-label', options.label || closeAria);
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

  function open(img) {
    const lite = document.createElement('img');
    lite.className = 'fishhook-image-lightbox__img';
    lite.src = img.currentSrc || img.src;
    lite.alt = img.getAttribute('alt') || '';
    openNode(lite, { label: lite.alt || closeAria });
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

  window.FishHookImageLightbox = { attach, close, openNode };
})();
