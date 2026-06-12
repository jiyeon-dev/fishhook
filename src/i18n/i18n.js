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
      'popup.showDescription': 'Description preview',
      'popup.errors.noTab': 'Could not find the active tab. Try again in a moment.',
      'popup.errors.unsupportedPage':
        'This works only on Fisheye /cru/ review pages. Open a Fisheye tab and try again.',
      'popup.errors.connectionFailed':
        'Could not attach the extension script to this tab.\n\n· Confirm you are on a Fisheye review page (/cru/)\n· Refresh the page (F5) and try again\n· Check the Fisheye URL in settings\n\n{detail}',
      'popup.errors.issueKeyNotFound':
        'Could not find a Jira issue key (GS-12345 format) on this Fisheye page.',
      'popup.errors.jiraUrlRequired':
        'The Jira URL is not set. Add the Jira URL in settings first.',
      'popup.errors.descriptionNotFound': 'Jira Description is empty or could not be loaded.',
      'popup.errors.loginRequired':
        'You are not logged in to Jira. Log in to Jira first, then try again.',
      'popup.errors.previewError': 'Could not open the Description preview.',
      'popup.errors.generic':
        'Could not open the Description preview. Try again on a Fisheye review page.',
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
      'options.objectivesButton.label': 'Objectives button',
      'options.objectivesButton.enable': 'Show Jira load button next to Fisheye Objectives',
      'options.descPanelFab.label': 'Description preview button',
      'options.descPanelFab.enable': 'Show Description preview button (📖) at the bottom-right of Fisheye',
      'toast.saved': 'Saved.',
      'toast.languageChanged': 'Language changed.',
      'toast.invalidJiraUrl': 'Check the Jira URL.',
      'toast.invalidFisheyeUrl': 'Check the Fisheye URL.',
      'toast.loadFailed': 'Could not load settings.',
      'toast.saveFailed': 'Could not save settings.',
      'toast.objectivesButtonEnabled': 'The Objectives load button is now shown.',
      'toast.objectivesButtonDisabled': 'The Objectives load button is now hidden.',
      'toast.descPanelFabEnabled': 'The Description preview button is now shown.',
      'toast.descPanelFabDisabled': 'The Description preview button is now hidden.',
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
      'popup.openOptions': '환경설정 열기',
      'popup.showDescription': 'Description 미리보기',
      'popup.errors.noTab': '활성 탭을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'popup.errors.unsupportedPage':
        'Fisheye /cru/ 리뷰 페이지에서만 사용할 수 있습니다. Fisheye 탭을 연 뒤 다시 시도해 주세요.',
      'popup.errors.connectionFailed':
        '이 탭에 확장 스크립트를 붙이지 못했습니다.\n\n· Fisheye 리뷰 페이지(/cru/)인지 확인\n· 페이지 새로고침(F5) 후 다시 시도\n· 환경설정에서 Fisheye 경로가 올바른지 확인\n\n{detail}',
      'popup.errors.issueKeyNotFound':
        'Fisheye 화면에서 Jira 이슈 키(GS-12345 형식)를 찾지 못했습니다.',
      'popup.errors.jiraUrlRequired':
        'Jira 경로가 설정되어 있지 않습니다. 환경설정에서 Jira 경로를 먼저 입력해 주세요.',
      'popup.errors.descriptionNotFound': 'Jira Description이 비어 있거나 가져오지 못했습니다.',
      'popup.errors.loginRequired':
        'Jira에 로그인되어 있지 않습니다. Jira에 먼저 로그인한 뒤 다시 시도해 주세요.',
      'popup.errors.previewError': 'Description 미리보기를 열지 못했습니다.',
      'popup.errors.generic':
        'Description 미리보기를 열지 못했습니다. Fisheye 리뷰 페이지에서 다시 시도해 주세요.',
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
      'options.objectivesButton.label': 'Objectives 버튼',
      'options.objectivesButton.enable': 'Fisheye Objectives 옆에 Jira 불러오기 버튼 표시',
      'options.descPanelFab.label': 'Description 미리보기 버튼',
      'options.descPanelFab.enable': 'Fisheye 우하단에 Description 미리보기 버튼(📖) 표시',
      'toast.saved': '저장했습니다.',
      'toast.languageChanged': '언어를 변경했습니다.',
      'toast.invalidJiraUrl': 'Jira 경로를 확인해 주세요.',
      'toast.invalidFisheyeUrl': 'Fisheye 경로를 확인해 주세요.',
      'toast.loadFailed': '설정을 불러오지 못했습니다.',
      'toast.saveFailed': '설정을 저장하지 못했습니다.',
      'toast.objectivesButtonEnabled': 'Objectives 불러오기 버튼을 표시합니다.',
      'toast.objectivesButtonDisabled': 'Objectives 불러오기 버튼을 숨깁니다.',
      'toast.descPanelFabEnabled': 'Description 미리보기 버튼을 표시합니다.',
      'toast.descPanelFabDisabled': 'Description 미리보기 버튼을 숨깁니다.',
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
