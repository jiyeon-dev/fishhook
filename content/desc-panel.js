(function () {
  'use strict';

  if (window.FishHookDescPanel) return;

  const PANEL_ID = 'fishhook-desc-panel';
  const SIZE_KEY = 'fishhook.descPanelSize';
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 240;
  const DEFAULT_WIDTH = 480;
  const DEFAULT_HEIGHT = 420;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clampSize(width, height) {
    const maxW = Math.max(MIN_WIDTH, window.innerWidth - 32);
    const maxH = Math.max(MIN_HEIGHT, window.innerHeight - 48);
    return {
      width: Math.min(maxW, Math.max(MIN_WIDTH, Math.round(width))),
      height: Math.min(maxH, Math.max(MIN_HEIGHT, Math.round(height))),
    };
  }

  function loadSize() {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return clampSize(parsed.width, parsed.height);
        }
      }
    } catch (_) {}
    return clampSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }

  function saveSize(width, height) {
    try {
      const size = clampSize(width, height);
      localStorage.setItem(SIZE_KEY, JSON.stringify(size));
    } catch (_) {}
  }

  function applySize(panel) {
    if (!panel) return;
    const size = loadSize();
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
  }

  function attachResize(panel, labels) {
    if (!panel || panel.querySelector('.fishhook-desc-panel__resize')) return;

    const handle = document.createElement('div');
    handle.className = 'fishhook-desc-panel__resize';
    handle.title = labels.resizeTitle || '';
    handle.setAttribute('aria-label', labels.resizeAria || '');
    panel.appendChild(handle);

    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    function onPointerMove(event) {
      const size = clampSize(startW + (startX - event.clientX), startH + (startY - event.clientY));
      panel.style.width = `${size.width}px`;
      panel.style.height = `${size.height}px`;
    }

    function onPointerUp() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.classList.remove('fishhook-desc-panel--resizing');
      saveSize(panel.offsetWidth, panel.offsetHeight);
    }

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      startX = event.clientX;
      startY = event.clientY;
      startW = panel.offsetWidth;
      startH = panel.offsetHeight;
      document.body.classList.add('fishhook-desc-panel--resizing');
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  }

  // The issue key in the header doubles as the Jira link; `url` is omitted while
  // loading or on failure, when the source text is not an issue key.
  function setPanelSource(panel, text, url, title) {
    const source = panel?.querySelector('.fishhook-desc-panel__source');
    if (!source) return;
    source.textContent = '';
    if (!url) {
      source.textContent = String(text || '');
      return;
    }
    const link = document.createElement('a');
    link.className = 'fishhook-desc-panel__source-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (title) link.title = title;
    link.textContent = String(text || '');
    source.appendChild(link);
  }

  // Issue type / status / Fix versions / Affects versions, same fields and markup
  // as the Objectives banner. Hidden while loading and on failure, when there are
  // no field values to show.
  // The panel is narrow, so the fields break into two lines — issue type/status,
  // then the version groups — instead of wrapping wherever the width runs out.
  function setPanelMeta(panel, data, labels) {
    const row = panel?.querySelector('.fishhook-desc-panel__meta');
    if (!row) return;
    const meta = window.FishHookIssueMeta;
    const entries =
      data && !data.loading && meta?.hasFields(data) ? meta.buildEntries(data, labels) : [];
    if (!entries.length) {
      row.innerHTML = '';
      row.hidden = true;
      return;
    }
    const separator = `<span class="fishhook-desc-panel__meta-sep" aria-hidden="true">·</span>`;
    row.innerHTML = ['issue', 'versions']
      .map((group) => entries.filter((entry) => entry.group === group))
      .filter((line) => line.length)
      .map(
        (line) =>
          `<div class="fishhook-desc-panel__meta-line">` +
          line.map((entry) => entry.html).join(separator) +
          `</div>`
      )
      .join('');
    row.hidden = false;
  }

  function wrapJiraMarkup(innerHtml) {
    return (
      `<div class="fishhook-objectives-inject markup">` +
      `<div class="fishhook-objectives-body--adf">${innerHtml}</div>` +
      `</div>`
    );
  }

  function fillBody(body, data, labels, jiraHost) {
    if (!body) return;

    if (data.loading) {
      body.innerHTML =
        `<p class="wiki-p fishhook-desc-panel__loading">${escapeHtml(labels.loading)}` +
        `<br><small>${escapeHtml(labels.loadingHint)}</small></p>`;
      return;
    }

    const html = data.html && String(data.html).trim();
    const text = data.text && String(data.text).trim();

    if (html) {
      const rendered = window.FishHookDescriptionRenderer?.render
        ? window.FishHookDescriptionRenderer.render(html, { videoMode: 'placeholder' })
        : html;
      const visibleLen = String(rendered).replace(/<[^>]+>/g, '').trim().length;
      if ((!visibleLen || visibleLen < 3) && text) {
        body.innerHTML = wrapJiraMarkup(
          `<div class="wiki-content fishhook-desc-panel__fallback"><p class="wiki-p">${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`
        );
      } else {
        body.innerHTML = wrapJiraMarkup(rendered);
      }
    } else if (text) {
      body.innerHTML = wrapJiraMarkup(
        `<div class="wiki-content"><p class="wiki-p">${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`
      );
    } else {
      const host = escapeHtml(jiraHost || 'Jira');
      body.innerHTML =
        `<p class="wiki-p fishhook-desc-panel__empty">${escapeHtml(labels.emptyIntro)}<br><br>` +
        `${escapeHtml(labels.emptyLoginPrefix)}(<code>${host}</code>)${escapeHtml(labels.emptyLoginSuffix)}<br>` +
        `${escapeHtml(labels.emptyBrowseHint)}</p>`;
    }

    const attachmentsHtml = window.FishHookAttachmentList?.build
      ? window.FishHookAttachmentList.build(data.attachments, labels)
      : '';
    if (attachmentsHtml) body.insertAdjacentHTML('beforeend', attachmentsHtml);

    window.FishHookMediaLoader?.hydrate(body)?.catch((error) => {
      console.warn('[fishhook][desc-panel] Failed to hydrate Jira media.', error);
    });

    window.FishHookImageLightbox?.attach(body, { closeAria: labels.closeAria });
    window.FishHookAttachmentList?.attach(body, labels);
  }

  function resolvePanelTitle(issueTitle, issueKey, loading, labels) {
    const title = String(issueTitle || '').trim();
    if (title) return title;
    if (loading) return labels.titleLoading || issueKey || '';
    return issueKey || '';
  }

  function setPanelTitle(panel, title, issueKey) {
    const titleEl = panel?.querySelector('.fishhook-desc-panel__title');
    if (!titleEl) return;
    titleEl.textContent = String(title || issueKey || '').trim();
  }

  function hide() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function isVisible() {
    return Boolean(document.getElementById(PANEL_ID));
  }

  function show(options) {
    const { issueKey, issueTitle, issueUrl, loading, labels, jiraHost } = options || {};
    hide();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'fishhook-desc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', labels.dialogAria || 'Jira Description preview');

    const displayTitle = resolvePanelTitle(issueTitle, issueKey, loading, labels);
    const sourceLabel = loading ? labels.sourceLoading : issueKey || labels.sourceDefault;

    panel.innerHTML =
      `<div class="fishhook-desc-panel__header">` +
      `<div class="fishhook-desc-panel__title-wrap">` +
      `<span class="fishhook-desc-panel__title">${escapeHtml(displayTitle)}</span>` +
      `<span class="fishhook-desc-panel__source"></span>` +
      `</div>` +
      `<button type="button" class="fishhook-desc-panel__close" title="${escapeHtml(labels.closeTitle)}" aria-label="${escapeHtml(labels.closeAria)}">×</button>` +
      `</div>` +
      `<div class="fishhook-desc-panel__meta" hidden></div>` +
      `<div class="fishhook-desc-panel__body-label">${escapeHtml(labels.bodyLabel)}</div>` +
      `<div class="fishhook-desc-panel__body"></div>`;

    setPanelSource(
      panel,
      sourceLabel,
      !loading && issueKey && issueUrl ? issueUrl : '',
      labels.openJira
    );

    const body = panel.querySelector('.fishhook-desc-panel__body');
    fillBody(body, { loading: Boolean(loading), html: '', text: '' }, labels, jiraHost);

    panel.querySelector('.fishhook-desc-panel__close')?.addEventListener('click', hide);

    document.body.appendChild(panel);
    applySize(panel);
    attachResize(panel, labels);
    return panel;
  }

  function updateAfterFetch(data, payload, labels, jiraHost, issueUrl) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;

    const issueKey = data?.issueKey || '';
    const issueTitle = data?.issueTitle || payload?.issueTitle || '';
    setPanelTitle(panel, issueTitle, issueKey);

    if (data?.loading) {
      setPanelSource(panel, labels.sourceLoading, '');
    } else if (data?.ok) {
      setPanelSource(
        panel,
        issueKey || labels.sourceDefault,
        issueKey && issueUrl ? issueUrl : '',
        labels.openJira
      );
    } else {
      setPanelSource(panel, labels.sourceFailed, '');
    }
    setPanelMeta(panel, data, labels);
    fillBody(panel.querySelector('.fishhook-desc-panel__body'), payload, labels, jiraHost);
    return panel;
  }

  window.FishHookDescPanel = {
    PANEL_ID,
    hide,
    show,
    updateAfterFetch,
    isVisible,
  };
})();
