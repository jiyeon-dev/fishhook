'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadContentScript } = require('./helpers/load-content-script.js');

const win = loadContentScript('content/attachment-list.js');
const { build, classify, formatSize, formatDate } = win.FishHookAttachmentList;

test('classifies by MIME type first, then by extension', () => {
  assert.strictEqual(classify({ filename: 'shot.png', mimeType: 'image/png' }), 'image');
  assert.strictEqual(classify({ filename: 'spec.pdf', mimeType: 'application/pdf' }), 'pdf');
  assert.strictEqual(classify({ filename: 'notes.txt', mimeType: 'text/plain' }), 'text');
  assert.strictEqual(classify({ filename: 'sheet.xlsx', mimeType: 'application/vnd.ms-excel' }), 'download');
});

test('treats known text extensions as previewable even when Jira reports octet-stream', () => {
  // Jira Cloud commonly stores .md and .log uploads as application/octet-stream.
  assert.strictEqual(
    classify({ filename: 'incidentResponder_20260730_01.md', mimeType: 'application/octet-stream' }),
    'text'
  );
  assert.strictEqual(classify({ filename: 'server.log', mimeType: 'application/octet-stream' }), 'text');
  assert.strictEqual(classify({ filename: 'logs.zip', mimeType: 'application/octet-stream' }), 'download');
});

test('classifies images by extension when the MIME type is missing', () => {
  assert.strictEqual(classify({ filename: 'diagram.SVG', mimeType: '' }), 'image');
  assert.strictEqual(classify({ filename: 'noextension', mimeType: '' }), 'download');
});

test('formats sizes in B / KB / MB', () => {
  assert.strictEqual(formatSize(0), '0 B');
  assert.strictEqual(formatSize(1023), '1023 B');
  assert.strictEqual(formatSize(20480), '20 KB');
  assert.strictEqual(formatSize(1258291), '1.2 MB');
  assert.strictEqual(formatSize(null), '');
});

test('keeps the date as Jira reported it instead of shifting timezones', () => {
  assert.strictEqual(formatDate('2026-07-31T16:17:04.123+0900'), '2026-07-31');
  assert.strictEqual(formatDate(''), '');
});

test('builds nothing when there are no attachments', () => {
  assert.strictEqual(build([]), '');
  assert.strictEqual(build(undefined), '');
});

test('builds a rule, a counted title and one list item per attachment', () => {
  const html = build(
    [
      { filename: 'a.md', url: 'https://jira.example.com/rest/api/3/attachment/content/1', mimeType: '', size: 20480, created: '2026-07-31T16:17:04.000+0900' },
      { filename: 'b.png', url: 'https://jira.example.com/rest/api/3/attachment/content/2', mimeType: 'image/png', size: 512, created: '2026-07-30T09:00:00.000+0900' },
    ],
    { attachmentsTitle: 'Attachments' }
  );

  assert.match(html, /<hr class="fishhook-attachments__rule">/);
  assert.match(html, /Attachments \(2\)/);
  assert.strictEqual(html.match(/<li class="fishhook-attachments__item">/g).length, 2);
  assert.match(html, /data-fishhook-attachment-kind="text"/);
  assert.match(html, /data-fishhook-attachment-kind="image"/);
  assert.match(html, /20 KB · 2026-07-31/);
});

test('lists attachments already rendered inline in the body', () => {
  // The section exists so nothing is hidden; a failed inline match must not also
  // remove the file from the list.
  const html = build(
    [{ filename: 'inline.png', url: 'https://jira.example.com/rest/api/3/attachment/content/9', mimeType: 'image/png', size: 1, created: '' }],
    {}
  );
  assert.match(html, /inline\.png/);
});

test('drops entries without a filename or a resolvable URL', () => {
  const html = build(
    [
      { filename: '', url: 'https://jira.example.com/rest/api/3/attachment/content/1' },
      { filename: 'ok.txt', url: '' },
      { filename: 'good.txt', url: 'https://jira.example.com/rest/api/3/attachment/content/3' },
    ],
    {}
  );
  assert.match(html, /\(1\)/);
  assert.match(html, /good\.txt/);
});

test('escapes filenames so they cannot break out of the markup', () => {
  const html = build(
    [{ filename: '"><img src=x onerror=alert(1)>.txt', url: 'https://jira.example.com/rest/api/3/attachment/content/4' }],
    {}
  );
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&quot;&gt;&lt;img/);
});
