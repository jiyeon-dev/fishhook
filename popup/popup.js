'use strict';

const i18n = window.FishHookI18n;
const openOptionsButton = document.getElementById('open-options');
const showDescriptionButton = document.getElementById('show-description');
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

function describePreviewError(res, lastErrorMsg) {
  if (lastErrorMsg === 'UNSUPPORTED_PAGE' || res?.error === 'UNSUPPORTED_PAGE') {
    return t('popup.errors.unsupportedPage');
  }
  if (
    lastErrorMsg &&
    (/Receiving end does not exist|Could not establish connection/i.test(lastErrorMsg) || !res)
  ) {
    return t('popup.errors.connectionFailed').replace('{detail}', lastErrorMsg || '');
  }
  if (res?.error === 'ISSUE_KEY_NOT_FOUND') {
    return t('popup.errors.issueKeyNotFound');
  }
  if (res?.error === 'JIRA_URL_NOT_CONFIGURED') {
    return t('popup.errors.jiraUrlRequired');
  }
  if (res?.error === 'DESCRIPTION_NOT_FOUND') {
    return t('popup.errors.descriptionNotFound');
  }
  if (res?.error === 'JIRA_LOGIN_REQUIRED' || res?.error === 'JIRA_PERMISSION_REQUIRED') {
    return t('popup.errors.loginRequired');
  }
  if (res?.error === 'PREVIEW_ERROR') {
    const hint = res.detail ? `\n\n(${res.detail})` : '';
    return t('popup.errors.previewError') + hint;
  }
  const extra = lastErrorMsg ? `\n\n(${lastErrorMsg})` : '';
  return t('popup.errors.generic') + extra;
}

async function sendDescriptionPreview(tab) {
  if (!tab?.id) {
    return { res: null, lastError: 'NO_TAB' };
  }

  const url = String(tab.url || '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { res: null, lastError: 'UNSUPPORTED_PAGE' };
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'FISHHOOK_SHOW_DESCRIPTION_PREVIEW',
    });
    const lastErrorMsg = chrome.runtime.lastError?.message || '';
    if (lastErrorMsg && res === undefined) {
      throw new Error(lastErrorMsg);
    }
    return { res, lastError: lastErrorMsg };
  } catch (firstErr) {
    return {
      res: null,
      lastError: firstErr && firstErr.message ? String(firstErr.message) : String(firstErr),
    };
  }
}

i18n.getStoredLanguage().then(applyPopupLanguage);

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

showDescriptionButton.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    alert(t('popup.errors.noTab'));
    return;
  }

  const { res, lastError } = await sendDescriptionPreview(tab);
  if (!res || !res.ok) {
    alert(describePreviewError(res, lastError));
    return;
  }
  window.close();
});
