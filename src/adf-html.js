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

  // ADF omits colspan/rowspan when they are 1; treat anything unusable as 1 too.
  function spanCount(value) {
    const span = Number(value);
    return Number.isFinite(span) && span > 1 ? Math.floor(span) : 1;
  }

  function spanAttr(name, value) {
    const span = spanCount(value);
    return span > 1 ? ` ${name}="${span}"` : '';
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
      // `!important` because the injected stylesheet forces a default text color on
      // every span/p/li/td to undo Fisheye's washed-out styles - see normalizeColorMarks.
      case 'textColor': {
        const color = safeColor(attrs.color);
        return color ? `<span style="color:${escapeAttr(color)} !important">${html}</span>` : html;
      }
      case 'backgroundColor': {
        const color = safeColor(attrs.color);
        return color
          ? `<span style="background-color:${escapeAttr(color)} !important">${html}</span>`
          : html;
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
    // Per-cell `colwidth` is not emitted here; `renderTable` turns it into a
    // proportional <colgroup> so column ratios survive the narrow preview panel.
    return (
      `<${tag}${spanAttr('colspan', attrs.colspan)}${spanAttr('rowspan', attrs.rowspan)}${style}>` +
      `${children(node, options)}</${tag}>`
    );
  }

  // Collects one pixel width per table column from the cells' `colwidth` arrays.
  // A spanning cell carries one entry per column it covers, so we walk columns in
  // document order and keep the first width seen for each. Returns null unless every
  // column ends up with a usable width — a partial map would misalign the table.
  function tableColumnWidths(node) {
    const widths = [];
    let columnCount = 0;

    (Array.isArray(node?.content) ? node.content : [])
      .filter((row) => row?.type === 'tableRow')
      .forEach((row) => {
        let column = 0;
        (Array.isArray(row.content) ? row.content : []).forEach((cellNode) => {
          const span = spanCount(cellNode?.attrs?.colspan);
          const declared = cellNode?.attrs?.colwidth;
          for (let i = 0; i < span; i += 1) {
            if (widths[column + i] === undefined && Array.isArray(declared)) {
              const width = Number(declared[i]);
              if (Number.isFinite(width) && width > 0) widths[column + i] = width;
            }
          }
          column += span;
        });
        columnCount = Math.max(columnCount, column);
      });

    if (!columnCount) return null;
    for (let i = 0; i < columnCount; i += 1) {
      if (widths[i] === undefined) return null;
    }
    return widths.slice(0, columnCount);
  }

  // Pixel widths are relative to the Jira editor (~1300px), so they would crush the
  // first column of a 480px preview panel. Normalising to percentages keeps the
  // author's column ratios while the table itself stays at 100% of the panel —
  // the same thing Jira's own renderer does when it scales a table down.
  function renderColgroup(widths) {
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (!total) return '';
    const cols = widths
      .map((width) => `<col style="width:${((width / total) * 100).toFixed(4)}%">`)
      .join('');
    return `<colgroup>${cols}</colgroup>`;
  }

  // The table's own pixel width, published as a custom property the stylesheet feeds
  // to `width: min(var(--fishhook-table-width), 100%)`. Wide viewports get the exact
  // size the author picked in Jira; narrower ones shrink to fit instead of scrolling.
  //
  // `attrs.width` is what Jira stores when the table itself was resized - that happens
  // independently of dragging column dividers, so a table can have a width with no
  // `colwidth` anywhere. Fall back to the column sum for the reverse case.
  function tableWidthDecl(node, widths) {
    const declared = Number(node?.attrs?.width);
    const total =
      Number.isFinite(declared) && declared > 0
        ? declared
        : (widths || []).reduce((sum, width) => sum + width, 0);
    return total > 0 ? `--fishhook-table-width:${Math.round(total)}px` : '';
  }

  // `data-fishhook-tablewidth` drives the width clamp; `data-fishhook-colwidth` also
  // switches on `table-layout: fixed`, which only makes sense once a colgroup exists.
  function widthAttrs(widthDecl, colgroup) {
    return (
      (widthDecl ? ' data-fishhook-tablewidth="true"' : '') +
      (colgroup ? ' data-fishhook-colwidth="true"' : '')
    );
  }

  // Appends a declaration to an opening tag's inline style, creating the attribute
  // when the tag has none.
  function withInlineStyle(openTag, declaration) {
    if (!declaration) return openTag;
    const existing = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(openTag);
    if (existing) {
      const merged = existing[2].replace(/;\s*$/, '');
      const value = merged ? `${merged};${declaration}` : declaration;
      return openTag.replace(existing[0], ` style=${existing[1]}${value}${existing[1]}`);
    }
    return `${openTag.slice(0, -1)} style="${declaration}">`;
  }

  function renderTable(node, options) {
    const rows = (Array.isArray(node.content) ? node.content : [])
      .filter((row) => row?.type === 'tableRow')
      .map((row) => `<tr>${children(row, options)}</tr>`)
      .join('');
    const layout = String(node.attrs?.layout || '');
    const layoutAttr = /^[a-z-]+$/.test(layout) ? ` data-layout="${layout}"` : '';
    const widths = tableColumnWidths(node);
    const colgroup = widths ? renderColgroup(widths) : '';
    const widthDecl = tableWidthDecl(node, widths);
    const openTag = withInlineStyle(
      `<table class="wiki-table" data-fishhook-adf-table="true"${widthAttrs(widthDecl, colgroup)}${layoutAttr}>`,
      widthDecl
    );
    return `${openTag}${colgroup}<tbody>${rows}</tbody></table>`;
  }

  const TABLE_OPEN_RE = /<table\b[^>]*>/gi;

  function collectAdfTables(node, found = []) {
    if (!node || typeof node !== 'object') return found;
    if (node.type === 'table') found.push(node);
    if (Array.isArray(node.content)) node.content.forEach((child) => collectAdfTables(child, found));
    return found;
  }

  // Jira Cloud only emits an `ADF macro` placeholder for tables its HTML converter
  // gives up on (merged cells). Tables it *can* convert come back as real markup with
  // `colwidth` stripped, so the author's column ratios are lost before we ever see them.
  // The widths survive in the raw ADF, so splice a proportional <colgroup> back in.
  //
  // Rendered tables pair with ADF `table` nodes 1:1 in document order. If the counts
  // disagree we leave everything alone - a shifted pairing would size the wrong columns,
  // which is worse than the even split we already fall back to.
  function applyAdfTableWidths(html, adf) {
    const source = String(html || '');
    if (!adf || !source) return source;

    const openings = source.match(TABLE_OPEN_RE);
    if (!openings) return source;
    const tables = collectAdfTables(adf);
    if (tables.length !== openings.length) return source;

    let index = -1;
    return source.replace(TABLE_OPEN_RE, (openTag, offset) => {
      index += 1;
      // Tables rebuilt from ADF were already sized when they were rendered.
      if (/data-fishhook-(?:col|table)width/i.test(openTag)) return openTag;

      const node = tables[index];
      const widths = tableColumnWidths(node);
      // A colgroup the host already supplied wins; we only fill the gap.
      const hasOwnColgroup = /^\s*<colgroup/i.test(source.slice(offset + openTag.length));
      const colgroup = widths && !hasOwnColgroup ? renderColgroup(widths) : '';
      const widthDecl = tableWidthDecl(node, widths);
      if (!colgroup && !widthDecl) return openTag;

      const marked = `${openTag.slice(0, -1)}${widthAttrs(widthDecl, colgroup)}>`;
      return `${withInlineStyle(marked, widthDecl)}${colgroup}`;
    });
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

  // A code block whose last line ends with `\` eats its own closing `{noformat}`:
  // in wiki markup the backslash escapes the newline, so the fence is pulled onto
  // the code's last line and stops closing anything. Every later fence then pairs
  // off by one - prose renders inside code panels, code renders as paragraphs, and
  // tables survive only as raw `||...||` markup - for the whole rest of the
  // document. Nothing downstream of the break is trustworthy, so we cut the HTML
  // at the damaged panel and re-render the tail from the raw ADF.
  const PRE_RE = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
  const PANEL_OPEN_RE = /<div class="(?:code|preformatted) panel\b/gi;

  // Where to cut: the wrapper Jira puts around the panel, so we do not leave
  // orphaned `<div>`s behind. Falls back to the `<pre>` itself.
  function panelStart(source, preStart) {
    PANEL_OPEN_RE.lastIndex = 0;
    let cut = preStart;
    let match;
    while ((match = PANEL_OPEN_RE.exec(source)) && match.index < preStart) {
      cut = match.index;
    }
    return cut;
  }

  // The index in `doc.content` of the top-level node whose subtree holds this
  // code block - the code block may sit inside a list, and slicing has to happen
  // at the top level to keep the HTML well formed.
  function topLevelIndexOfCodeBlock(adf, wanted) {
    const top = Array.isArray(adf?.content) ? adf.content : [];
    for (let i = 0; i < top.length; i += 1) {
      const blocks = collectNodesByType(top[i]).get('codeBlock') || [];
      if (blocks.some((block) => comparableCode(codeBlockText(block)) === wanted)) return i;
    }
    return -1;
  }

  function repairCascadedCodeFences(html, adf, options) {
    const source = String(html || '');
    if (!source || !adf) return source;
    FENCE_RE.lastIndex = 0;
    if (!FENCE_RE.test(source)) return source;

    PRE_RE.lastIndex = 0;
    let match;
    while ((match = PRE_RE.exec(source))) {
      const text = decodeEntities(match[1]);
      FENCE_RE.lastIndex = 0;
      const fence = FENCE_RE.exec(text);
      if (!fence) continue;

      // Only the text before the fence belongs to this code block; everything
      // after it is swallowed prose.
      const wanted = comparableCode(text.slice(0, fence.index));
      if (!wanted || wanted === comparableCode(text)) continue;

      const index = topLevelIndexOfCodeBlock(adf, wanted);
      if (index < 0) continue;

      const tail = adf.content
        .slice(index)
        .map((node) => renderNode(node, options))
        .join('');
      if (!tail) continue;

      return source.slice(0, panelStart(source, match.index)) + tail;
    }
    return source;
  }

  // Jira Cloud renders a color mark as a class plus a CSS custom property:
  //
  //   <span data-text-custom-color="#0747a6" class="fabric-text-color-mark"
  //         style="--custom-palette-color: var(--ds-text-accent-blue, #1558BC);">
  //
  // The `color` itself comes from Jira's own stylesheet (`.fabric-text-color-mark`),
  // which Fisheye never loads, so the color is simply lost. Translate the mark into a
  // real declaration. The `var()` fallback is preferred over the data attribute
  // because it holds the design-token value Jira actually paints today; the data
  // attribute keeps the older palette hex.
  //
  // `!important` is required: content/fisheye-content.css forces a default text color
  // on every span/p/li/td/th/div to undo Fisheye's washed-out styles, and a stylesheet
  // `!important` beats a plain inline declaration.
  const TAG_RE = /<([a-z][a-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(["'])([^"']*)\2/i;
  const PALETTE_VAR_RE = /--custom-palette-color\s*:\s*([^;"']+)/i;
  const VAR_FALLBACK_RE = /var\(\s*[^,()]+,\s*([^)]+)\)/i;
  const COLOR_PROPS = new Set(['color', 'background-color']);

  function colorMarkProperty(attrs) {
    if (/data-background-custom-color|fabric-background-color-mark/i.test(attrs)) {
      return 'background-color';
    }
    if (/data-text-custom-color|fabric-text-color-mark/i.test(attrs)) return 'color';
    return '';
  }

  function markColorValue(attrs, property) {
    const declared = PALETTE_VAR_RE.exec(attrs);
    if (declared) {
      const value = declared[1].trim();
      const fallback = VAR_FALLBACK_RE.exec(value);
      const picked = safeColor(fallback ? fallback[1] : value);
      if (picked) return picked;
    }
    const dataAttr = property === 'color' ? 'text' : 'background';
    const fromData = new RegExp(`data-${dataAttr}-custom-color\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
    return fromData ? safeColor(fromData[1]) : '';
  }

  // Server/DC and older Cloud output carry a plain `color: ...`, which loses to the
  // same stylesheet rule. Only values we recognize are touched, so `var(...)` and
  // anything unparseable is left exactly as it was.
  function forceImportant(styleBody) {
    return styleBody
      .split(';')
      .map((part) => {
        const colon = part.indexOf(':');
        if (colon < 0) return part;
        const prop = part.slice(0, colon).trim().toLowerCase();
        if (!COLOR_PROPS.has(prop)) return part;
        const value = part.slice(colon + 1).trim();
        if (!safeColor(value)) return part;
        return `${part.slice(0, colon)}:${value} !important`;
      })
      .join(';');
  }

  function withStyleDeclaration(attrs, declaration) {
    if (STYLE_ATTR_RE.test(attrs)) {
      return attrs.replace(STYLE_ATTR_RE, (all, prefix, quote, body) => {
        const trimmed = body.trim().replace(/;\s*$/, '');
        const merged = declaration ? `${trimmed ? `${trimmed};` : ''}${declaration}` : trimmed;
        return `${prefix}${quote}${forceImportant(merged)}${quote}`;
      });
    }
    if (!declaration) return attrs;
    // Keep the trailing slash of a self-closing tag last.
    const selfClosing = /\/\s*$/.exec(attrs);
    const head = selfClosing ? attrs.slice(0, selfClosing.index) : attrs;
    return `${head} style="${declaration}"${selfClosing ? ' /' : ''}`;
  }

  function normalizeColorMarks(html) {
    const source = String(html || '');
    if (!source) return source;
    TAG_RE.lastIndex = 0;
    return source.replace(TAG_RE, (all, tag, attrs) => {
      const property = colorMarkProperty(attrs);
      const color = property ? markColorValue(attrs, property) : '';
      const declaration = color ? `${property}:${escapeAttr(color)} !important` : '';
      if (!declaration && !STYLE_ATTR_RE.test(attrs)) return all;
      return `<${tag}${withStyleDeclaration(attrs, declaration)}>`;
    });
  }

  return {
    normalizeColorMarks,
    renderAdfNodeToHtml: renderNode,
    fillAdfMacroPlaceholders,
    repairSplitCodeBlocks,
    repairCascadedCodeFences,
    applyAdfTableWidths,
    escapeHtml,
  };
});
