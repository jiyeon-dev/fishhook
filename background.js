'use strict';

const JIRA_URL_STORAGE_KEY = 'fishhook.jiraBaseUrl';
const LOG = '[fishhook][background]';

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

async function getJiraBaseUrl() {
  const data = await chrome.storage.sync.get(JIRA_URL_STORAGE_KEY);
  return normalizeBaseUrl(data[JIRA_URL_STORAGE_KEY]);
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .trim();
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function adfNodeToPlainText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (!Array.isArray(node.content)) return '';
  const inner = node.content.map(adfNodeToPlainText).join('');
  if (node.type === 'paragraph' || node.type === 'heading') return `${inner}\n`;
  return inner;
}

function adfToPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf.trim();
  return adfNodeToPlainText(adf).replace(/\n{3,}/g, '\n\n').trim();
}

function parseIssueDescription(json) {
  const rendered = json?.renderedFields?.description;
  if (rendered && String(rendered).trim()) {
    const html = sanitizeHtml(rendered);
    const text = stripHtmlToText(html);
    if (text) return { html, text };
  }

  const description = json?.fields?.description;
  if (typeof description === 'string' && description.trim()) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(description);
    const html = looksHtml
      ? sanitizeHtml(description)
      : `<div class="fishhook-jira-content"><p>${escapeHtml(description).replace(/\n/g, '<br>')}</p></div>`;
    return { html, text: stripHtmlToText(html) || description.trim() };
  }

  if (description && typeof description === 'object') {
    const text = adfToPlainText(description);
    if (text) {
      return {
        html: `<div class="fishhook-jira-content"><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`,
        text,
      };
    }
  }

  return null;
}

async function hasOriginPermission(origin) {
  return chrome.permissions.contains({ origins: [`${origin}/*`] });
}

async function fetchJiraIssue(issueKey) {
  const key = String(issueKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return { ok: false, error: 'INVALID_ISSUE_KEY' };
  }

  const jiraBaseUrl = await getJiraBaseUrl();
  if (!jiraBaseUrl) {
    return { ok: false, error: 'JIRA_URL_NOT_CONFIGURED' };
  }

  const jiraOrigin = new URL(jiraBaseUrl).origin;
  const hasPermission = await hasOriginPermission(jiraOrigin);
  if (!hasPermission) {
    return { ok: false, error: 'JIRA_PERMISSION_REQUIRED', jiraBaseUrl };
  }

  const issueUrl = `${jiraBaseUrl}/browse/${encodeURIComponent(key)}`;

  for (const version of ['3', '2', 'latest']) {
    const apiUrl = `${jiraBaseUrl}/rest/api/${version}/issue/${encodeURIComponent(
      key
    )}?fields=description&expand=renderedFields`;

    try {
      const response = await fetch(apiUrl, {
        credentials: 'include',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: 'JIRA_LOGIN_REQUIRED', issueKey: key, issueUrl };
      }

      if (!response.ok) {
        console.info(LOG, 'Jira API returned non-ok status.', {
          version,
          status: response.status,
        });
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { ok: false, error: 'JIRA_LOGIN_REQUIRED', issueKey: key, issueUrl };
      }

      const json = await response.json();
      const parsed = parseIssueDescription(json);
      if (parsed) {
        return {
          ok: true,
          issueKey: key,
          issueUrl,
          source: `jira-api-${version}`,
          ...parsed,
        };
      }
    } catch (error) {
      console.warn(LOG, 'Jira fetch failed.', { version, error: String(error) });
    }
  }

  return { ok: false, error: 'DESCRIPTION_NOT_FOUND', issueKey: key, issueUrl };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'FISHHOOK_FETCH_JIRA_CONTENT') return false;

  fetchJiraIssue(message.issueKey)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
