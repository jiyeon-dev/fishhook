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
