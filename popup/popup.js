'use strict';

const i18n = window.FishHookI18n;
const activatePageButton = document.getElementById('activate-page');
const openOptionsButton = document.getElementById('open-options');
const popupStatus = document.getElementById('popup-status');
const STORAGE_KEYS = {
  jiraUrl: 'fishhook.jiraBaseUrl',
  fisheyeUrl: 'fishhook.fisheyeBaseUrl',
};
let activeLanguage = i18n.AUTO_LANGUAGE;

function t(key) {
  return i18n.t(activeLanguage, key);
}

function applyPopupLanguage(language) {
  activeLanguage = language;
  const resolved = i18n.resolveLanguage(language);
  document.documentElement.lang = resolved;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = i18n.t(language, el.dataset.i18n);
  });
}

i18n.getStoredLanguage().then(applyPopupLanguage);

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

function originPattern(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return null;
  const url = new URL(normalized);
  return `${url.origin}/*`;
}

function setStatus(message, kind = 'info') {
  popupStatus.textContent = message || '';
  popupStatus.dataset.kind = kind;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getSettings() {
  const data = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));
  return {
    jiraUrl: normalizeBaseUrl(data[STORAGE_KEYS.jiraUrl]),
    fisheyeUrl: normalizeBaseUrl(data[STORAGE_KEYS.fisheyeUrl]),
  };
}

async function ensureOrigins(origins) {
  const uniqueOrigins = [...new Set(origins.filter(Boolean))];
  if (!uniqueOrigins.length) return false;
  const has = await chrome.permissions.contains({ origins: uniqueOrigins });
  if (has) return true;
  return chrome.permissions.request({ origins: uniqueOrigins });
}

async function activateCurrentPage() {
  setStatus('');
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus(t('popup.unsupportedPage'), 'error');
    return;
  }

  const settings = await getSettings();
  if (!settings.fisheyeUrl) {
    setStatus(t('popup.fisheyeUrlRequired'), 'error');
    return;
  }
  if (!settings.jiraUrl) {
    setStatus(t('popup.jiraUrlRequired'), 'error');
    return;
  }

  const tabOrigin = new URL(tab.url).origin;
  const fisheyeOrigin = new URL(settings.fisheyeUrl).origin;
  if (tabOrigin !== fisheyeOrigin) {
    setStatus(t('popup.notFisheyePage'), 'error');
    return;
  }

  const granted = await ensureOrigins([originPattern(settings.fisheyeUrl), originPattern(settings.jiraUrl)]);
  if (!granted) {
    setStatus(t('popup.permissionRequired'), 'error');
    return;
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/fisheye-content.css'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/description-renderer.js', 'content/fisheye-content.js'],
  });
  setStatus(t('popup.activated'), 'info');
}

activatePageButton.addEventListener('click', async () => {
  activatePageButton.disabled = true;
  try {
    await activateCurrentPage();
  } catch (error) {
    setStatus(t('popup.activateFailed'), 'error');
    console.warn('[fishhook][popup] activation failed', error);
  } finally {
    activatePageButton.disabled = false;
  }
});

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
