'use strict';

const i18n = window.FishHookI18n;
const openOptionsButton = document.getElementById('open-options');

function applyPopupLanguage(language) {
  const resolved = i18n.resolveLanguage(language);
  document.documentElement.lang = resolved;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = i18n.t(language, el.dataset.i18n);
  });
}

i18n.getStoredLanguage().then(applyPopupLanguage);

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
