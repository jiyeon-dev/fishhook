'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');

const bg = loadBackground();
const BASE = 'https://jira.example.com';

// The background runs in a vm context, so its objects fail deepStrictEqual's
// prototype check. Round-tripping through JSON compares by value instead.
function parse(attachment) {
  return JSON.parse(
    JSON.stringify(
      bg.call('parseAttachmentList(__json, __base)', {
        __json: { fields: { attachment } },
        __base: BASE,
      })
    )
  );
}

test('returns an empty list when the issue has no attachments', () => {
  assert.deepStrictEqual(parse(undefined), []);
  assert.deepStrictEqual(parse([]), []);
});

test('maps the REST attachment field to the UI shape', () => {
  const [item] = parse([
    {
      id: '309680',
      filename: 'incidentResponder_20260730_01.md',
      mimeType: 'text/markdown',
      size: 20480,
      created: '2026-07-31T16:17:04.000+0900',
      content: `${BASE}/rest/api/3/attachment/content/309680`,
    },
  ]);

  assert.deepStrictEqual(item, {
    id: '309680',
    filename: 'incidentResponder_20260730_01.md',
    url: `${BASE}/rest/api/3/attachment/content/309680`,
    mimeType: 'text/markdown',
    size: 20480,
    created: '2026-07-31T16:17:04.000+0900',
  });
});

test('builds the content URL from the id when the field is absent', () => {
  const [item] = parse([{ id: 42, filename: 'a.txt' }]);
  assert.strictEqual(item.url, `${BASE}/rest/api/3/attachment/content/42`);
});

test('absolutizes the Server/DC relative content path', () => {
  const [item] = parse([{ id: 7, filename: 'a.txt', content: '/secure/attachment/7/a.txt' }]);
  assert.strictEqual(item.url, `${BASE}/secure/attachment/7/a.txt`);
});

test('skips entries with no filename', () => {
  assert.deepStrictEqual(parse([{ id: 1, filename: '   ' }]), []);
});

test('normalizes an unusable size to null instead of NaN', () => {
  const [item] = parse([{ id: 1, filename: 'a.txt', size: 'unknown' }]);
  assert.strictEqual(item.size, null);
});
