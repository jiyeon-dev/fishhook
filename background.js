'use strict';

importScripts('src/adf-html.js');

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

function normalizeAdfMediaNode(node) {
  return {
    id: String(node.attrs.id),
    alt: String(node.attrs.alt || '').trim(),
    collection: String(node.attrs.collection || '').trim(),
    mediaType: String(node.attrs.type || 'file').trim(),
    url: String(node.attrs.url || '').trim(),
  };
}

function walkAdfMediaNodes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'media' && node.attrs?.id) {
    out.push(normalizeAdfMediaNode(node));
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Jira Cloud stores colliding uploads as "name (<media uuid>).png" while the ADF
// media node keeps the clean `alt`. Strip that suffix before comparing names.
const UUID_FILENAME_SUFFIX_RE = new RegExp(
  `\\s*\\(\\s*${UUID_RE.source}\\s*\\)\\s*(?=\\.[^.]+$|$)`,
  'i'
);

function normalizeAttachmentName(name) {
  return String(name || '')
    .replace(UUID_FILENAME_SUFFIX_RE, '')
    .trim();
}

// Exact filename first, then names compared with the UUID suffix stripped — but
// only when exactly one candidate remains: guessing between duplicates would
// show the wrong screenshot.
function findAttachmentByFilename(name, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const raw = String(name || '').trim();
  if (!raw || !list.length) return null;

  const exact = list.find((item) => String(item.filename || '') === raw);
  if (exact) return exact;

  const wanted = normalizeAttachmentName(raw);
  if (!wanted) return null;
  const candidates = list.filter((item) => normalizeAttachmentName(item.filename) === wanted);
  return candidates.length === 1 ? candidates[0] : null;
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

  // The media UUID embedded in the filename is a stronger signal than the name
  // itself, because that suffix only exists to disambiguate duplicate names.
  if (media.id && UUID_RE.test(String(media.id))) {
    const byTaggedFilename = list.find((item) =>
      String(item.filename || '').includes(String(media.id))
    );
    if (byTaggedFilename) return byTaggedFilename;
  }

  if (media.alt) {
    const byFilename = findAttachmentByFilename(media.alt, list);
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

function getTagAttr(tag, name) {
  const match = String(tag || '').match(
    new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')
  );
  return match ? match[2] : '';
}

function setTagAttr(tag, name, value) {
  const existing = new RegExp(`\\s${name}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i');
  if (existing.test(tag)) return tag.replace(existing, ` ${name}="${value}"`);
  const selfClosing = /\/>\s*$/.test(tag);
  return `${tag.replace(/\s*\/?>\s*$/, '')} ${name}="${value}"${selfClosing ? ' />' : '>'}`;
}

// Point an existing <img> at the full-size attachment and give it the same
// classes/hooks the ADF path produces, so lightbox and CSS treat it alike.
function markAsFishhookImage(tag, url) {
  const urlAttr = escapeHtml(url);
  let out = setTagAttr(tag, 'src', urlAttr);
  // srcset would keep serving the thumbnail Jira picked, and the width/height it
  // sized for the thumbnail would keep the full image rendering small.
  out = out.replace(/\ssrcset\s*=\s*(["'])[\s\S]*?\1/gi, '');
  out = out.replace(/\s(?:width|height)\s*=\s*(["'])[\s\S]*?\1/gi, '');
  out = out.replace(/\s(?:width|height)\s*=\s*[^\s"'>]+/gi, '');
  const style = getTagAttr(out, 'style');
  if (style) {
    const kept = style
      .split(';')
      .filter((decl) => decl.trim() && !/^\s*(?:width|height|max-width|max-height)\s*:/i.test(decl))
      .join(';');
    out = kept ? setTagAttr(out, 'style', kept) : out.replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/i, '');
  }
  const classes = new Set(getTagAttr(out, 'class').split(/\s+/).filter(Boolean));
  classes.add('fishhook-jira-media');
  classes.add('fishhook-jira-image');
  out = setTagAttr(out, 'class', Array.from(classes).join(' '));
  return setTagAttr(out, 'data-fishhook-media-url', urlAttr);
}

function thumbnailAttachmentId(url) {
  const value = String(url || '');
  const rest = value.match(/\/rest\/api\/(?:3|2|latest)\/attachment\/thumbnail\/(\d+)/i);
  if (rest) return rest[1];
  const secure = value.match(/\/secure\/thumbnails?\/(\d+)/i);
  return secure ? secure[1] : null;
}

// Jira renders inline images as `/attachment/thumbnail/{id}` (a ~200px crop).
// The same id serves the original at `/attachment/content/{id}`, so swap it.
function upgradeThumbnailUrlsInHtml(html, attachments, jiraBaseUrl) {
  const list = Array.isArray(attachments) ? attachments : [];
  return String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    const src = getTagAttr(tag, 'src');
    if (!src) return tag;
    if (!src.startsWith('/') && !src.startsWith(jiraBaseUrl)) return tag;
    const id = thumbnailAttachmentId(src);
    if (!id) return tag;

    const attachment =
      list.find((item) => String(item.id) === id) ||
      findAttachmentByFilename(
        getTagAttr(tag, 'data-attachment-name') || getTagAttr(tag, 'alt') || getTagAttr(tag, 'title'),
        list
      );

    if (attachment) {
      const url = attachmentContentUrl(jiraBaseUrl, attachment);
      return url ? markAsFishhookImage(tag, url) : tag;
    }
    // No attachment list to confirm against (fields.attachment missing): the id
    // in the thumbnail path is the attachment id, so the swap still holds.
    if (list.length) return tag;
    return markAsFishhookImage(tag, `${jiraBaseUrl}/rest/api/3/attachment/content/${id}`);
  });
}

const MEDIA_CARD_OPEN_RE = /<div\b[^>]*\bdata-node-type=["']media["'][^>]*>/gi;
const DIV_TAG_RE = /<div\b[^>]*>|<\/div\s*>/gi;

// Returns the index just past the </div> that closes the card opened at `from`.
function findMediaCardEnd(html, from) {
  DIV_TAG_RE.lastIndex = from;
  let depth = 1;
  let match = DIV_TAG_RE.exec(html);
  while (match) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return DIV_TAG_RE.lastIndex;
    match = DIV_TAG_RE.exec(html);
  }
  return -1;
}

function mediaCardDescriptor(openTag) {
  const id = getTagAttr(openTag, 'data-id').trim();
  if (!id) return null;
  const fileName = getTagAttr(openTag, 'data-file-name').trim();
  return {
    id,
    alt: getTagAttr(openTag, 'data-alt').trim() || fileName,
    collection: getTagAttr(openTag, 'data-collection').trim(),
    mediaType: getTagAttr(openTag, 'data-type').trim() || 'file',
    mimeType: getTagAttr(openTag, 'data-file-mime-type').trim().toLowerCase(),
    fileName,
  };
}

// The card thumbnail is a fixed 156x125 crop. Media Services has no public
// download API, so when the attachment lookup fails, reuse the card's own token
// and ask the CDN for a full-fit render instead.
function upgradeMediaCdnUrl(src) {
  const raw = String(src || '').replace(/&amp;/gi, '&');
  try {
    const url = new URL(raw);
    if (!/(^|\.)media-cdn\.atlassian\.com$/i.test(url.hostname)) return '';
    url.searchParams.set('mode', 'full-fit');
    url.searchParams.set('width', '1600');
    url.searchParams.set('height', '1600');
    return url.toString().replace(/&/g, '&amp;');
  } catch (_) {
    return '';
  }
}

function renderMediaCardHtml(card, block, mediaById, attachments, jiraBaseUrl, mediaOptions) {
  const media = mediaById.get(card.id) || {
    id: card.id,
    alt: card.alt,
    collection: card.collection,
    mediaType: card.mediaType,
  };
  const attachment = matchMediaToAttachment(media, attachments);
  if (attachment) return createMediaElementHtml(attachment, jiraBaseUrl, mediaOptions);

  const label = escapeHtml(card.fileName || card.alt || card.id);
  if (card.mimeType.startsWith('video/')) {
    return mediaOptions.includeVideo === false
      ? createVideoPlaceholderHtml()
      : `<span class="fishhook-media-placeholder">[media: ${label}]</span>`;
  }

  const cardImg = block.match(/<img\b[^>]*>/i);
  const upgraded = cardImg ? upgradeMediaCdnUrl(getTagAttr(cardImg[0], 'src')) : '';
  if (upgraded) {
    return (
      `<img class="fishhook-jira-media fishhook-jira-image" alt="${label}"` +
      ` src="${upgraded}" />`
    );
  }
  return `<span class="fishhook-media-placeholder">[media: ${label}]</span>`;
}

// Cloud's renderedFields wraps each inline image in a Media Services card:
// fullscreen button, 156px cropped <img>, blanket, title box, download bar.
// Swap the whole card for a plain full-size <img>.
function replaceMediaCardsInHtml(html, adf, attachments, jiraBaseUrl, mediaOptions = {}) {
  let out = String(html || '');
  if (!/data-node-type=["']media["']/i.test(out)) return out;

  const mediaById = new Map(walkAdfMediaNodes(adf).map((media) => [media.id, media]));
  let searchFrom = 0;

  for (;;) {
    MEDIA_CARD_OPEN_RE.lastIndex = searchFrom;
    const open = MEDIA_CARD_OPEN_RE.exec(out);
    if (!open) return out;

    const end = findMediaCardEnd(out, open.index + open[0].length);
    if (end < 0) return out;

    const card = mediaCardDescriptor(open[0]);
    const replacement = card
      ? renderMediaCardHtml(
          card,
          out.slice(open.index, end),
          mediaById,
          attachments,
          jiraBaseUrl,
          mediaOptions
        )
      : '';

    if (!replacement) {
      searchFrom = end;
      continue;
    }
    out = out.slice(0, open.index) + replacement + out.slice(end);
    searchFrom = open.index + replacement.length;
  }
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
  let out = upgradeThumbnailUrlsInHtml(html, attachments, jiraBaseUrl);
  out = absolutizeAttachmentUrls(out, jiraBaseUrl);
  out = replaceMediaCardsInHtml(out, adf, attachments, jiraBaseUrl, mediaOptions);
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

// Jira Cloud drops nodes it cannot convert to HTML and leaves
// `<!-- ADF macro (type = 'table') -->` behind. Tables with merged cells always
// take that path, so rebuild them from the raw ADF and splice them back in.
function adfRenderOptions(attachments, jiraBaseUrl, mediaOptions = {}) {
  return {
    renderMedia(node) {
      if (!node?.attrs?.id) return '';
      const attachment = matchMediaToAttachment(normalizeAdfMediaNode(node), attachments);
      if (!attachment) return '';
      return createMediaElementHtml(attachment, jiraBaseUrl, mediaOptions);
    },
  };
}

function restoreAdfMacroPlaceholders(html, adf, attachments, jiraBaseUrl, mediaOptions = {}) {
  const fill = self.FishHookAdfHtml?.fillAdfMacroPlaceholders;
  if (!fill || !adf) return html;

  return fill(html, adf, adfRenderOptions(attachments, jiraBaseUrl, mediaOptions));
}

// Jira's HTML converter strips `colwidth` from every table it manages to convert, so
// the preview loses the author's column ratios. Put them back from the raw ADF. Runs
// last so tables rebuilt by the repairs above are already in place and get counted.
function restoreAdfTableWidths(html, adf) {
  const apply = self.FishHookAdfHtml?.applyAdfTableWidths;
  if (!apply || !adf) return html;
  return apply(html, adf);
}

// A code block ending in `\` swallows its closing `{noformat}`, and every fence
// after it pairs off by one - prose inside code panels, code inside paragraphs,
// tables reduced to raw `||...||`. Re-render the document tail from the ADF.
function restoreCascadedCodeFences(html, adf, attachments, jiraBaseUrl, mediaOptions = {}) {
  const repair = self.FishHookAdfHtml?.repairCascadedCodeFences;
  if (!repair || !adf) return html;
  return repair(html, adf, adfRenderOptions(attachments, jiraBaseUrl, mediaOptions));
}

// A code block nested in a list comes back from Jira as an empty code panel plus a
// paragraph holding the code and a leftover `{noformat}` fence. Put the code back
// where it belongs, using the raw ADF (the paragraph loses a trailing `\`).
function restoreSplitCodeBlocks(html, adf) {
  const repair = self.FishHookAdfHtml?.repairSplitCodeBlocks;
  if (!repair || !adf) return html;
  return repair(html, adf);
}

// Cloud Jira renders ADF by converting it to wiki markup first, and body text that
// looks like markup (`{index}` in inline code, `*굵게*` closed right before a Korean
// character, `[^a-z0-9_-]`) breaks that conversion for the rest of the document -
// headings, rules, lists and tables come back as literal `h4.` / `----` / `||a||b||`
// text. Targeted repairs cannot help because the structure is already lost, so when
// the damage is detected we drop the rendered HTML and draw everything from the ADF.
function replaceWikiMangledHtml(html, adf, attachments, jiraBaseUrl, mediaOptions = {}) {
  const isDamaged = self.FishHookAdfHtml?.hasWikiMarkupDamage;
  const render = self.FishHookAdfHtml?.renderAdfNodeToHtml;
  if (!isDamaged || !render || !adf) return html;
  if (!isDamaged(html, adf)) return html;

  const rebuilt = render(adf, adfRenderOptions(attachments, jiraBaseUrl, mediaOptions));
  // A doc the renderer cannot turn into anything is worse than mangled markup.
  return rebuilt && rebuilt.trim() ? rebuilt : html;
}

// Jira Cloud paints text/background color marks from its own stylesheet, which the
// Fisheye page never loads. Turn those marks into real inline declarations before
// anything else looks at the HTML.
function restoreColorMarks(html) {
  const normalize = self.FishHookAdfHtml?.normalizeColorMarks;
  return normalize ? normalize(html) : html;
}

function parseIssueDescription(json, jiraBaseUrl, mediaOptions = {}) {
  const attachments = json?.fields?.attachment;
  const description = json?.fields?.description;
  const adf = description && typeof description === 'object' ? description : null;

  const rendered = json?.renderedFields?.description;
  if (rendered && String(rendered).trim()) {
    // Order matters: color marks before anything reads the HTML, media before the
    // ADF repairs so restored nodes reuse the same attachment matching, and table
    // widths last so every table - including ones the repairs just built - is counted.
    const media = [adf, attachments, jiraBaseUrl, mediaOptions];
    let html = restoreColorMarks(sanitizeHtml(rendered));
    html = resolveMediaInHtml(html, ...media);
    html = restoreAdfMacroPlaceholders(html, ...media);
    html = restoreCascadedCodeFences(html, ...media);
    html = restoreSplitCodeBlocks(html, adf);
    html = replaceWikiMangledHtml(html, ...media);
    html = restoreAdfTableWidths(html, adf);
    const text = stripHtmlToText(html);
    if (hasRenderableHtml(html, text)) return { html, text };
  }

  if (typeof description === 'string' && description.trim()) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(description);
    const html = looksHtml
      ? resolveMediaInHtml(
          restoreColorMarks(sanitizeHtml(description)),
          adf,
          attachments,
          jiraBaseUrl,
          mediaOptions
        )
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

function projectKeyOf(json, issueKey) {
  const fromField = String(json?.fields?.project?.key || '').trim();
  if (fromField) return fromField;
  const match = /^([A-Z][A-Z0-9]+)-\d+$/.exec(String(issueKey || '').toUpperCase());
  return match ? match[1] : '';
}

// Cloud/Server both expose versions as [{ id, name, released, archived }].
// The tag link mirrors the issue view: project release report filtered by version.
function parseVersionList(list, jiraBaseUrl, projectKey) {
  if (!Array.isArray(list)) return [];
  const versions = [];
  for (const item of list) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const id = item?.id === undefined || item?.id === null ? '' : String(item.id).trim();
    const url =
      id && projectKey
        ? `${jiraBaseUrl}/projects/${encodeURIComponent(projectKey)}/versions/${encodeURIComponent(
            id
          )}/tab/release-report-all-issues`
        : '';
    versions.push({
      name,
      url,
      released: item?.released === true,
      archived: item?.archived === true,
    });
  }
  return versions;
}

// The issue view renders this next to the summary; the REST field is stable
// across Cloud/Server, unlike the AI "Improve issue" button label.
function parseIssueType(json) {
  const issuetype = json?.fields?.issuetype;
  const name = String(issuetype?.name || '').trim();
  if (!name) return null;
  return { name, subtask: issuetype?.subtask === true };
}

// `statusCategory.key` is the stable machine value (`new` / `indeterminate` /
// `done`); the name is localized per Jira instance, so only the key drives color.
function parseIssueStatus(json) {
  const status = json?.fields?.status;
  const name = String(status?.name || '').trim();
  if (!name) return null;
  const key = String(status?.statusCategory?.key || '').trim().toLowerCase();
  const category = ['new', 'indeterminate', 'done'].includes(key) ? key : 'unknown';
  return { name, category };
}

// The `attachment` field is already fetched for ADF media matching; this exposes
// the same array to the UI so attachments that never appear inline are visible
// too. `content` is a full URL on Cloud and a `/secure/attachment/...` path on
// Server, so both go through `attachmentContentUrl`.
function parseAttachmentList(json, jiraBaseUrl) {
  const list = Array.isArray(json?.fields?.attachment) ? json.fields.attachment : [];
  const attachments = [];
  for (const item of list) {
    const filename = String(item?.filename || '').trim();
    const url = attachmentContentUrl(jiraBaseUrl, item);
    if (!filename || !url) continue;
    const size = Number(item?.size);
    attachments.push({
      id: item?.id == null ? '' : String(item.id),
      filename,
      url,
      mimeType: String(item?.mimeType || '').trim(),
      size: Number.isFinite(size) && size >= 0 ? size : null,
      created: String(item?.created || '').trim(),
    });
  }
  return attachments;
}

function parseIssueVersions(json, jiraBaseUrl, issueKey) {
  const projectKey = projectKeyOf(json, issueKey);
  return {
    fixVersions: parseVersionList(json?.fields?.fixVersions, jiraBaseUrl, projectKey),
    affectsVersions: parseVersionList(json?.fields?.versions, jiraBaseUrl, projectKey),
  };
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
    )}?fields=summary,description,attachment,project,issuetype,status,fixVersions,versions&expand=renderedFields`;

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
      const meta = {
        ...parseIssueVersions(json, jiraBaseUrl, key),
        issueType: parseIssueType(json),
        status: parseIssueStatus(json),
        attachments: parseAttachmentList(json, jiraBaseUrl),
      };
      const parsed = parseIssueDescription(json, jiraBaseUrl, { includeVideo });
      if (parsed) {
        return {
          ok: true,
          issueKey: key,
          issueUrl,
          issueTitle,
          ...meta,
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
          ...meta,
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

// chrome.runtime.sendMessage serializes with JSON, not structured clone. An
// ArrayBuffer crosses the boundary as `{}`, and `new Blob([{}])` silently
// becomes the 15-byte string "[object Object]" — a broken image, a markdown
// preview showing that literal text. Bytes have to travel as a string.
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  // String.fromCharCode.apply overflows the stack past ~64k arguments.
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
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
    return { ok: true, base64: arrayBufferToBase64(buffer), contentType };
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
