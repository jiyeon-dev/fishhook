// ADF -> HTML fallback renderer.
//
// Jira Cloud's `expand=renderedFields` gives up on some ADF nodes and emits a
// placeholder comment instead of markup:
//
//   <!-- ADF macro (type = 'table') -->
//
// Tables with merged cells (rowspan/colspan) always hit this path, so the whole
// table vanishes from the preview. We rebuild those nodes from `fields.description`
// (the raw ADF) and splice them back in where the comment sat.
//
// Loaded by background.js via importScripts() and by test/ via require().
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FishHookAdfHtml = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  const MACRO_PLACEHOLDER_RE = /<!--\s*ADF macro\s*\(\s*type\s*=\s*(?:'([^']*)'|"([^"]*)")\s*\)\s*-->/gi;

  const SAFE_COLOR_RE = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
  const SAFE_LANG_RE = /[^a-z0-9+#.-]/g;

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function safeHref(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^(?:https?:|mailto:|tel:|\/)/i.test(value)) return value;
    return '';
  }

  function safeColor(raw) {
    const value = String(raw || '').trim();
    return SAFE_COLOR_RE.test(value) ? value : '';
  }

  function spanAttr(name, value) {
    const span = Number(value);
    return Number.isFinite(span) && span > 1 ? ` ${name}="${Math.floor(span)}"` : '';
  }

  function children(node, options) {
    if (!Array.isArray(node?.content)) return '';
    return node.content.map((child) => renderNode(child, options)).join('');
  }

  function applyMark(html, mark) {
    const type = mark?.type;
    const attrs = mark?.attrs || {};

    switch (type) {
      case 'strong':
        return `<strong>${html}</strong>`;
      case 'em':
        return `<em>${html}</em>`;
      case 'code':
        return `<code>${html}</code>`;
      case 'strike':
        return `<s>${html}</s>`;
      case 'underline':
        return `<u>${html}</u>`;
      case 'subsup':
        return attrs.type === 'sup' ? `<sup>${html}</sup>` : `<sub>${html}</sub>`;
      case 'link': {
        const href = safeHref(attrs.href);
        if (!href) return html;
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
      }
      case 'textColor': {
        const color = safeColor(attrs.color);
        return color ? `<span style="color:${escapeAttr(color)}">${html}</span>` : html;
      }
      case 'backgroundColor': {
        const color = safeColor(attrs.color);
        return color ? `<span style="background-color:${escapeAttr(color)}">${html}</span>` : html;
      }
      default:
        return html;
    }
  }

  // Innermost first so `link` ends up outside the emphasis, matching Jira's output.
  const MARK_ORDER = [
    'code',
    'subsup',
    'strike',
    'underline',
    'em',
    'strong',
    'textColor',
    'backgroundColor',
    'link',
  ];

  function renderText(node) {
    let html = escapeHtml(node.text);
    const marks = Array.isArray(node.marks) ? node.marks : [];
    if (!marks.length) return html;

    const ordered = [...marks].sort(
      (a, b) => MARK_ORDER.indexOf(a?.type) - MARK_ORDER.indexOf(b?.type)
    );
    ordered.forEach((mark) => {
      html = applyMark(html, mark);
    });
    return html;
  }

  function renderMediaNode(node, options) {
    const fromHost = options?.renderMedia?.(node) || '';
    if (fromHost) return fromHost;
    const label = escapeHtml(node?.attrs?.alt || node?.attrs?.id || 'media');
    return `<span class="fishhook-media-placeholder">[media: ${label}]</span>`;
  }

  function renderCell(node, options) {
    const tag = node.type === 'tableHeader' ? 'th' : 'td';
    const attrs = node.attrs || {};
    const background = safeColor(attrs.background);
    const style = background ? ` style="background-color:${escapeAttr(background)}"` : '';
    // `colwidth` is deliberately dropped: the preview panel is far narrower than the
    // Jira editor, and honouring the pixel widths crushes the first column.
    return (
      `<${tag}${spanAttr('colspan', attrs.colspan)}${spanAttr('rowspan', attrs.rowspan)}${style}>` +
      `${children(node, options)}</${tag}>`
    );
  }

  function renderTable(node, options) {
    const rows = (Array.isArray(node.content) ? node.content : [])
      .filter((row) => row?.type === 'tableRow')
      .map((row) => `<tr>${children(row, options)}</tr>`)
      .join('');
    const layout = String(node.attrs?.layout || '');
    const layoutAttr = /^[a-z-]+$/.test(layout) ? ` data-layout="${layout}"` : '';
    return `<table class="wiki-table" data-fishhook-adf-table="true"${layoutAttr}><tbody>${rows}</tbody></table>`;
  }

  function codeBlockText(node) {
    return (Array.isArray(node?.content) ? node.content : [])
      .map((child) => child?.text || '')
      .join('');
  }

  function renderCodeBlock(node) {
    const text = codeBlockText(node);
    const lang = String(node.attrs?.language || '')
      .toLowerCase()
      .replace(SAFE_LANG_RE, '');
    const langAttr = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langAttr}>${escapeHtml(text)}</code></pre>`;
  }

  function renderNode(node, options) {
    if (!node || typeof node !== 'object') return '';

    switch (node.type) {
      case 'doc':
        return children(node, options);
      case 'text':
        return renderText(node);
      case 'hardBreak':
        return '<br>';
      case 'paragraph':
        return `<p>${children(node, options)}</p>`;
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
        return `<h${level}>${children(node, options)}</h${level}>`;
      }
      case 'bulletList':
        return `<ul>${children(node, options)}</ul>`;
      case 'orderedList': {
        const order = Number(node.attrs?.order);
        const start = Number.isFinite(order) && order > 1 ? ` start="${Math.floor(order)}"` : '';
        return `<ol${start}>${children(node, options)}</ol>`;
      }
      case 'listItem':
        return `<li>${children(node, options)}</li>`;
      case 'blockquote':
        return `<blockquote>${children(node, options)}</blockquote>`;
      case 'rule':
        return '<hr>';
      case 'codeBlock':
        return renderCodeBlock(node);
      case 'panel': {
        const kind = String(node.attrs?.panelType || 'info').replace(/[^a-z]/gi, '');
        return `<div class="panel" data-panel-type="${kind}">${children(node, options)}</div>`;
      }
      case 'table':
        return renderTable(node, options);
      case 'tableRow':
        return `<tr>${children(node, options)}</tr>`;
      case 'tableHeader':
      case 'tableCell':
        return renderCell(node, options);
      case 'media':
        return renderMediaNode(node, options);
      case 'mediaSingle':
      case 'mediaGroup':
        return `<div data-node-type="mediaSingle">${children(node, options)}</div>`;
      case 'mediaInline':
        return renderMediaNode(node, options);
      case 'expand':
      case 'nestedExpand': {
        const title = escapeHtml(node.attrs?.title || '');
        return `<details open><summary>${title}</summary>${children(node, options)}</details>`;
      }
      case 'layoutSection':
      case 'layoutColumn':
        return `<div>${children(node, options)}</div>`;
      case 'inlineCard':
      case 'blockCard':
      case 'embedCard': {
        const href = safeHref(node.attrs?.url);
        if (!href) return '';
        const label = escapeHtml(node.attrs?.url);
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      case 'mention':
        return `<span class="fishhook-adf-mention">${escapeHtml(node.attrs?.text || '')}</span>`;
      case 'emoji':
        return escapeHtml(node.attrs?.text || node.attrs?.shortName || '');
      case 'status':
        return `<span class="fishhook-adf-status">${escapeHtml(node.attrs?.text || '')}</span>`;
      case 'date':
        return escapeHtml(node.attrs?.text || '');
      default:
        // Unknown node: keep the content rather than dropping it silently.
        return children(node, options);
    }
  }

  function collectNodesByType(node, out = new Map()) {
    if (!node || typeof node !== 'object') return out;
    if (node.type) {
      if (!out.has(node.type)) out.set(node.type, []);
      out.get(node.type).push(node);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => collectNodesByType(child, out));
    }
    return out;
  }

  function fillAdfMacroPlaceholders(html, adf, options) {
    const source = String(html || '');
    if (!source || !adf || !source.includes('ADF macro')) return source;

    const byType = collectNodesByType(adf);
    const cursor = new Map();

    return source.replace(MACRO_PLACEHOLDER_RE, (match, single, double) => {
      const type = single || double || '';
      const queue = byType.get(type);
      if (!queue || !queue.length) return match;

      const index = cursor.get(type) || 0;
      const node = queue[index];
      if (!node) return match;
      cursor.set(type, index + 1);

      const rendered = renderNode(node, options);
      return rendered || match;
    });
  }

  // A codeBlock nested inside a listItem breaks Jira's ADF -> wiki markup step:
  // the `{noformat}` fence lands on the list item's own line, so the wiki renderer
  // emits an empty code panel and spills the code into the next paragraph with a
  // literal `{noformat}` left behind. That paragraph is lossy (a trailing `\`
  // before the fence is eaten), so we refill the panel from the raw ADF and drop
  // the spilled paragraph.
  const EMPTY_PRE_RE = /<pre\b([^>]*)>\s*(?:<code\b[^>]*>\s*<\/code>\s*)?<\/pre>/gi;
  const PARAGRAPH_RE = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const FENCE_RE = /\{(?:noformat|code)(?::[^}\n]*)?\}/gi;

  function decodeEntities(text) {
    return String(text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&amp;/gi, '&');
  }

  // Compares a spilled paragraph against ADF code text. Backslashes and runs of
  // whitespace are ignored because that is exactly what the broken conversion
  // mangles.
  function comparableCode(text) {
    return String(text)
      .replace(FENCE_RE, '')
      .replace(/\\/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSpilledCodeParagraph(source, from) {
    PARAGRAPH_RE.lastIndex = from;
    const match = PARAGRAPH_RE.exec(source);
    if (!match) return null;
    FENCE_RE.lastIndex = 0;
    if (!FENCE_RE.test(match[1])) return null;
    return {
      start: match.index,
      end: match.index + match[0].length,
      text: decodeEntities(match[1]),
    };
  }

  function repairFirstSplitCodeBlock(source, codeTexts) {
    EMPTY_PRE_RE.lastIndex = 0;
    let match;
    while ((match = EMPTY_PRE_RE.exec(source))) {
      const preEnd = match.index + match[0].length;
      const spilled = findSpilledCodeParagraph(source, preEnd);
      if (!spilled) continue;

      const wanted = comparableCode(spilled.text);
      const text = wanted && codeTexts.find((candidate) => comparableCode(candidate) === wanted);
      if (!text) continue;

      return (
        source.slice(0, match.index) +
        `<pre${match[1]}>${escapeHtml(text)}</pre>` +
        source.slice(preEnd, spilled.start) +
        source.slice(spilled.end)
      );
    }
    return '';
  }

  function repairSplitCodeBlocks(html, adf) {
    let source = String(html || '');
    if (!source || !adf) return source;
    FENCE_RE.lastIndex = 0;
    if (!FENCE_RE.test(source)) return source;

    const codeTexts = (collectNodesByType(adf).get('codeBlock') || [])
      .map(codeBlockText)
      .filter((text) => text.trim());
    if (!codeTexts.length) return source;

    // One repair per pass; the guard keeps a pathological document from looping.
    for (let pass = 0; pass < codeTexts.length; pass += 1) {
      const repaired = repairFirstSplitCodeBlock(source, codeTexts);
      if (!repaired) break;
      source = repaired;
    }
    return source;
  }

  return {
    renderAdfNodeToHtml: renderNode,
    fillAdfMacroPlaceholders,
    repairSplitCodeBlocks,
    escapeHtml,
  };
});
