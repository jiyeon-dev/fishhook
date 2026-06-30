'use strict';

const JIRA_URL_STORAGE_KEY = 'fishhook.jiraBaseUrl';
const SHOW_OBJECTIVES_BUTTON_KEY = 'fishhook.showObjectivesButton';
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

function walkAdfMediaNodes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'media' && node.attrs?.id) {
    out.push({
      id: String(node.attrs.id),
      alt: String(node.attrs.alt || '').trim(),
      collection: String(node.attrs.collection || '').trim(),
      mediaType: String(node.attrs.type || 'file').trim(),
      url: String(node.attrs.url || '').trim(),
    });
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child) => walkAdfMediaNodes(child, out));
  }
  return out;
}

function absoluteJiraUrl(jiraBaseUrl, path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${jiraBaseUrl}${value}`;
  return `${jiraBaseUrl}/${value}`;
}

function attachmentContentUrl(jiraBaseUrl, attachment) {
  const direct = String(attachment?.content || '').trim();
  if (direct) return absoluteJiraUrl(jiraBaseUrl, direct);
  const id = attachment?.id;
  if (id == null || id === '') return '';
  return `${jiraBaseUrl}/rest/api/3/attachment/content/${encodeURIComponent(String(id))}`;
}

function matchMediaToAttachment(media, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!media || !list.length) return null;

  if (media.collection === 'attachment' && media.id) {
    const byCollectionId = list.find((item) => String(item.id) === String(media.id));
    if (byCollectionId) return byCollectionId;
  }

  if (media.url) {
    const match = String(media.url).match(/\/attachment\/content\/(\d+)/i);
    if (match) {
      const byUrlId = list.find((item) => String(item.id) === match[1]);
      if (byUrlId) return byUrlId;
    }
  }

  if (media.alt) {
    const byFilename = list.find((item) => String(item.filename || '') === media.alt);
    if (byFilename) return byFilename;
  }

  if (media.id) {
    const byId = list.find((item) => String(item.id) === String(media.id));
    if (byId) return byId;
  }

  return null;
}

function createVideoPlaceholderHtml() {
  return '<span class="fishhook-media-placeholder fishhook-video-placeholder">[VIDEO]</span>';
}

function createMediaElementHtml(attachment, jiraBaseUrl, mediaOptions = {}) {
  const url = attachmentContentUrl(jiraBaseUrl, attachment);
  if (!url) return '';

  const mime = String(attachment.mimeType || '').toLowerCase();
  const title = escapeHtml(attachment.filename || 'attachment');
  const urlAttr = escapeHtml(url);
  const includeVideo = mediaOptions.includeVideo !== false;

  if (mime.startsWith('video/')) {
    if (!includeVideo) return createVideoPlaceholderHtml();
    return (
      `<video controls preload="metadata" playsinline class="fishhook-jira-media fishhook-jira-video"` +
      ` data-fishhook-media-url="${urlAttr}" title="${title}"></video>`
    );
  }
  if (mime.startsWith('image/')) {
    return (
      `<img class="fishhook-jira-media fishhook-jira-image" alt="${title}"` +
      ` src="${urlAttr}" data-fishhook-media-url="${urlAttr}" />`
    );
  }
  return (
    `<a class="fishhook-jira-media fishhook-jira-file" href="${urlAttr}"` +
    ` data-fishhook-media-url="${urlAttr}" target="_blank" rel="noopener noreferrer">${title}</a>`
  );
}

function absolutizeAttachmentUrls(html, jiraBaseUrl) {
  return String(html || '').replace(
    /(\s(?:src|href)=["'])(\/(?:rest\/api\/(?:3|2|latest)\/attachment\/content|secure\/attachment)\/[^"']+)(["'])/gi,
    (_, prefix, path, suffix) => `${prefix}${jiraBaseUrl}${path}${suffix}`
  );
}

function tagMediaElementsForHydration(html, mediaOptions = {}) {
  const includeVideo = mediaOptions.includeVideo !== false;
  return String(html || '').replace(/<(video|img)\b([^>]*)>/gi, (match, tag, attrs) => {
    if (tag.toLowerCase() === 'video' && !includeVideo) return match;
    if (/\bdata-fishhook-media-url=/i.test(attrs)) return match;
    const srcMatch = attrs.match(/\ssrc=["']([^"']+)["']/i);
    if (!srcMatch) return match;
    const url = srcMatch[1];
    if (!/\/attachment\/content\//i.test(url)) return match;
    return `<${tag}${attrs} data-fishhook-media-url="${url}">`;
  });
}

function stripVideosFromHtml(html) {
  const placeholder = createVideoPlaceholderHtml();
  return String(html || '')
    .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, placeholder)
    .replace(/<video\b[^>]*\/>/gi, placeholder)
    .replace(/<video\b[^>]*>/gi, placeholder);
}

function hasRenderableHtml(html, text) {
  if (text) return true;
  return /<(video|img|table|ul|ol|h[1-6]|p|div)\b/i.test(String(html || ''));
}

function resolveMediaInHtml(html, adf, attachments, jiraBaseUrl, mediaOptions = {}) {
  const includeVideo = mediaOptions.includeVideo !== false;
  let out = absolutizeAttachmentUrls(html, jiraBaseUrl);
  out = tagMediaElementsForHydration(out, mediaOptions);

  const mediaNodes = walkAdfMediaNodes(adf?.type === 'doc' ? adf : adf);
  if (mediaNodes.length) {
    const mediaById = new Map(mediaNodes.map((media) => [media.id, media]));

    out = out.replace(
      /<span\s+class="error">[\s\S]*?\^([a-f0-9-]+)[\s\S]*?<\/span>/gi,
      (match, mediaId) => {
        const media = mediaById.get(mediaId);
        if (!media) return match;
        const attachment = matchMediaToAttachment(media, attachments);
        if (!attachment) {
          const label = escapeHtml(media.alt || mediaId);
          return `<span class="fishhook-media-placeholder">[media: ${label}]</span>`;
        }
        return createMediaElementHtml(attachment, jiraBaseUrl, mediaOptions) || match;
      }
    );
  }

  if (!includeVideo) {
    out = stripVideosFromHtml(out);
  }

  return out;
}

function parseIssueDescription(json, jiraBaseUrl, mediaOptions = {}) {
  const attachments = json?.fields?.attachment;
  const description = json?.fields?.description;
  const adf = description && typeof description === 'object' ? description : null;

  const rendered = json?.renderedFields?.description;
  if (rendered && String(rendered).trim()) {
    const html = resolveMediaInHtml(sanitizeHtml(rendered), adf, attachments, jiraBaseUrl, mediaOptions);
    const text = stripHtmlToText(html);
    if (hasRenderableHtml(html, text)) return { html, text };
  }

  if (typeof description === 'string' && description.trim()) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(description);
    const html = looksHtml
      ? resolveMediaInHtml(sanitizeHtml(description), adf, attachments, jiraBaseUrl, mediaOptions)
      : `<div class="fishhook-jira-content"><p>${escapeHtml(description).replace(/\n/g, '<br>')}</p></div>`;
    return { html, text: stripHtmlToText(html) || description.trim() };
  }

  if (adf) {
    const text = adfToPlainText(adf);
    const mediaNodes = walkAdfMediaNodes(adf);
    const mediaHtml = mediaNodes
      .map((media) => {
        const attachment = matchMediaToAttachment(media, attachments);
        return attachment ? createMediaElementHtml(attachment, jiraBaseUrl, mediaOptions) : '';
      })
      .filter(Boolean)
      .join('');

    if (text || mediaHtml) {
      const bodyParts = [];
      if (text) {
        bodyParts.push(
          `<div class="fishhook-jira-content"><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`
        );
      }
      if (mediaHtml) {
        bodyParts.push(`<div class="fishhook-jira-media-group">${mediaHtml}</div>`);
      }
      const html = bodyParts.join('');
      return { html, text: text || stripHtmlToText(html) };
    }
  }

  return null;
}

function parseIssueTitle(json) {
  return String(json?.fields?.summary || '').trim();
}

async function fetchJiraIssue(issueKey, options = {}) {
  const includeVideo = options.includeVideo !== false;
  const key = String(issueKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return { ok: false, error: 'INVALID_ISSUE_KEY' };
  }

  const jiraBaseUrl = await getJiraBaseUrl();
  if (!jiraBaseUrl) {
    return { ok: false, error: 'JIRA_URL_NOT_CONFIGURED' };
  }

  const issueUrl = `${jiraBaseUrl}/browse/${encodeURIComponent(key)}`;

  for (const version of ['3', '2', 'latest']) {
    const apiUrl = `${jiraBaseUrl}/rest/api/${version}/issue/${encodeURIComponent(
      key
    )}?fields=summary,description,attachment&expand=renderedFields`;

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
      const issueTitle = parseIssueTitle(json);
      const parsed = parseIssueDescription(json, jiraBaseUrl, { includeVideo });
      if (parsed) {
        return {
          ok: true,
          issueKey: key,
          issueUrl,
          issueTitle,
          ...parsed,
        };
      }
      if (issueTitle) {
        return {
          ok: false,
          error: 'DESCRIPTION_NOT_FOUND',
          issueKey: key,
          issueUrl,
          issueTitle,
        };
      }
    } catch (error) {
      console.warn(LOG, 'Jira fetch failed.', { version, error: String(error) });
    }
  }

  return { ok: false, error: 'DESCRIPTION_NOT_FOUND', issueKey: key, issueUrl };
}

function isAllowedJiraAttachmentUrl(url, jiraBaseUrl) {
  const value = String(url || '').trim();
  if (!value || !jiraBaseUrl) return false;
  try {
    const parsed = new URL(value);
    const base = new URL(jiraBaseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.hostname !== base.hostname) return false;
    return /\/(?:rest\/api\/(?:3|2|latest)\/attachment\/content|secure\/attachment)\//i.test(
      parsed.pathname
    );
  } catch (_) {
    return false;
  }
}

async function fetchJiraAttachment(url) {
  const jiraBaseUrl = await getJiraBaseUrl();
  if (!jiraBaseUrl) {
    return { ok: false, error: 'JIRA_URL_NOT_CONFIGURED' };
  }

  const normalizedUrl = String(url || '').trim();
  if (!isAllowedJiraAttachmentUrl(normalizedUrl, jiraBaseUrl)) {
    return { ok: false, error: 'INVALID_ATTACHMENT_URL' };
  }

  try {
    const response = await fetch(normalizedUrl, {
      credentials: 'include',
      redirect: 'follow',
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'JIRA_LOGIN_REQUIRED' };
    }

    if (!response.ok) {
      return { ok: false, error: `HTTP_${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    return { ok: true, buffer, contentType };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FISHHOOK_FETCH_JIRA_ATTACHMENT') {
    fetchJiraAttachment(message.url)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type !== 'FISHHOOK_FETCH_JIRA_CONTENT') return false;

  fetchJiraIssue(message.issueKey, { includeVideo: message.includeVideo !== false })
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.sync.get(SHOW_OBJECTIVES_BUTTON_KEY);
    if (!Object.prototype.hasOwnProperty.call(data, SHOW_OBJECTIVES_BUTTON_KEY)) {
      await chrome.storage.sync.set({ [SHOW_OBJECTIVES_BUTTON_KEY]: true });
    }
  } catch (error) {
    console.warn(LOG, 'Failed to initialize default settings.', error);
  }
});
