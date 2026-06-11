'use strict';

(function () {
  const STORAGE_KEY = 'fishhook.language';
  const DEFAULT_LANGUAGE = 'en';
  const AUTO_LANGUAGE = 'auto';
  const SUPPORTED_LANGUAGES = new Set(['en', 'ko']);

  const messages = {
    en: {
      'extension.name': 'FishHook',
      'extension.description': 'Show Jira content inside Fisheye.',
      'popup.openOptions': 'Open settings',
      'options.title': 'Settings',
      'options.eyebrow': 'fishhook settings',
      'options.description': 'Set the base paths used to show Jira content inside Fisheye.',
      'options.language.label': 'Language',
      'options.language.auto': 'Browser default',
      'options.language.en': 'English',
      'options.language.ko': 'Korean',
      'options.jiraUrl.label': 'Jira URL',
      'options.jiraUrl.placeholder': 'https://jira.<domain>.com',
      'options.jiraUrl.invalid': 'Enter a valid Jira URL.',
      'options.fisheyeUrl.label': 'Fisheye URL',
      'options.fisheyeUrl.placeholder': 'https://fisheye.<domain>.com',
      'options.fisheyeUrl.invalid': 'Enter a valid Fisheye URL.',
      'options.save': 'Save',
      'options.saving': 'Saving',
      'toast.saved': 'Saved.',
      'toast.languageChanged': 'Language changed.',
      'toast.invalidJiraUrl': 'Check the Jira URL.',
      'toast.invalidFisheyeUrl': 'Check the Fisheye URL.',
      'toast.loadFailed': 'Could not load settings.',
      'toast.saveFailed': 'Could not save settings.',
      'toast.close': 'Close',
    },
    ko: {
      'extension.name': 'FishHook',
      'extension.description': 'Fisheye에서 Jira 내용을 보여줍니다.',
      'popup.openOptions': '환경설정 열기',
      'options.title': '환경설정',
      'options.eyebrow': 'fishhook settings',
      'options.description': 'Fisheye에서 Jira 내용을 보여주기 위한 기본 경로를 설정합니다.',
      'options.language.label': '언어',
      'options.language.auto': '브라우저 기본값',
      'options.language.en': '영어',
      'options.language.ko': '한국어',
      'options.jiraUrl.label': 'Jira 경로',
      'options.jiraUrl.placeholder': 'https://jira.<domain>.com',
      'options.jiraUrl.invalid': '올바른 Jira URL을 입력해 주세요.',
      'options.fisheyeUrl.label': 'Fisheye 경로',
      'options.fisheyeUrl.placeholder': 'https://fisheye.<domain>.com',
      'options.fisheyeUrl.invalid': '올바른 Fisheye URL을 입력해 주세요.',
      'options.save': '저장',
      'options.saving': '저장 중',
      'toast.saved': '저장했습니다.',
      'toast.languageChanged': '언어를 변경했습니다.',
      'toast.invalidJiraUrl': 'Jira 경로를 확인해 주세요.',
      'toast.invalidFisheyeUrl': 'Fisheye 경로를 확인해 주세요.',
      'toast.loadFailed': '설정을 불러오지 못했습니다.',
      'toast.saveFailed': '설정을 저장하지 못했습니다.',
      'toast.close': '닫기',
    },
  };

  function normalizeLanguage(language) {
    const code = String(language || '').trim().toLowerCase().split('-')[0];
    return SUPPORTED_LANGUAGES.has(code) ? code : null;
  }

  function resolveBrowserLanguage() {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const candidate of candidates) {
      const normalized = normalizeLanguage(candidate);
      if (normalized) return normalized;
    }
    return DEFAULT_LANGUAGE;
  }

  function resolveLanguage(raw) {
    if (!raw || raw === AUTO_LANGUAGE) return resolveBrowserLanguage();
    return normalizeLanguage(raw) || DEFAULT_LANGUAGE;
  }

  function translate(language, key) {
    const lang = resolveLanguage(language);
    return messages[lang]?.[key] || messages[DEFAULT_LANGUAGE][key] || `[[${key}]]`;
  }

  async function getStoredLanguage() {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEY);
      const raw = data[STORAGE_KEY];
      return raw === 'en' || raw === 'ko' || raw === AUTO_LANGUAGE ? raw : AUTO_LANGUAGE;
    } catch (_) {
      return AUTO_LANGUAGE;
    }
  }

  async function setStoredLanguage(language) {
    const next = language === 'en' || language === 'ko' ? language : AUTO_LANGUAGE;
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  }

  window.FishHookI18n = {
    AUTO_LANGUAGE,
    STORAGE_KEY,
    getStoredLanguage,
    messages,
    resolveLanguage,
    setStoredLanguage,
    t: translate,
  };
})();
