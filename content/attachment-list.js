(function () {
  'use strict';

  if (window.FishHookAttachmentList) return;

  const LOG = '[fishhook][attachments]';
  const LIST_CLASS = 'fishhook-attachments';
  const LINK_CLASS = 'fishhook-attachments__link';

  // Text-ish files we can show as-is. Jira often reports `application/octet-stream`
  // for .md/.log uploads, so the extension is checked before the MIME type.
  const TEXT_EXTENSIONS = new Set([
    'md', 'markdown', 'txt', 'text', 'log', 'json', 'csv', 'tsv', 'diff', 'patch',
    'yml', 'yaml', 'xml', 'ini', 'conf', 'cfg', 'properties', 'sh', 'bat', 'sql',
    'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'htm', 'java', 'py', 'go', 'rb', 'c',
    'h', 'cpp', 'cs', 'kt', 'swift', 'php', 'pl', 'lua', 'toml', 'env',
  ]);

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

  // The image icon carries U+FE0F: U+1F5BC alone falls back to a monochrome
  // glyph on Windows while the other three render in colour.
  const KIND_ICONS = { image: '🖼️', pdf: '📕', text: '📄', download: '📦' };

  const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function extensionOf(filename) {
    const match = /\.([A-Za-z0-9]+)$/.exec(String(filename || '').trim());
    return match ? match[1].toLowerCase() : '';
  }

  function classify(attachment) {
    const mime = String(attachment?.mimeType || '').toLowerCase();
    const ext = extensionOf(attachment?.filename);

    if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (mime.startsWith('text/')) return 'text';
    if (mime === 'application/json' || mime === 'application/xml') return 'text';
    return 'download';
  }

  function formatSize(bytes) {
    // `parseAttachmentList` uses null for "size unknown"; Number(null) is 0, so
    // the absent case has to be rejected before the numeric conversion.
    if (bytes === null || bytes === undefined || bytes === '') return '';
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Jira returns ISO 8601 with an offset; the leading date is all we show, so
  // slicing avoids dragging the viewer's timezone into a rendered string.
  function formatDate(created) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(created || '').trim());
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }

  function buildItem(attachment) {
    const kind = classify(attachment);
    const meta = [formatSize(attachment?.size), formatDate(attachment?.created)]
      .filter(Boolean)
      .join(' · ');

    return (
      `<li class="fishhook-attachments__item">` +
      `<button type="button" class="${LINK_CLASS}"` +
      ` data-fishhook-attachment-url="${escapeHtml(attachment.url)}"` +
      ` data-fishhook-attachment-name="${escapeHtml(attachment.filename)}"` +
      ` data-fishhook-attachment-kind="${escapeHtml(kind)}"` +
      ` data-fishhook-attachment-mime="${escapeHtml(attachment.mimeType || '')}">` +
      `<span class="fishhook-attachments__icon" aria-hidden="true">${KIND_ICONS[kind]}</span>` +
      `<span class="fishhook-attachments__name">${escapeHtml(attachment.filename)}</span>` +
      `</button>` +
      (meta ? `<span class="fishhook-attachments__meta">${escapeHtml(meta)}</span>` : '') +
      `</li>`
    );
  }

  // Every attachment is listed, including ones already rendered inline in the
  // body — the point of the section is "nothing is hidden", so a silent inline
  // matching failure must not also drop the file from this list.
  function build(attachments, labels = {}) {
    const list = Array.isArray(attachments) ? attachments.filter((item) => item?.filename && item?.url) : [];
    if (!list.length) return '';

    const title = labels.attachmentsTitle || 'Attachments';
    return (
      `<hr class="${LIST_CLASS}__rule">` +
      `<div class="${LIST_CLASS}">` +
      `<div class="${LIST_CLASS}__title">${escapeHtml(title)} (${list.length})</div>` +
      `<ul class="${LIST_CLASS}__list">${list.map(buildItem).join('')}</ul>` +
      `</div>`
    );
  }

  function fetchBlob(url) {
    const loader = window.FishHookMediaLoader;
    if (!loader?.fetchBlob) return Promise.reject(new Error('MEDIA_LOADER_UNAVAILABLE'));
    return loader.fetchBlob(url);
  }

  function triggerDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename || 'attachment';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  function buildImagePreview(objectUrl, filename) {
    const img = document.createElement('img');
    img.className = 'fishhook-image-lightbox__img';
    img.src = objectUrl;
    img.alt = filename;
    return img;
  }

  // A page CSP with a restrictive `frame-src` can block the blob: iframe. The
  // "open in a new tab" link is the escape hatch when that happens.
  function buildPdfPreview(objectUrl, filename, labels) {
    const wrapper = document.createElement('div');
    wrapper.className = 'fishhook-attachment-preview fishhook-attachment-preview--pdf';

    const bar = document.createElement('div');
    bar.className = 'fishhook-attachment-preview__bar';
    bar.appendChild(document.createTextNode(filename));

    const openLink = document.createElement('a');
    openLink.className = 'fishhook-attachment-preview__open';
    openLink.href = objectUrl;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = labels.attachmentOpenInTab || 'Open in a new tab';
    bar.appendChild(openLink);

    const frame = document.createElement('iframe');
    frame.className = 'fishhook-attachment-preview__frame';
    frame.src = objectUrl;
    frame.title = filename;

    wrapper.appendChild(bar);
    wrapper.appendChild(frame);
    return wrapper;
  }

  function buildTextPreview(text, filename) {
    const wrapper = document.createElement('div');
    wrapper.className = 'fishhook-attachment-preview fishhook-attachment-preview--text';

    const bar = document.createElement('div');
    bar.className = 'fishhook-attachment-preview__bar';
    bar.textContent = filename;

    // Raw text on purpose: there is no markdown renderer here, and showing the
    // source keeps .md, .log and .diff behaving identically.
    const pre = document.createElement('pre');
    pre.className = 'fishhook-attachment-preview__text';
    pre.textContent = text;

    wrapper.appendChild(bar);
    wrapper.appendChild(pre);
    return wrapper;
  }

  async function openPreview(target, labels) {
    const url = target.getAttribute('data-fishhook-attachment-url') || '';
    const filename = target.getAttribute('data-fishhook-attachment-name') || '';
    const kind = target.getAttribute('data-fishhook-attachment-kind') || 'download';
    if (!url) return;

    target.classList.add('fishhook-attachments__link--busy');
    try {
      const blob = await fetchBlob(url);

      if (kind === 'text') {
        if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
          triggerDownload(blob, filename);
          return;
        }
        const text = new TextDecoder('utf-8').decode(await blob.arrayBuffer());
        window.FishHookImageLightbox?.openNode(buildTextPreview(text, filename), { label: filename });
        return;
      }

      if (kind === 'image' || kind === 'pdf') {
        const objectUrl = URL.createObjectURL(blob);
        const node =
          kind === 'image'
            ? buildImagePreview(objectUrl, filename)
            : buildPdfPreview(objectUrl, filename, labels);
        window.FishHookImageLightbox?.openNode(node, {
          label: filename,
          onClose: () => URL.revokeObjectURL(objectUrl),
        });
        return;
      }

      triggerDownload(blob, filename);
    } catch (error) {
      console.warn(LOG, 'Failed to open attachment.', { url, error: String(error) });
      if (typeof labels.onError === 'function') labels.onError(error);
    } finally {
      target.classList.remove('fishhook-attachments__link--busy');
    }
  }

  function attach(root, labels = {}) {
    if (!root || root.dataset?.fishhookAttachmentsBound === 'true') return;
    const list = root.querySelector(`.${LIST_CLASS}`);
    if (!list) return;
    if (root.dataset) root.dataset.fishhookAttachmentsBound = 'true';

    root.addEventListener('click', (event) => {
      const target = event.target.closest(`.${LINK_CLASS}`);
      if (!target || !root.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      openPreview(target, labels);
    });
  }

  window.FishHookAttachmentList = { build, attach, classify, formatSize, formatDate };
})();
