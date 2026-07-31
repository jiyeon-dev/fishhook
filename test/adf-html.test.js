'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { renderAdfNodeToHtml, fillAdfMacroPlaceholders } = require('../src/adf-html.js');

function paragraph(text) {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function cell(type, attrs, text) {
  return { type, attrs, content: [paragraph(text)] };
}

// Jira Cloud table with merged cells, mirroring the ADF behind
// `<!-- ADF macro (type = 'table') -->` in renderedFields.
const MERGED_TABLE = {
  type: 'table',
  attrs: { layout: 'align-start' },
  content: [
    {
      type: 'tableRow',
      content: [
        cell('tableHeader', { colwidth: [172] }, ''),
        cell('tableHeader', { colwidth: [560] }, '변경 전'),
        cell('tableHeader', { colwidth: [583] }, '변경 후'),
      ],
    },
    {
      type: 'tableRow',
      content: [
        cell('tableCell', { rowspan: 2, colwidth: [172] }, '위협 관리'),
        cell('tableCell', {}, '전1'),
        cell('tableCell', {}, '후1'),
      ],
    },
    {
      type: 'tableRow',
      content: [cell('tableCell', {}, '전2'), cell('tableCell', {}, '후2')],
    },
    {
      type: 'tableRow',
      content: [cell('tableCell', { colspan: 3 }, '전체 병합')],
    },
  ],
};

test('renders a table with rowspan and colspan attributes', () => {
  const html = renderAdfNodeToHtml(MERGED_TABLE);

  assert.match(html, /^<table\b/);
  assert.match(html, /class="wiki-table"/);
  assert.match(html, /<tbody>/);
  assert.match(html, /rowspan="2"/);
  assert.match(html, /colspan="3"/);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 4);
  assert.strictEqual((html.match(/<th\b/g) || []).length, 3);
  assert.strictEqual((html.match(/<td\b/g) || []).length, 6);
});

test('does not emit colspan/rowspan when they are 1', () => {
  const html = renderAdfNodeToHtml(MERGED_TABLE);
  assert.doesNotMatch(html, /(col|row)span="1"/);
});

test('does not emit colgroup widths that squeeze columns in a narrow preview', () => {
  const html = renderAdfNodeToHtml(MERGED_TABLE);
  assert.doesNotMatch(html, /<colgroup|<col\b/);
});

test('renders inline marks and escapes text', () => {
  const html = renderAdfNodeToHtml({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'a<b>', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' & ' },
      { type: 'text', text: 'c', marks: [{ type: 'code' }] },
      { type: 'hardBreak' },
      {
        type: 'text',
        text: 'link',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }],
      },
    ],
  });

  assert.strictEqual(
    html,
    '<p><strong>a&lt;b&gt;</strong> &amp; <code>c</code><br>' +
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">link</a></p>'
  );
});

test('renders lists and code blocks inside cells', () => {
  const html = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            attrs: {},
            content: [
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [paragraph('하나')] }],
              },
              {
                type: 'codeBlock',
                attrs: { language: 'java' },
                content: [{ type: 'text', text: 'int a = 1;' }],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.match(html, /<ul><li><p>하나<\/p><\/li><\/ul>/);
  assert.match(html, /<pre><code class="language-java">int a = 1;<\/code><\/pre>/);
});

test('delegates media nodes to the host renderer', () => {
  const seen = [];
  const html = renderAdfNodeToHtml(
    {
      type: 'tableCell',
      attrs: {},
      content: [
        {
          type: 'mediaSingle',
          attrs: { width: 546 },
          content: [{ type: 'media', attrs: { id: 'abc', alt: 'shot.png', type: 'file' } }],
        },
      ],
    },
    {
      renderMedia(node) {
        seen.push(node.attrs.id);
        return '<img src="https://jira/x.png">';
      },
    }
  );

  assert.deepStrictEqual(seen, ['abc']);
  assert.match(html, /data-node-type="mediaSingle"/);
  assert.match(html, /<img src="https:\/\/jira\/x\.png">/);
});

test('falls back to a placeholder when media cannot be resolved', () => {
  const html = renderAdfNodeToHtml(
    { type: 'media', attrs: { id: 'zzz', alt: '없는 파일.png' } },
    { renderMedia: () => '' }
  );
  assert.strictEqual(
    html,
    '<span class="fishhook-media-placeholder">[media: 없는 파일.png]</span>'
  );
});

test('replaces ADF macro placeholders in document order', () => {
  const adf = {
    type: 'doc',
    content: [paragraph('앞'), MERGED_TABLE, paragraph('사이'), MERGED_TABLE, paragraph('뒤')],
  };
  const rendered =
    '<p>앞</p>\n<!-- ADF macro (type = \'table\') -->\n<p>사이</p>\n' +
    "<!-- ADF macro (type = 'table') -->\n<p>뒤</p>";

  const out = fillAdfMacroPlaceholders(rendered, adf);

  assert.doesNotMatch(out, /ADF macro/);
  assert.strictEqual((out.match(/<table\b/g) || []).length, 2);
  assert.ok(out.indexOf('<p>사이</p>') > out.indexOf('<table'));
});

test('leaves placeholders alone when the ADF has no matching node', () => {
  const rendered = "<!-- ADF macro (type = 'expand') -->";
  const out = fillAdfMacroPlaceholders(rendered, { type: 'doc', content: [paragraph('x')] });
  assert.strictEqual(out, rendered);
});

test('matches the placeholder comment regardless of spacing and quoting', () => {
  const adf = { type: 'doc', content: [MERGED_TABLE] };
  const out = fillAdfMacroPlaceholders('<!--ADF macro (type="table")-->', adf);
  assert.match(out, /<table\b/);
});

test('is a no-op when there is no ADF or no placeholder', () => {
  assert.strictEqual(fillAdfMacroPlaceholders('<p>x</p>', null), '<p>x</p>');
  assert.strictEqual(fillAdfMacroPlaceholders('<p>x</p>', { type: 'doc', content: [] }), '<p>x</p>');
});

test('renders nested tables found inside an expand placeholder', () => {
  const adf = {
    type: 'doc',
    content: [
      {
        type: 'expand',
        attrs: { title: '접힌 영역' },
        content: [MERGED_TABLE],
      },
    ],
  };
  const out = fillAdfMacroPlaceholders("<!-- ADF macro (type = 'table') -->", adf);
  assert.match(out, /rowspan="2"/);
});
