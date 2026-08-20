'use strict';

// Exercises the real background.js in a minimal service-worker shim so the
// renderedFields -> ADF placeholder repair is covered end to end.
const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');

const bg = loadBackground();

function parse(json, options = {}) {
  return bg.call('parseIssueDescription(__json, "https://acme.atlassian.net", __options)', {
    __json: json,
    __options: options,
  });
}

function paragraph(text) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

const MERGED_TABLE_ADF = {
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', attrs: {}, content: [paragraph('구분')] },
        { type: 'tableHeader', attrs: {}, content: [paragraph('변경 전')] },
        { type: 'tableHeader', attrs: {}, content: [paragraph('변경 후')] },
      ],
    },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', attrs: { rowspan: 2 }, content: [paragraph('위협 관리')] },
        {
          type: 'tableCell',
          attrs: {},
          content: [
            {
              type: 'mediaSingle',
              attrs: { width: 546 },
              content: [
                {
                  type: 'media',
                  attrs: { id: '9001', collection: 'attachment', alt: 'before.png', type: 'file' },
                },
              ],
            },
          ],
        },
        { type: 'tableCell', attrs: {}, content: [paragraph('후1')] },
      ],
    },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', attrs: {}, content: [paragraph('전2')] },
        { type: 'tableCell', attrs: {}, content: [paragraph('후2')] },
      ],
    },
  ],
};

function issue(renderedHtml) {
  return {
    fields: {
      summary: 'JIRA-1',
      description: { type: 'doc', version: 1, content: [paragraph('머리말'), MERGED_TABLE_ADF] },
      attachment: [
        { id: 9001, filename: 'before.png', mimeType: 'image/png', content: '/secure/attachment/9001/before.png' },
      ],
    },
    renderedFields: { description: renderedHtml },
  };
}

test('rebuilds a merged-cell table that Jira Cloud left as an ADF macro comment', () => {
  const result = parse(issue("<p>머리말</p>\n<!-- ADF macro (type = 'table') -->"));

  assert.ok(result, 'description should parse');
  assert.doesNotMatch(result.html, /ADF macro/);
  assert.match(result.html, /<table class="wiki-table"/);
  assert.match(result.html, /rowspan="2"/);
  assert.match(result.html, /<th\b[^>]*>\s*<p>변경 전<\/p>/);
  assert.match(result.html, /<p>머리말<\/p>/);
});

test('resolves media inside the rebuilt table to an absolute Jira URL', () => {
  const result = parse(issue("<!-- ADF macro (type = 'table') -->"));

  assert.match(result.html, /data-node-type="mediaSingle"/);
  assert.match(
    result.html,
    /<img class="fishhook-jira-media fishhook-jira-image" alt="before\.png" src="https:\/\/acme\.atlassian\.net\/secure\/attachment\/9001\/before\.png"/
  );
});

test('rebuilt table text reaches the plain-text fallback', () => {
  const result = parse(issue("<!-- ADF macro (type = 'table') -->"));
  assert.match(result.text, /변경 전/);
  assert.match(result.text, /위협 관리/);
});

test('leaves normal rendered tables untouched', () => {
  const rendered = '<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr></tbody></table>';
  const result = parse(issue(rendered));
  assert.strictEqual(result.html, rendered);
});

// Jira converts unmerged tables to HTML itself and throws colwidth away on the way.
test('restores column widths that Jira dropped from a converted table', () => {
  const widthCell = (type, width, text) => ({
    type,
    attrs: { colwidth: [width] },
    content: [paragraph(text)],
  });
  const json = {
    fields: {
      summary: 'JIRA-2',
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'table',
            attrs: { layout: 'align-start', width: 650 },
            content: [
              {
                type: 'tableRow',
                content: [
                  widthCell('tableHeader', 113, '페이지명'),
                  widthCell('tableHeader', 293, '이미지'),
                  widthCell('tableHeader', 243, '설명'),
                ],
              },
            ],
          },
        ],
      },
    },
    renderedFields: {
      description:
        '<div class="table-wrap">\n<table class="confluenceTable wiki-table"><tbody>\n' +
        '<tr>\n<th class="confluenceTh"><b>페이지명</b></th>\n' +
        '<th class="confluenceTh"><b>이미지</b></th>\n' +
        '<th class="confluenceTh"><b>설명</b></th>\n</tr>\n</tbody></table>\n</div>',
    },
  };

  const result = parse(json);

  assert.match(result.html, /data-fishhook-colwidth="true"/);
  assert.match(
    result.html,
    /<colgroup><col style="width:17\.4114%"><col style="width:45\.1464%"><col style="width:37\.4422%"><\/colgroup>/
  );
  assert.match(result.html, /<th class="confluenceTh"><b>페이지명<\/b><\/th>/);
});

test('resolves media whose attachment filename carries the media UUID suffix', () => {
  const mediaId = 'f059930b-7143-4a16-9043-2866adb7bb60';
  const json = issue("<!-- ADF macro (type = 'table') -->");
  // Same clean alt, but stored under a disambiguated filename.
  json.fields.description.content[1].content[1].content[1].content[0].content[0].attrs = {
    id: mediaId,
    alt: 'before.png',
    type: 'file',
  };
  json.fields.attachment = [
    { id: 9001, filename: `before (${mediaId}).png`, mimeType: 'image/png', content: '/secure/attachment/9001/x.png' },
  ];

  const result = parse(json);
  assert.doesNotMatch(result.html, /fishhook-media-placeholder/);
  assert.match(result.html, /src="https:\/\/acme\.atlassian\.net\/secure\/attachment\/9001\/x\.png"/);
});

test('honours includeVideo=false for media inside a rebuilt table', () => {
  const json = issue("<!-- ADF macro (type = 'table') -->");
  json.fields.attachment[0].mimeType = 'video/mp4';
  const result = parse(json, { includeVideo: false });

  assert.doesNotMatch(result.html, /<video\b/);
  assert.match(result.html, /fishhook-video-placeholder/);
});

test('puts a list-nested code block back into its empty code panel', () => {
  const code = 'ln -sf /usr/bin/unzip /bin/unzip && \\\nln -sf /usr/bin/pkill /bin/pkill && \\';
  const json = issue(
    '<ul><li><p>기타</p><ul><li>' +
      '<div class="preformatted panel" style="border-width: 1px;">' +
      '<div class="preformattedContent panelContent"><pre></pre></div></div>\n' +
      '<p>ln -sf /usr/bin/unzip /bin/unzip &amp;&amp; \\<br>' +
      'ln -sf /usr/bin/pkill /bin/pkill &amp;&amp; {noformat}</p>' +
      '</li></ul></li></ul>'
  );
  json.fields.description.content = [
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
                  content: [{ type: 'codeBlock', content: [{ type: 'text', text: code }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  const result = parse(json);

  assert.doesNotMatch(result.html, /\{noformat\}/);
  assert.doesNotMatch(result.html, /<p>ln -sf/);
  assert.match(result.html, /<pre>ln -sf \/usr\/bin\/unzip[\s\S]*pkill &amp;&amp; \\<\/pre>/);
});

test('rebuilds the tail after a trailing backslash swallows a code fence', () => {
  const code = '%UserProfile%\\.wix\\extensions\\\n   └── WixToolset.Util.wixext\\7.0.0\\';
  const json = issue(
    '<p>머리말</p>\n' +
      '<div class="code panel" style="border-width: 1px;"><div class="codeContent panelContent">' +
      `<pre class="code-plain">${code}{noformat}\n\n*중요*: 경로에 배치해야 합니다.\n\n</pre>` +
      '</div></div>\n<p>wix eula accept wix7</p>\n' +
      '<div class="code panel" style="border-width: 1px;"><div class="codeContent panelContent">' +
      '<pre class="code-plain">||구분||변경 전||변경 후||\n</pre></div></div>'
  );
  json.fields.description.content = [
    paragraph('머리말'),
    { type: 'codeBlock', content: [{ type: 'text', text: code }] },
    paragraph('중요: 경로에 배치해야 합니다.'),
    { type: 'codeBlock', content: [{ type: 'text', text: 'wix eula accept wix7' }] },
    MERGED_TABLE_ADF,
  ];

  const result = parse(json);

  assert.doesNotMatch(result.html, /\{noformat\}/);
  assert.doesNotMatch(result.html, /\|\|구분\|\|/);
  assert.match(result.html, /<p>머리말<\/p>/);
  assert.match(result.html, /<p>중요: 경로에 배치해야 합니다\.<\/p>/);
  assert.match(result.html, /<pre><code>wix eula accept wix7<\/code><\/pre>/);
  assert.match(result.html, /<table class="wiki-table"[^>]*>[\s\S]*rowspan="2"/);
  // Media inside the re-rendered tail still resolves to an absolute Jira URL.
  assert.match(result.html, /src="https:\/\/acme\.atlassian\.net\/secure\/attachment\/9001\/before\.png"/);
});

test('색상 마크가 파이프라인을 지나며 인라인 color로 살아남는다', () => {
  const { html } = parse({
    fields: { description: { type: 'doc', content: [paragraph('설명')] }, attachment: [] },
    renderedFields: {
      description:
        '<p>앞 <span data-text-custom-color="#0747a6" class="fabric-text-color-mark" ' +
        'style="--custom-palette-color: var(--ds-text-accent-blue, #1558BC);">파랑</span> 뒤</p>',
    },
  });

  assert.match(html, /color:#1558BC !important/);
  assert.match(html, /파랑<\/span>/);
});

// GS-13104: Cloud Jira converts ADF -> wiki markup -> HTML, and `{index}` inside
// inline code closes its own `{{...}}` fence. Everything after it - heading, rule,
// bold, table - comes back as literal markup inside the list item that was open.
test('wiki 마크업으로 뭉개진 본문은 ADF에서 통째로 다시 그린다', () => {
  const json = issue(
    '<ul><li><code class="wiki-inline-code">POST /mc/api/events/analysis/\n{index</code>} (bulk)<br>\n' +
      'h4. How do users configure and use it?<br>\n' +
      '----<br>\n' +
      '* 대상은 *허용 인덱스 7개*로 한정<br>\n' +
      '||구분||변경 전||변경 후||<br>\n' +
      '</li></ul>'
  );
  json.fields.description.content = [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'POST /mc/api/events/analysis/{index}', marks: [{ type: 'code' }] },
        { type: 'text', text: ' (bulk)' },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 4 },
      content: [{ type: 'text', text: 'How do users configure and use it?' }],
    },
    { type: 'rule' },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '대상은 ' },
                { type: 'text', text: '허용 인덱스 7개', marks: [{ type: 'strong' }] },
                { type: 'text', text: '로 한정' },
              ],
            },
          ],
        },
      ],
    },
    MERGED_TABLE_ADF,
  ];

  const result = parse(json);

  // 새어나온 위키 마크업이 하나도 남지 않는다.
  assert.doesNotMatch(result.html, /h4\. How do users/);
  assert.doesNotMatch(result.html, /\|\|구분\|\|/);
  assert.doesNotMatch(result.html, /----/);
  assert.doesNotMatch(result.html, /\*허용 인덱스 7개\*/);

  // 구조가 실제 태그로 복원된다.
  assert.match(result.html, /<code class="wiki-inline-code">POST \/mc\/api\/events\/analysis\/\{index\}<\/code> \(bulk\)/);
  assert.match(result.html, /<h4>How do users configure and use it\?<\/h4>/);
  assert.match(result.html, /<hr>/);
  assert.match(result.html, /<strong>허용 인덱스 7개<\/strong>/);
  assert.match(result.html, /<table class="wiki-table"[^>]*>[\s\S]*rowspan="2"/);
  // 다시 그린 문서 안의 미디어도 첨부파일로 해석된다.
  assert.match(
    result.html,
    /src="https:\/\/acme\.atlassian\.net\/secure\/attachment\/9001\/before\.png"/
  );
});

test('정상 렌더 결과는 ADF 재렌더로 바뀌지 않는다', () => {
  const json = issue('<p>머리말</p>\n<!-- ADF macro (type = \'table\') -->');
  const result = parse(json);
  // 표는 자리표시자 복원 경로로 들어오고, 문단은 Jira가 준 HTML 그대로다.
  assert.match(result.html, /^<p>머리말<\/p>/);
});
