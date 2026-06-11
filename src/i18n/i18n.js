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
      'popup.activatePage': 'Apply to current page',
      'popup.openOptions': 'Open settings',
      'popup.activated': 'FishHook is active on this page.',
      'popup.activateFailed': 'Could not apply FishHook to this page.',
      'popup.fisheyeUrlRequired': 'Set the Fisheye URL first.',
      'popup.jiraUrlRequired': 'Set the Jira URL first.',
      'popup.notFisheyePage': 'Open the configured Fisheye page first.',
      'popup.permissionRequired': 'Site permission is required.',
      'popup.unsupportedPage': 'This page is not supported.',
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
      'objectives.loadAriaLabel': 'Load Jira content',
      'objectives.loadTitle': 'Show Jira content in Objectives',
      'objectives.fallbackText': 'Load content',
      'objectives.loading': 'Loading Jira content.',
      'objectives.restore': 'Restore original content',
      'objectives.previewBanner': 'Jira content preview',
      'objectives.openJira': 'Open Jira',
      'objectives.jiraUrlRequired': 'The Jira URL is not set. Add the Jira URL in settings first.',
      'objectives.loginRequired': 'You are not logged in to Jira. Log in to Jira first, then try again.',
      'objectives.issueKeyNotFound': 'Could not find a Jira issue key on this Fisheye page.',
      'objectives.targetNotFound': 'Could not find the Objectives area.',
      'objectives.loadFailed': 'Could not load Jira content.',
    },
    ko: {
      'extension.name': 'FishHook',
      'extension.description': 'Fisheye에서 Jira 내용을 보여줍니다.',
      'popup.activatePage': '현재 페이지에 적용',
      'popup.openOptions': '환경설정 열기',
      'popup.activated': '현재 페이지에 FishHook을 적용했습니다.',
      'popup.activateFailed': '현재 페이지에 FishHook을 적용하지 못했습니다.',
      'popup.fisheyeUrlRequired': 'Fisheye 경로를 먼저 설정해 주세요.',
      'popup.jiraUrlRequired': 'Jira 경로를 먼저 설정해 주세요.',
      'popup.notFisheyePage': '설정된 Fisheye 페이지를 먼저 열어 주세요.',
      'popup.permissionRequired': '사이트 접근 권한이 필요합니다.',
      'popup.unsupportedPage': '지원하지 않는 페이지입니다.',
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
      'objectives.loadAriaLabel': 'Jira 내용 불러오기',
      'objectives.loadTitle': 'Jira 내용을 Objectives에 표시',
      'objectives.fallbackText': '내용 불러오기',
      'objectives.loading': 'Jira 내용을 불러오는 중입니다.',
      'objectives.restore': '원래 내용',
      'objectives.previewBanner': 'Jira 내용 미리보기',
      'objectives.openJira': 'Jira 열기',
      'objectives.jiraUrlRequired':
        'Jira 경로가 설정되어 있지 않습니다. 환경설정에서 Jira 경로를 먼저 입력해 주세요.',
      'objectives.loginRequired':
        'Jira에 로그인되어 있지 않습니다. Jira에 먼저 로그인한 뒤 다시 시도해 주세요.',
      'objectives.issueKeyNotFound': 'Fisheye 화면에서 Jira 이슈 키를 찾지 못했습니다.',
      'objectives.targetNotFound': 'Objectives 영역을 찾지 못했습니다.',
      'objectives.loadFailed': 'Jira 내용을 불러오지 못했습니다.',
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
