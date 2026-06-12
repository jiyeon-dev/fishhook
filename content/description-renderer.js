(function () {
  'use strict';

  if (window.FishHookDescriptionRenderer) return;

  const CODE_BLOCK_SELECTOR =
    '[data-node-type="codeBlock"], [data-type="codeBlock"], [data-code-block], [data-testid="renderer-code-block"], [data-ds--code--code-block]';

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function mapCodeLang(raw) {
    const normalized = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^language-/, '');
    if (!normalized) return 'plain';
    if (normalized === 'js') return 'javascript';
    return normalized.replace(/[^a-z0-9+#.-]/g, '') || 'plain';
  }

  function readCodeLang(block, pre, code) {
    for (const attr of ['data-code-lang', 'data-language', 'data-lang']) {
      const fromBlock = block?.getAttribute?.(attr);
      if (fromBlock) return fromBlock;
      const fromPre = pre?.getAttribute?.(attr);
      if (fromPre) return fromPre;
      const fromCode = code?.getAttribute?.(attr);
      if (fromCode) return fromCode;
    }

    const classTarget = code || pre || block;
    const className = classTarget?.className || '';
    const match = String(className).match(/(?:language-|lang-)([a-z0-9+#.-]+)/i);
    return match ? match[1] : '';
  }

  function looksLikeJson(text) {
    const value = String(text || '').trim();
    return Boolean(value && (value.startsWith('{') || value.startsWith('[')) && value.includes('"'));
  }

  function highlightCode(text, lang) {
    const raw = String(text || '');
    if (!raw.trim()) return '';
    const escaped = escapeHtml(raw);
    const normalized = mapCodeLang(lang);
    const jsonStyle = normalized === 'json' || looksLikeJson(raw);
    const javaStyle = !jsonStyle && ['java', 'javascript', 'groovy', 'kotlin', 'scala'].includes(normalized);

    let out = '';
    let i = 0;
    while (i < escaped.length) {
      const ch = escaped[i];

      if (javaStyle && ch === '#') {
        let end = escaped.indexOf('\n', i);
        if (end === -1) end = escaped.length;
        out += `<span class="code-comment">${escaped.slice(i, end)}</span>`;
        i = end;
        continue;
      }

      if (ch === '"' || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < escaped.length) {
          if (escaped[j] === '\\') {
            j += 2;
            continue;
          }
          if (escaped[j] === quote) {
            j += 1;
            break;
          }
          j += 1;
        }
        out += `<span class="code-quote">${escaped.slice(i, j)}</span>`;
        i = j;
        continue;
      }

      const rest = escaped.slice(i);
      const keyword = rest.match(/^(true|false|null)\b/);
      if (keyword) {
        out += `<span class="code-keyword">${keyword[1]}</span>`;
        i += keyword[1].length;
        continue;
      }

      if (javaStyle) {
        const method = rest.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
        if (method) {
          out += `<span class="code-keyword">${method[1]}</span>`;
          i += method[1].length;
          continue;
        }
      }

      out += ch;
      i += 1;
    }
    return out;
  }

  function createCodePanel(doc, innerHtml, lang) {
    const outer = doc.createElement('div');
    outer.className = 'code panel';
    outer.style.borderWidth = '1px';

    const content = doc.createElement('div');
    content.className = 'codeContent panelContent';

    const pre = doc.createElement('pre');
    pre.className = `code-${mapCodeLang(lang)}`;
    pre.innerHTML = innerHtml || '';

    content.appendChild(pre);
    outer.appendChild(content);
    return outer;
  }

  function getPlainCodeText(block, pre, code) {
    if (code) return code.textContent || '';
    if (pre) return pre.textContent || '';
    return block?.textContent || '';
  }

  function getCodeInnerHtml(pre, code) {
    if (code) return code.innerHTML;
    if (!pre) return '';
    const onlyCode = pre.querySelector(':scope > code');
    if (onlyCode && pre.children.length === 1) return onlyCode.innerHTML;
    if ((pre.textContent || '').trim() && !pre.querySelector('*')) return escapeHtml(pre.textContent || '');
    return pre.innerHTML;
  }

  function convertCodeBlocks(doc) {
    const blocks = new Set();
    doc.querySelectorAll(CODE_BLOCK_SELECTOR).forEach((el) => blocks.add(el));
    doc.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest('.code.panel')) return;
      if (pre.closest(CODE_BLOCK_SELECTOR)) return;
      blocks.add(pre);
    });

    blocks.forEach((block) => {
      const pre = block.tagName === 'PRE' ? block : block.querySelector('pre');
      const code = (pre && pre.querySelector('code')) || block.querySelector('code');
      const lang = readCodeLang(block, pre, code);
      const text = getPlainCodeText(block, pre, code);
      let innerHtml = getCodeInnerHtml(pre, code);
      if (!innerHtml.trim()) innerHtml = escapeHtml(text);
      if (!/<span\s+class="code-(quote|keyword|comment)/i.test(innerHtml)) {
        innerHtml = highlightCode(text, lang);
      }
      block.replaceWith(createCodePanel(doc, innerHtml, lang));
    });
  }

  function unwrapCodeWrappers(doc) {
    doc.querySelectorAll('.preformatted.panel').forEach((wrapper) => {
      const codePanel = wrapper.querySelector('.code.panel');
      if (codePanel) wrapper.replaceWith(codePanel);
    });
    doc.querySelectorAll('.preformattedContent.panelContent').forEach((wrapper) => {
      const codePanel = wrapper.querySelector(':scope > .code.panel');
      if (codePanel) wrapper.replaceWith(codePanel);
    });
  }

  function ensureCodeContentWrapper(doc) {
    doc.querySelectorAll('.code.panel').forEach((panel) => {
      if (panel.querySelector(':scope > .codeContent.panelContent')) return;
      const pre = panel.querySelector(':scope > pre');
      if (!pre) return;
      const content = doc.createElement('div');
      content.className = 'codeContent panelContent';
      panel.insertBefore(content, pre);
      content.appendChild(pre);
    });
  }

  function normalizeTables(doc) {
    doc.querySelectorAll('table').forEach((table) => {
      table.classList.add('wiki-table');
    });
  }

  function normalizeMedia(doc) {
    doc.querySelectorAll('[data-testid="media-badges"], table button').forEach((el) => el.remove());
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('blob:')) return;
      const alt =
        img.getAttribute('alt') ||
        img.getAttribute('data-file-name') ||
        img.closest('[data-file-name]')?.getAttribute('data-file-name') ||
        'image';
      const placeholder = doc.createElement('span');
      placeholder.className = 'fishhook-media-placeholder';
      placeholder.textContent = `[image: ${alt}]`;
      img.replaceWith(placeholder);
    });
  }

  function isInsideCode(node) {
    let el = node.parentElement;
    while (el) {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'code' || tag === 'pre') return true;
      if (el.classList?.contains('code') || el.classList?.contains('codeContent')) return true;
      if (el.closest?.('.code.panel')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function unescapeWikiInlineContent(text) {
    return String(text || '')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\\{/g, '{')
      .replace(/\\\}/g, '}')
      .replace(/\\#/g, '#');
  }

  function splitWikiInlineMarkup(text) {
    const parts = [];
    const source = String(text ?? '');
    let index = 0;

    while (index < source.length) {
      if (source[index] === '{' && source[index + 1] === '{') {
        const open = index;
        index += 2;
        let inner = '';
        let closed = false;
        while (index < source.length) {
          if (source[index] === '\\' && index + 1 < source.length) {
            inner += source[index + 1];
            index += 2;
            continue;
          }
          if (source[index] === '}' && source[index + 1] === '}') {
            index += 2;
            closed = true;
            break;
          }
          inner += source[index];
          index += 1;
        }
        if (closed) {
          parts.push({ type: 'code', value: unescapeWikiInlineContent(inner) });
        } else {
          parts.push({ type: 'text', value: source.slice(open, index) });
        }
        continue;
      }

      if (source[index] === '`') {
        const open = index;
        index += 1;
        let inner = '';
        let closed = false;
        while (index < source.length) {
          if (source[index] === '\\' && index + 1 < source.length) {
            inner += source[index + 1];
            index += 2;
            continue;
          }
          if (source[index] === '`') {
            index += 1;
            closed = true;
            break;
          }
          inner += source[index];
          index += 1;
        }
        if (closed) {
          parts.push({ type: 'code', value: unescapeWikiInlineContent(inner) });
        } else {
          parts.push({ type: 'text', value: source.slice(open, index) });
        }
        continue;
      }

      let next = source.length;
      const brace = source.indexOf('{{', index);
      const tick = source.indexOf('`', index);
      if (brace !== -1) next = Math.min(next, brace);
      if (tick !== -1) next = Math.min(next, tick);
      if (next > index) parts.push({ type: 'text', value: source.slice(index, next) });
      index = next;
    }

    return parts;
  }

  function appendWikiInlineMarkupParts(doc, fragment, parts) {
    parts.forEach((part) => {
      if (part.type === 'code') {
        const code = doc.createElement('code');
        code.className = 'wiki-inline-code';
        code.textContent = part.value;
        fragment.appendChild(code);
        return;
      }
      if (part.value) fragment.appendChild(doc.createTextNode(part.value));
    });
  }

  function replaceTextNodeWithWikiInlineMarkup(doc, textNode) {
    const parts = splitWikiInlineMarkup(textNode.textContent);
    if (!parts.some((part) => part.type === 'code')) return false;

    const fragment = doc.createDocumentFragment();
    appendWikiInlineMarkupParts(doc, fragment, parts);
    textNode.parentNode.replaceChild(fragment, textNode);
    return true;
  }

  function normalizeInlineCodeElements(doc) {
    doc.querySelectorAll('code, kbd').forEach((el) => {
      if (el.closest('pre') || el.closest('.code.panel')) return;
      el.className = 'wiki-inline-code';
    });
  }

  function canFlattenTableCellMarkup(cell) {
    if (cell.querySelector('table, pre, .code.panel, img, a')) return false;
    return true;
  }

  function stripOrphanWikiDelimitersAroundInlineCode(doc) {
    doc.querySelectorAll('code, kbd').forEach((codeEl) => {
      if (codeEl.closest('pre') || codeEl.closest('.code.panel')) return;

      let next = codeEl.nextSibling;
      while (next?.nodeType === Node.TEXT_NODE) {
        const original = next.textContent || '';
        const cleaned = original.replace(/^\s*\}\}+/, '');
        if (cleaned === original) break;
        next.textContent = cleaned;
        if (!cleaned.trim()) {
          const toRemove = next;
          next = next.nextSibling;
          toRemove.remove();
          continue;
        }
        break;
      }

      let previous = codeEl.previousSibling;
      while (previous?.nodeType === Node.TEXT_NODE) {
        const original = previous.textContent || '';
        const cleaned = original.replace(/\{\{+\s*$/, '');
        if (cleaned === original) break;
        previous.textContent = cleaned;
        if (!cleaned.trim()) {
          const toRemove = previous;
          previous = previous.previousSibling;
          toRemove.remove();
          continue;
        }
        break;
      }
    });
  }

  function normalizeTableCellInlineCode(doc) {
    doc.querySelectorAll('table td, table th').forEach((cell) => {
      if (cell.querySelector('code, kbd, pre, .code.panel')) return;
      if (cell.querySelector('.wiki-inline-code')) return;

      const text = cell.textContent || '';
      if (!text.includes('{{') && !text.includes('`')) return;

      const parts = splitWikiInlineMarkup(text);
      if (!parts.some((part) => part.type === 'code')) return;
      if (!canFlattenTableCellMarkup(cell)) return;

      cell.textContent = '';
      appendWikiInlineMarkupParts(doc, cell, parts);
    });
  }

  function normalizeInlineCode(doc) {
    normalizeInlineCodeElements(doc);

    const textNodes = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent || isInsideCode(node)) continue;
      if (node.textContent.includes('{{') || node.textContent.includes('`')) {
        textNodes.push(node);
      }
    }

    textNodes.forEach((textNode) => {
      replaceTextNodeWithWikiInlineMarkup(doc, textNode);
    });

    normalizeTableCellInlineCode(doc);
  }

  function addHeadingSpacers(doc) {
    doc.querySelectorAll('h4').forEach((h4) => {
      const previous = h4.previousElementSibling;
      if (previous?.classList?.contains('jira-wiki-h4-spacer')) return;
      const spacer = doc.createElement('p');
      spacer.className = 'jira-wiki-h4-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      h4.parentNode.insertBefore(spacer, h4);
    });
  }

  function render(html) {
    if (!html || !String(html).trim()) return '';
    try {
      const doc = document.implementation.createHTMLDocument('');
      doc.body.innerHTML = String(html);
      doc.querySelectorAll('script, style, link, meta, iframe, noscript').forEach((el) => el.remove());
      convertCodeBlocks(doc);
      unwrapCodeWrappers(doc);
      ensureCodeContentWrapper(doc);
      normalizeTables(doc);
      normalizeMedia(doc);
      stripOrphanWikiDelimitersAroundInlineCode(doc);
      normalizeInlineCode(doc);
      addHeadingSpacers(doc);
      return doc.body.innerHTML;
    } catch (error) {
      console.warn('[fishhook][renderer] Failed to normalize Jira description.', error);
      return String(html);
    }
  }

  window.FishHookDescriptionRenderer = { render };
})();
