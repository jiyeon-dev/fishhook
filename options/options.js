'use strict';

const STORAGE_KEYS = {
  jiraUrl: 'fishhook.jiraBaseUrl',
  fisheyeUrl: 'fishhook.fisheyeBaseUrl',
  language: 'fishhook.language',
  showObjectivesButton: 'fishhook.showObjectivesButton',
};

const i18n = window.FishHookI18n;
const form = document.getElementById('settings-form');
const languageSelect = document.getElementById('language');
const jiraInput = document.getElementById('jira-url');
const fisheyeInput = document.getElementById('fisheye-url');
const jiraError = document.getElementById('jira-url-error');
const fisheyeError = document.getElementById('fisheye-url-error');
const saveButton = document.getElementById('save-button');
const showObjectivesButton = document.getElementById('show-objectives-button');
const toastRoot = document.getElementById('toast-root');

let toastTimer = null;
let activeLanguage = i18n.AUTO_LANGUAGE;

function t(key) {
  return i18n.t(activeLanguage, key);
}

function applyLanguage(language) {
  activeLanguage = language || i18n.AUTO_LANGUAGE;
  const resolved = i18n.resolveLanguage(activeLanguage);
  document.documentElement.lang = resolved;
  document.title = `fishhook ${t('options.title')}`;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });

  if (jiraInput.classList.contains('is-invalid')) {
    jiraError.textContent = t('options.jiraUrl.invalid');
  }
  if (fisheyeInput.classList.contains('is-invalid')) {
    fisheyeError.textContent = t('options.fisheyeUrl.invalid');
  }
}

function normalizeBaseUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!url.hostname || !/^https?:$/.test(url.protocol)) return null;
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  url.hash = '';
  url.search = '';
  url.pathname = '';
  return url.toString().replace(/\/$/, '');
}

function validateBaseUrl(input, errorEl, message) {
  const normalized = normalizeBaseUrl(input.value);
  const isValid = Boolean(normalized);
  input.classList.toggle('is-invalid', !isValid);
  input.setAttribute('aria-invalid', String(!isValid));
  errorEl.textContent = isValid ? '' : message;
  return normalized;
}

function clearFieldError(input, errorEl) {
  input.classList.remove('is-invalid');
  input.setAttribute('aria-invalid', 'false');
  errorEl.textContent = '';
}

function showToast(message, kind = 'success') {
  window.clearTimeout(toastTimer);
  toastRoot.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.kind = kind;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const text = document.createElement('p');
  text.className = 'toast-message';
  text.textContent = message;

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', t('toast.close'));
  close.textContent = 'x';
  close.addEventListener('click', () => {
    window.clearTimeout(toastTimer);
    toastRoot.innerHTML = '';
  });

  toast.append(text, close);
  toastRoot.appendChild(toast);

  toastTimer = window.setTimeout(
    () => {
      toastRoot.innerHTML = '';
    },
    kind === 'error' ? 4600 : 3000
  );
}

async function loadSettings() {
  try {
    const data = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));
    activeLanguage = data[STORAGE_KEYS.language] || i18n.AUTO_LANGUAGE;
    languageSelect.value = activeLanguage;
    applyLanguage(activeLanguage);
    jiraInput.value = data[STORAGE_KEYS.jiraUrl] || '';
    fisheyeInput.value = data[STORAGE_KEYS.fisheyeUrl] || '';
    showObjectivesButton.checked =
      !Object.prototype.hasOwnProperty.call(data, STORAGE_KEYS.showObjectivesButton) ||
      data[STORAGE_KEYS.showObjectivesButton] === true;
    clearFieldError(jiraInput, jiraError);
    clearFieldError(fisheyeInput, fisheyeError);
  } catch (error) {
    showToast(t('toast.loadFailed'), 'error');
  }
}

async function saveSettings(event) {
  event.preventDefault();

  const jiraUrl = validateBaseUrl(jiraInput, jiraError, t('options.jiraUrl.invalid'));
  if (!jiraUrl) {
    showToast(t('toast.invalidJiraUrl'), 'error');
    jiraInput.focus();
    return;
  }

  const fisheyeUrl = validateBaseUrl(
    fisheyeInput,
    fisheyeError,
    t('options.fisheyeUrl.invalid')
  );
  if (!fisheyeUrl) {
    showToast(t('toast.invalidFisheyeUrl'), 'error');
    fisheyeInput.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = t('options.saving');

  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.jiraUrl]: jiraUrl,
      [STORAGE_KEYS.fisheyeUrl]: fisheyeUrl,
      [STORAGE_KEYS.language]: languageSelect.value,
      [STORAGE_KEYS.showObjectivesButton]: showObjectivesButton.checked,
    });
    jiraInput.value = jiraUrl;
    fisheyeInput.value = fisheyeUrl;
    clearFieldError(jiraInput, jiraError);
    clearFieldError(fisheyeInput, fisheyeError);
    showToast(t('toast.saved'), 'success');
  } catch (error) {
    showToast(t('toast.saveFailed'), 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = t('options.save');
  }
}

form.addEventListener('submit', saveSettings);
showObjectivesButton.addEventListener('change', async () => {
  const enabled = showObjectivesButton.checked;
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.showObjectivesButton]: enabled,
    });
    showToast(
      enabled ? t('toast.objectivesButtonEnabled') : t('toast.objectivesButtonDisabled'),
      'success'
    );
  } catch (_) {
    showObjectivesButton.checked = !enabled;
    showToast(t('toast.saveFailed'), 'error');
  }
});
languageSelect.addEventListener('change', async () => {
  applyLanguage(languageSelect.value);
  try {
    await i18n.setStoredLanguage(languageSelect.value);
    showToast(t('toast.languageChanged'), 'success');
  } catch (_) {
    showToast(t('toast.saveFailed'), 'error');
  }
});
jiraInput.addEventListener('input', () => clearFieldError(jiraInput, jiraError));
fisheyeInput.addEventListener('input', () => clearFieldError(fisheyeInput, fisheyeError));
jiraInput.addEventListener('change', () => {
  validateBaseUrl(jiraInput, jiraError, t('options.jiraUrl.invalid'));
});
fisheyeInput.addEventListener('change', () => {
  validateBaseUrl(fisheyeInput, fisheyeError, t('options.fisheyeUrl.invalid'));
});
jiraInput.addEventListener('blur', () => {
  validateBaseUrl(jiraInput, jiraError, t('options.jiraUrl.invalid'));
});
fisheyeInput.addEventListener('blur', () => {
  validateBaseUrl(fisheyeInput, fisheyeError, t('options.fisheyeUrl.invalid'));
});
applyLanguage(activeLanguage);
loadSettings();
