(function () {
  'use strict';

  if (window.__fishhookFisheyeContentLoaded) return;
  window.__fishhookFisheyeContentLoaded = true;

  const BUTTON_CLASS = 'fishhook-objectives-button';
  const ICON_CLASS = 'fishhook-objectives-button__icon';
  const FALLBACK_CLASS = 'fishhook-objectives-button--fallback';
  const OBJECTIVES_HEADING_SELECTOR = 'h4.overview-heading';
  const OBJECTIVES_EDIT_SELECTOR = 'a.edit-objectives.edit-link, a.edit-objectives';
  const FISHEYE_URL_STORAGE_KEY = 'fishhook.fisheyeBaseUrl';
  const JIRA_URL_STORAGE_KEY = 'fishhook.jiraBaseUrl';
  const LOG = '[fishhook][fisheye]';
  let objectivesMissingLogged = false;
  let objectivesBodyEl = null;
  let objectivesOriginalHtml = '';
  let objectivesInjected = false;

  const messages = {
    ko: {
      loadAriaLabel: 'Jira 내용 불러오기',
      loadTitle: 'Jira 내용을 Objectives에 표시',
      fallbackText: '내용 불러오기',
      loading: 'Jira 내용을 불러오는 중입니다.',
      restore: '원래 내용',
      previewBanner: 'Jira 내용 미리보기',
      openJira: 'Jira 열기',
      jiraUrlRequired: 'Jira 경로가 설정되어 있지 않습니다. 환경설정에서 Jira 경로를 먼저 입력해 주세요.',
      loginRequired: 'Jira에 로그인되어 있지 않습니다. Jira에 먼저 로그인한 뒤 다시 시도해 주세요.',
      issueKeyNotFound: 'Fisheye 화면에서 Jira 이슈 키를 찾지 못했습니다.',
      targetNotFound: 'Objectives 영역을 찾지 못했습니다.',
      loadFailed: 'Jira 내용을 불러오지 못했습니다.',
    },
    en: {
      loadAriaLabel: 'Load Jira content',
      loadTitle: 'Show Jira content in Objectives',
      fallbackText: 'Load content',
      loading: 'Loading Jira content.',
      restore: 'Restore original content',
      previewBanner: 'Jira content preview',
      openJira: 'Open Jira',
      jiraUrlRequired: 'The Jira URL is not set. Add the Jira URL in settings first.',
      loginRequired: 'You are not logged in to Jira. Log in to Jira first, then try again.',
      issueKeyNotFound: 'Could not find a Jira issue key on this Fisheye page.',
      targetNotFound: 'Could not find the Objectives area.',
      loadFailed: 'Could not load Jira content.',
    },
  };

  const ISSUE_KEY_AT_START_RE = /^\s*([A-Z][A-Z0-9]+-\d+)\b/i;
  const ISSUE_KEY_TOKEN_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/gi;

  function resolveLanguage() {
    const lang = String(document.documentElement.lang || navigator.language || '')
      .trim()
      .toLowerCase()
      .split('-')[0];
    return lang === 'ko' ? 'ko' : 'en';
  }

  function t(key) {
    return messages[resolveLanguage()][key] || messages.en[key] || key;
  }

  function getExtensionUrl(path) {
    try {
      if (chrome?.runtime?.getURL) return chrome.runtime.getURL(path);
    } catch (_) {}
    return path;
  }

  function normalizeBaseUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const url = new URL(withScheme);
      if (!url.hostname || !/^https?:$/.test(url.protocol)) return null;
      url.hash = '';
      url.search = '';
      url.pathname = '';
      return url.toString().replace(/\/$/, '');
    } catch (_) {
      return null;
    }
  }

  function isCurrentFisheyePage(fisheyeBaseUrl) {
    const normalized = normalizeBaseUrl(fisheyeBaseUrl);
    if (!normalized) return false;
    try {
      return window.location.origin === new URL(normalized).origin;
    } catch (_) {
      return false;
    }
  }

  async function getConfiguredFisheyeBaseUrl() {
    try {
      const data = await chrome.storage.sync.get(FISHEYE_URL_STORAGE_KEY);
      return data[FISHEYE_URL_STORAGE_KEY] || '';
    } catch (error) {
      console.warn(LOG, 'Failed to read Fisheye settings.', error);
      return '';
    }
  }

  async function getConfiguredJiraBaseUrl() {
    try {
      const data = await chrome.storage.sync.get(JIRA_URL_STORAGE_KEY);
      return normalizeBaseUrl(data[JIRA_URL_STORAGE_KEY]);
    } catch (error) {
      console.warn(LOG, 'Failed to read Jira settings.', error);
      return null;
    }
  }

  function logObjectivesMissing() {
    if (objectivesMissingLogged) return;
    objectivesMissingLogged = true;
    console.info(
      LOG,
      'Configured Fisheye page matched, but the Objectives heading/area was not found.',
      {
        url: window.location.href,
        headingSelector: OBJECTIVES_HEADING_SELECTOR,
        objectivesSelector: '#objectives-markup',
      }
    );
  }

  function isObjectivesHeading(heading) {
    const text = (heading.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^objectives\b/i.test(text)) return true;

    const root = heading.parentElement;
    if (!root) return false;
    return Boolean(
      root.querySelector('#objectives-markup') ||
        root.querySelector('.overview-content > #objectives-markup')
    );
  }

  function findObjectivesHeading() {
    const headings = document.querySelectorAll(OBJECTIVES_HEADING_SELECTOR);
    let objectivesFallback = null;
    let anyFallback = null;

    for (const heading of headings) {
      const editLink = heading.querySelector(OBJECTIVES_EDIT_SELECTOR);
      const match = { heading, editLink: editLink || null };

      if (editLink) {
        if (!objectivesFallback && isObjectivesHeading(heading)) return match;
        if (!anyFallback) anyFallback = match;
      }

      if (isObjectivesHeading(heading) && !objectivesFallback) {
        objectivesFallback = match;
      }
    }

    return objectivesFallback || anyFallback;
  }

  function findObjectivesMarkup() {
    return (
      document.querySelector('.overview-content > #objectives-markup') ||
      document.querySelector('#overview-content > #objectives-markup')
    );
  }

  function normalizeIssueKey(key) {
    return String(key || '').trim().toUpperCase();
  }

  function isFisheyeReviewKey(key) {
    return /^RGS-\d+$/i.test(normalizeIssueKey(key));
  }

  function pickJiraIssueKeyFromText(raw, preferStart) {
    const text = String(raw || '').trim();
    if (!text) return null;

    if (preferStart !== false) {
      const atStart = text.match(ISSUE_KEY_AT_START_RE);
      if (atStart) {
        const key = normalizeIssueKey(atStart[1]);
        if (!isFisheyeReviewKey(key)) return key;
      }
    }

    ISSUE_KEY_TOKEN_RE.lastIndex = 0;
    const keys = [];
    let match;
    while ((match = ISSUE_KEY_TOKEN_RE.exec(text)) !== null) {
      const key = normalizeIssueKey(match[1]);
      if (!isFisheyeReviewKey(key)) keys.push(key);
    }
    return keys.find((key) => /^GS-\d+$/.test(key)) || keys[0] || null;
  }

  function parseIssueKeyFromBrowseHref(href) {
    const match = String(href || '').match(/\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/i);
    if (!match) return null;
    const key = normalizeIssueKey(match[1]);
    return isFisheyeReviewKey(key) ? null : key;
  }

  function parseIssueKeyFromQueryHref(href) {
    try {
      const url = new URL(String(href || ''), window.location.href);
      const key = url.searchParams.get('key');
      if (!key) return null;
      const normalized = normalizeIssueKey(key);
      return /^[A-Z][A-Z0-9]+-\d+$/.test(normalized) && !isFisheyeReviewKey(normalized)
        ? normalized
        : null;
    } catch (_) {
      return null;
    }
  }

  function extractIssueKeyFromTitleContentLink() {
    const roots = document.querySelectorAll('.title-content, #title-content, [class*="title-content"]');
    for (const root of roots) {
      for (const link of root.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href') || link.href;
        const fromBrowse = parseIssueKeyFromBrowseHref(href);
        if (fromBrowse) return fromBrowse;
        const fromText = pickJiraIssueKeyFromText(link.textContent, true);
        if (fromText) return fromText;
        const fromQuery = parseIssueKeyFromQueryHref(href);
        if (fromQuery) return fromQuery;
      }
      const fromRoot = pickJiraIssueKeyFromText(root.textContent, true);
      if (fromRoot) return fromRoot;
    }
    return null;
  }

  function extractIssueKeyFromPage() {
    const fromTitleLink = extractIssueKeyFromTitleContentLink();
    if (fromTitleLink) return fromTitleLink;

    const candidates = [
      ...document.querySelectorAll(
        'h1, #overview h1, #overview .module-title, .review-title, #review-title, [class*="review-title"], .module-title'
      ),
    ];
    for (const candidate of candidates) {
      const key = pickJiraIssueKeyFromText(candidate.textContent, false);
      if (key) return key;
    }
    return pickJiraIssueKeyFromText(document.title, false);
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, kind = 'error') {
    let toast = document.getElementById('fishhook-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fishhook-toast';
      toast.className = 'fishhook-toast';
      toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      document.body.appendChild(toast);
    }
    toast.dataset.kind = kind;
    toast.textContent = message;
    toast.classList.add('fishhook-toast--visible');
    window.clearTimeout(toast._hideTimer);
    toast._hideTimer = window.setTimeout(() => {
      toast.classList.remove('fishhook-toast--visible');
    }, kind === 'error' ? 5200 : 3200);
  }

  function restoreObjectivesBody() {
    if (!objectivesBodyEl || !objectivesInjected) return;
    objectivesBodyEl.innerHTML = objectivesOriginalHtml;
    objectivesBodyEl.classList.remove('fishhook-objectives-host');
    objectivesBodyEl = null;
    objectivesOriginalHtml = '';
    objectivesInjected = false;
  }

  function buildOverviewBanner(issueKey, issueUrl, sourceLabel) {
    const source = sourceLabel
      ? `<span class="fishhook-objectives-banner__source">${escapeHtml(sourceLabel)}</span>`
      : '';
    const link = issueUrl
      ? `<a class="fishhook-objectives-banner__link" href="${escapeHtml(issueUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('openJira'))}</a>`
      : '';
    return (
      `<div class="fishhook-objectives-banner" role="status">` +
      `<span class="fishhook-objectives-banner__text">${escapeHtml(issueKey)} · ${escapeHtml(t('previewBanner'))}</span>` +
      source +
      link +
      `<button type="button" class="fishhook-objectives-restore">${escapeHtml(t('restore'))}</button>` +
      `</div>`
    );
  }

  function renderJiraBody(data) {
    const html = String(data.html || '').trim();
    const text = String(data.text || '').trim();
    if (html) {
      return window.FishHookDescriptionRenderer?.render
        ? window.FishHookDescriptionRenderer.render(html)
        : html;
    }
    if (text) return `<div class="fishhook-jira-content"><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`;
    return `<p>${escapeHtml(t('loadFailed'))}</p>`;
  }

  function showObjectivesContent(data, issueKey, issueUrl) {
    const host = objectivesBodyEl || findObjectivesMarkup();
    if (!host) {
      logObjectivesMissing();
      showToast(t('targetNotFound'), 'error');
      return false;
    }

    if (!objectivesInjected) {
      objectivesBodyEl = host;
      objectivesOriginalHtml = host.innerHTML;
      objectivesInjected = true;
    }

    host.classList.add('fishhook-objectives-host');
    const sourceLabel = data.loading ? t('loading') : data.source || '';
    host.innerHTML =
      buildOverviewBanner(issueKey, issueUrl || data.issueUrl, sourceLabel) +
      `<div class="fishhook-objectives-content markup">${renderJiraBody(data)}</div>`;

    host.querySelector('.fishhook-objectives-restore')?.addEventListener('click', restoreObjectivesBody);
    return true;
  }

  async function fetchJiraContent(issueKey) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'FISHHOOK_FETCH_JIRA_CONTENT', issueKey }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'NO_RESPONSE' });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  function showFetchError(result) {
    if (result.error === 'JIRA_URL_NOT_CONFIGURED') {
      showToast(t('jiraUrlRequired'), 'error');
      return;
    }
    if (result.error === 'JIRA_LOGIN_REQUIRED' || result.error === 'JIRA_PERMISSION_REQUIRED') {
      showToast(t('loginRequired'), 'error');
      return;
    }
    showToast(t('loadFailed'), 'error');
  }

  async function loadJiraIntoObjectives(button) {
    const jiraBaseUrl = await getConfiguredJiraBaseUrl();
    if (!jiraBaseUrl) {
      showToast(t('jiraUrlRequired'), 'error');
      return;
    }

    const issueKey = extractIssueKeyFromPage();
    if (!issueKey) {
      showToast(t('issueKeyNotFound'), 'error');
      return;
    }

    const issueUrl = `${jiraBaseUrl}/browse/${encodeURIComponent(issueKey)}`;
    restoreObjectivesBody();
    showObjectivesContent({ loading: true, text: t('loading') }, issueKey, issueUrl);

    const result = await fetchJiraContent(issueKey);
    if (!result.ok) {
      restoreObjectivesBody();
      showFetchError(result);
      return;
    }
    showObjectivesContent(result, issueKey, result.issueUrl || issueUrl);
  }

  function setButtonBusy(button, busy) {
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.disabled = busy;
  }

  function renderFallbackText(button) {
    button.classList.add(FALLBACK_CLASS);
    button.textContent = t('fallbackText');
  }

  function renderIcon(button) {
    const iconUrl = getExtensionUrl('icons/icon512.png');
    const probe = new Image();

    probe.onload = () => {
      if (!button.isConnected || button.classList.contains(FALLBACK_CLASS)) return;
      const icon = document.createElement('span');
      icon.className = ICON_CLASS;
      icon.setAttribute('aria-hidden', 'true');
      icon.style.maskImage = `url("${iconUrl}")`;
      icon.style.webkitMaskImage = `url("${iconUrl}")`;
      button.textContent = '';
      button.appendChild(icon);
    };

    probe.onerror = () => {
      if (!button.isConnected) return;
      renderFallbackText(button);
    };

    probe.src = iconUrl;
  }

  function createObjectivesButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', t('loadAriaLabel'));
    button.title = t('loadTitle');
    renderIcon(button);

    button.addEventListener('click', async () => {
      if (button.getAttribute('aria-busy') === 'true') return;
      setButtonBusy(button, true);
      try {
        await loadJiraIntoObjectives(button);
      } finally {
        setButtonBusy(button, false);
      }
    });

    return button;
  }

  function injectObjectivesButton() {
    const found = findObjectivesHeading();
    if (!found) {
      logObjectivesMissing();
      return false;
    }

    const { heading, editLink } = found;
    if (heading.querySelector(`.${BUTTON_CLASS}`)) return true;

    const button = createObjectivesButton();
    if (editLink) {
      editLink.insertAdjacentElement('afterend', button);
    } else {
      heading.appendChild(button);
    }
    return true;
  }

  function scheduleInject() {
    window.clearTimeout(scheduleInject.timer);
    scheduleInject.timer = window.setTimeout(injectObjectivesButton, 120);
  }

  window.FishHookObjectivesButton = {
    inject: injectObjectivesButton,
  };

  async function init() {
    const fisheyeBaseUrl = await getConfiguredFisheyeBaseUrl();
    if (!fisheyeBaseUrl) return;
    if (!isCurrentFisheyePage(fisheyeBaseUrl)) return;

    injectObjectivesButton();

    const observer = new MutationObserver(scheduleInject);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  init().catch((error) => {
    console.warn(LOG, 'Failed to initialize Fisheye content script.', error);
  });
})();
