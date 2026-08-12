'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  renderAdfNodeToHtml,
  fillAdfMacroPlaceholders,
  repairSplitCodeBlocks,
  repairCascadedCodeFences,
  applyAdfTableWidths,
} = require('../src/adf-html.js');

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

test('turns colwidth into proportional colgroup percentages', () => {
  const html = renderAdfNodeToHtml(MERGED_TABLE);

  // 172 / 560 / 583 out of 1315 total.
  assert.match(
    html,
    /<colgroup><col style="width:13\.0798%"><col style="width:42\.5856%"><col style="width:44\.3346%"><\/colgroup><tbody>/
  );
  assert.match(html, /data-fishhook-colwidth="true"/);
  // No attrs.width, so the column widths themselves give the natural table width.
  assert.match(html, /style="--fishhook-table-width:1315px"/);
});

// Resizing the whole table in Jira without touching a single column divider leaves
// `attrs.width` set and every `colwidth` empty.
const WIDTH_ONLY_TABLE = {
  type: 'table',
  attrs: { layout: 'align-start', width: 609 },
  content: [
    {
      type: 'tableRow',
      content: [
        cell('tableHeader', {}, '화면'),
        cell('tableHeader', {}, '권한 키'),
        cell('tableHeader', {}, '동작'),
      ],
    },
  ],
};

test('keeps the table width even when no column has its own width', () => {
  const html = renderAdfNodeToHtml(WIDTH_ONLY_TABLE);

  assert.match(html, /data-fishhook-tablewidth="true"/);
  assert.match(html, /style="--fishhook-table-width:609px"/);
  // Without per-column widths the columns stay content-sized, as in Jira.
  assert.doesNotMatch(html, /<colgroup|data-fishhook-colwidth/);
});

test('grafts a bare table width onto a rendered table', () => {
  const rendered = '<table class="confluenceTable wiki-table"><tbody></tbody></table>';
  const html = applyAdfTableWidths(rendered, { type: 'doc', content: [WIDTH_ONLY_TABLE] });

  assert.match(
    html,
    /<table class="confluenceTable wiki-table" data-fishhook-tablewidth="true" style="--fishhook-table-width:609px">/
  );
  assert.doesNotMatch(html, /<colgroup|data-fishhook-colwidth/);
});

test('prefers the ADF table width over the sum of the columns', () => {
  const html = renderAdfNodeToHtml({
    ...MERGED_TABLE,
    attrs: { ...MERGED_TABLE.attrs, width: 1300 },
  });

  assert.match(html, /style="--fishhook-table-width:1300px"/);
});

test('spreads a spanning cell colwidth across the columns it covers', () => {
  const html = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [cell('tableHeader', { colspan: 2, colwidth: [100, 300] }, '머리')],
      },
      {
        type: 'tableRow',
        content: [cell('tableCell', {}, '왼쪽'), cell('tableCell', {}, '오른쪽')],
      },
    ],
  });

  assert.match(
    html,
    /<colgroup><col style="width:25\.0000%"><col style="width:75\.0000%"><\/colgroup>/
  );
});

test('omits colgroup when any column has no width', () => {
  const html = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [cell('tableCell', { colwidth: [172] }, 'A'), cell('tableCell', {}, 'B')],
      },
    ],
  });

  assert.doesNotMatch(html, /<colgroup|<col\b/);
  assert.doesNotMatch(html, /data-fishhook-colwidth/);
});

test('omits colgroup when no cell carries colwidth', () => {
  const html = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [cell('tableCell', {}, 'A'), cell('tableCell', {}, 'B')],
      },
    ],
  });

  assert.doesNotMatch(html, /<colgroup|<col\b/);
});

test('omits colgroup when a colwidth value is zero or not a number', () => {
  const zero = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [cell('tableCell', { colwidth: [0] }, 'A'), cell('tableCell', { colwidth: [200] }, 'B')],
      },
    ],
  });
  const bogus = renderAdfNodeToHtml({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          cell('tableCell', { colwidth: ['auto'] }, 'A'),
          cell('tableCell', { colwidth: [200] }, 'B'),
        ],
      },
    ],
  });

  assert.doesNotMatch(zero, /<colgroup|<col\b/);
  assert.doesNotMatch(bogus, /<colgroup|<col\b/);
});

// Jira Cloud's renderedFields converter drops colwidth entirely for tables it *can*
// convert, so a plain (unmerged) table arrives with no colgroup at all. The widths
// still live in the raw ADF, so we graft them back on.
const PLAIN_TABLE_ADF = {
  type: 'table',
  attrs: { layout: 'align-start', width: 650 },
  content: [
    {
      type: 'tableRow',
      content: [
        cell('tableHeader', { colwidth: [113] }, '페이지명'),
        cell('tableHeader', { colwidth: [293] }, '이미지'),
        cell('tableHeader', { colwidth: [243] }, '설명'),
      ],
    },
  ],
};

const PLAIN_TABLE_DOC = { type: 'doc', version: 1, content: [PLAIN_TABLE_ADF] };

const RENDERED_PLAIN_TABLE =
  '<div class="table-wrap">\n<table class="confluenceTable wiki-table"><tbody>\n' +
  '<tr>\n<th class="confluenceTh"><b>페이지명</b></th>\n' +
  '<th class="confluenceTh"><b>이미지</b></th>\n' +
  '<th class="confluenceTh"><b>설명</b></th>\n</tr>\n</tbody></table>\n</div>';

test('grafts ADF column widths onto a rendered table that lost them', () => {
  const html = applyAdfTableWidths(RENDERED_PLAIN_TABLE, PLAIN_TABLE_DOC);

  assert.match(
    html,
    /<table class="confluenceTable wiki-table" data-fishhook-tablewidth="true" data-fishhook-colwidth="true" style="--fishhook-table-width:650px">/
  );
  assert.match(
    html,
    /<colgroup><col style="width:17\.4114%"><col style="width:45\.1464%"><col style="width:37\.4422%"><\/colgroup><tbody>/
  );
  // Everything outside the opening tag is untouched.
  assert.match(html, /<th class="confluenceTh"><b>페이지명<\/b><\/th>/);
});

test('merges the table width into an existing style attribute', () => {
  const rendered = '<table class="confluenceTable" style="border: 0"><tbody></tbody></table>';
  const html = applyAdfTableWidths(rendered, PLAIN_TABLE_DOC);

  assert.match(html, /style="border: 0;--fishhook-table-width:650px"/);
  assert.strictEqual((html.match(/style=/g) || []).length, 4); // table + 3 cols
});

test('leaves a table that already carries a colgroup alone', () => {
  const already =
    '<table class="wiki-table" data-fishhook-adf-table="true" data-fishhook-colwidth="true">' +
    '<colgroup><col style="width:50.0000%"><col style="width:50.0000%"></colgroup><tbody></tbody></table>';

  assert.strictEqual(applyAdfTableWidths(already, PLAIN_TABLE_DOC), already);
});

test('does nothing when rendered tables and ADF tables do not line up', () => {
  const twoTables = `${RENDERED_PLAIN_TABLE}${RENDERED_PLAIN_TABLE}`;

  assert.strictEqual(applyAdfTableWidths(twoTables, PLAIN_TABLE_DOC), twoTables);
});

test('does nothing when the ADF table has no usable widths', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [cell('tableHeader', {}, 'A'), cell('tableHeader', {}, 'B')],
          },
        ],
      },
    ],
  };

  assert.strictEqual(applyAdfTableWidths(RENDERED_PLAIN_TABLE, doc), RENDERED_PLAIN_TABLE);
});

test('applyAdfTableWidths is a no-op without ADF or tables', () => {
  assert.strictEqual(applyAdfTableWidths(RENDERED_PLAIN_TABLE, null), RENDERED_PLAIN_TABLE);
  assert.strictEqual(applyAdfTableWidths('<p>본문</p>', PLAIN_TABLE_DOC), '<p>본문</p>');
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

// Jira renders a codeBlock nested in a list as an EMPTY code panel plus a
// paragraph holding the code and a leftover `{noformat}` fence. The paragraph is
// lossy (a trailing `\` is eaten), so the raw ADF is the only faithful source.
const NESTED_CODE =
  'ln -sf /usr/bin/unzip /bin/unzip && \\\nln -sf /usr/bin/pkill /bin/pkill && \\';

const SPLIT_CODE_HTML =
  '<ul><li><p>기타</p><ul><li>' +
  '<div class="preformatted panel" style="border-width: 1px;">' +
  '<div class="preformattedContent panelContent"><pre></pre></div></div>\n' +
  '<p>ln -sf /usr/bin/unzip /bin/unzip &amp;&amp; \\<br>' +
  'ln -sf /usr/bin/pkill /bin/pkill &amp;&amp; {noformat}</p>' +
  '<ul><li><tt>/bin</tt>과 <tt>/usr/bin</tt>이 같은 폴더</li></ul>' +
  '</li></ul></li></ul>';

function splitCodeAdf(text = NESTED_CODE) {
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph('기타'),
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'codeBlock', content: [{ type: 'text', text }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

test('moves a leaked nested code block back into its empty code panel', () => {
  const out = repairSplitCodeBlocks(SPLIT_CODE_HTML, splitCodeAdf());

  assert.match(out, /<pre>ln -sf \/usr\/bin\/unzip \/bin\/unzip &amp;&amp; \\\n/);
  assert.match(out, /ln -sf \/usr\/bin\/pkill \/bin\/pkill &amp;&amp; \\<\/pre>/);
  assert.doesNotMatch(out, /\{noformat\}/);
  assert.doesNotMatch(out, /<p>ln -sf/);
  // Everything around the code block survives.
  assert.match(out, /<p>기타<\/p>/);
  assert.match(out, /<tt>\/bin<\/tt>/);
  assert.match(out, /class="preformatted panel"/);
});

test('repairs every leaked code block, not just the first', () => {
  const two = SPLIT_CODE_HTML + SPLIT_CODE_HTML.replace(/unzip/g, 'zip');
  const adf = {
    type: 'doc',
    content: [...splitCodeAdf().content, ...splitCodeAdf(NESTED_CODE.replace(/unzip/g, 'zip')).content],
  };

  const out = repairSplitCodeBlocks(two, adf);

  assert.doesNotMatch(out, /\{noformat\}/);
  assert.strictEqual((out.match(/<pre>ln -sf/g) || []).length, 2);
  assert.match(out, /<pre>ln -sf \/usr\/bin\/zip \/bin\/zip/);
});

test('leaves code panels alone when no ADF code block matches the leaked text', () => {
  const adf = splitCodeAdf('echo 전혀 다른 코드');
  assert.strictEqual(repairSplitCodeBlocks(SPLIT_CODE_HTML, adf), SPLIT_CODE_HTML);
});

test('does not touch healthy code panels or unrelated paragraphs', () => {
  const healthy =
    '<div class="code panel"><div class="codeContent panelContent">' +
    '<pre class="code-plain">int a = 1;</pre></div></div><p>설명 {noformat} 아님</p>';
  assert.strictEqual(repairSplitCodeBlocks(healthy, splitCodeAdf()), healthy);
});

test('repairSplitCodeBlocks is a no-op without ADF, fences, or code blocks', () => {
  assert.strictEqual(repairSplitCodeBlocks(SPLIT_CODE_HTML, null), SPLIT_CODE_HTML);
  assert.strictEqual(
    repairSplitCodeBlocks(SPLIT_CODE_HTML, { type: 'doc', content: [paragraph('x')] }),
    SPLIT_CODE_HTML
  );
  assert.strictEqual(repairSplitCodeBlocks('<p>x</p>', splitCodeAdf()), '<p>x</p>');
});

// A code block whose last line ends with `\` eats its own closing `{noformat}`:
// the backslash escapes the newline before the fence. Every later fence then
// pairs off by one, so prose lands inside code panels and code lands in
// paragraphs for the whole rest of the document.
const CASCADE_CODE = '%UserProfile%\\.wix\\extensions\\\n   └── WixToolset.Util.wixext\\7.0.0\\';

function cascadeAdf() {
  return {
    type: 'doc',
    content: [
      paragraph('폴더를 동일한 위치에 복사:'),
      { type: 'codeBlock', content: [{ type: 'text', text: CASCADE_CODE }] },
      paragraph('중요: 경로에 배치해야 합니다.'),
      { type: 'codeBlock', content: [{ type: 'text', text: 'wix eula accept wix7' }] },
      MERGED_TABLE,
    ],
  };
}

const CASCADE_HTML =
  '<p>폴더를 동일한 위치에 복사:</p>\n' +
  '<div class="code panel" style="border-width: 1px;"><div class="codeContent panelContent">' +
  '<pre class="code-plain">%UserProfile%\\.wix\\extensions\\\n' +
  '   └── WixToolset.Util.wixext\\7.0.0\\{noformat}\n\n' +
  '*중요*: 경로에 배치해야 합니다.\n\n</pre></div></div>\n' +
  '<p>wix eula accept wix7</p>\n' +
  '<div class="code panel" style="border-width: 1px;"><div class="codeContent panelContent">' +
  '<pre class="code-plain">||변경 전||\n</pre></div></div>';

test('rebuilds the document tail when a trailing backslash swallows a code fence', () => {
  const out = repairCascadedCodeFences(CASCADE_HTML, cascadeAdf());

  assert.doesNotMatch(out, /\{noformat\}/);
  // The head Jira got right is left untouched.
  assert.match(out, /^<p>폴더를 동일한 위치에 복사:<\/p>\n/);
  // The damaged code block is whole again, trailing backslash and all.
  assert.match(out, /WixToolset\.Util\.wixext\\7\.0\.0\\<\/code><\/pre>/);
  // The prose that was swallowed is prose again, and the code that leaked out is code.
  assert.match(out, /<p>중요: 경로에 배치해야 합니다\.<\/p>/);
  assert.match(out, /<pre><code>wix eula accept wix7<\/code><\/pre>/);
  assert.doesNotMatch(out, /<p>wix eula accept wix7<\/p>/);
  // The table that was stranded as wiki markup inside a code panel comes back.
  assert.doesNotMatch(out, /\|\|변경 전\|\|/);
  assert.match(out, /rowspan="2"/);
});

test('cascade repair renders media in the rebuilt tail through the host hook', () => {
  const adf = cascadeAdf();
  adf.content.push({
    type: 'mediaSingle',
    content: [{ type: 'media', attrs: { id: 'abc', type: 'file' } }],
  });
  const out = repairCascadedCodeFences(CASCADE_HTML, adf, {
    renderMedia: (node) => `<img src="/x/${node.attrs.id}">`,
  });
  assert.match(out, /<img src="\/x\/abc">/);
});

test('cascade repair leaves healthy documents alone', () => {
  const healthy =
    '<p>설명</p><div class="code panel"><div class="codeContent panelContent">' +
    '<pre class="code-plain">wix eula accept wix7</pre></div></div><p>{noformat} 이야기</p>';
  assert.strictEqual(repairCascadedCodeFences(healthy, cascadeAdf()), healthy);
  assert.strictEqual(repairCascadedCodeFences(CASCADE_HTML, null), CASCADE_HTML);
  assert.strictEqual(repairCascadedCodeFences('<p>x</p>', cascadeAdf()), '<p>x</p>');
});
