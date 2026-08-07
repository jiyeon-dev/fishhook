'use strict';

// The issue type / status / version row shared by the Objectives banner and the
// Description preview panel.
const test = require('node:test');
const assert = require('node:assert');

const { loadContentScript } = require('./helpers/load-content-script.js');

const win = loadContentScript('content/issue-meta.js');
const { buildSegments, buildEntries, hasFields, buildStatus } = win.FishHookIssueMeta;

const LABELS = { fixVersions: 'Fix versions', affectsVersions: 'Affects versions' };

test('renders type, status and both version groups in order', () => {
  const segments = buildSegments(
    {
      issueType: { name: '동작오류 (Problem)' },
      status: { name: '해결됨', category: 'done' },
      fixVersions: [{ name: '3.0.10', url: 'https://acme/versions/1' }],
      affectsVersions: [{ name: '3.0.9', url: '' }],
    },
    LABELS
  );

  assert.strictEqual(segments.length, 4);
  assert.match(segments[0], /fishhook-issue-meta__type">동작오류 \(Problem\)</);
  assert.match(segments[1], /fishhook-issue-meta__status--done">해결됨</);
  assert.match(segments[2], /Fix versions/);
  assert.match(segments[2], /<a class="fishhook-version-tag fishhook-version-tag--fix"/);
  assert.match(segments[3], /Affects versions/);
  // No id to link to, so the tag is a plain span.
  assert.match(segments[3], /<span class="fishhook-version-tag fishhook-version-tag--affects">/);
});

test('keeps the version groups with a placeholder when the issue has none', () => {
  const segments = buildSegments({ issueType: { name: 'Task' } }, LABELS);
  assert.strictEqual(segments.length, 3);
  assert.match(segments[1], /fishhook-issue-meta__versions-empty">-</);
  assert.match(segments[2], /fishhook-issue-meta__versions-empty">-</);
});

test('drops the type and status segments when the fields are missing', () => {
  const segments = buildSegments({ issueType: { name: ' ' }, status: null }, LABELS);
  assert.strictEqual(segments.length, 2);
  assert.match(segments[0], /Fix versions/);
});

test('falls back to an unknown status variant for an unrecognised category', () => {
  assert.match(buildStatus({ name: 'Custom', category: '' }), /__status--unknown/);
  assert.match(buildStatus({ name: 'In Review', category: 'INDETERMINATE' }), /__status--indeterminate/);
  assert.strictEqual(buildStatus({ name: '  ' }), '');
});

test('escapes field values', () => {
  const segments = buildSegments(
    {
      status: { name: '<img src=x>', category: 'new' },
      fixVersions: [{ name: 'v"1', url: 'https://acme/a?b=1&c=2' }],
    },
    LABELS
  );
  assert.ok(!segments.join('').includes('<img'));
  assert.match(segments.join(''), /href="https:\/\/acme\/a\?b=1&amp;c=2"/);
});

test('groups the entries so the panel can break after the status', () => {
  const entries = buildEntries(
    { issueType: { name: 'Bug' }, status: { name: 'In Progress', category: 'indeterminate' } },
    LABELS
  );
  assert.deepEqual(
    entries.map((entry) => [entry.key, entry.group]),
    [
      ['issueType', 'issue'],
      ['status', 'issue'],
      ['fixVersions', 'versions'],
      ['affectsVersions', 'versions'],
    ]
  );
});

test('reports whether there is anything worth showing', () => {
  // A failed fetch carries no fields — the panel hides the row instead of
  // rendering two bare "-" placeholders.
  assert.strictEqual(hasFields({ ok: false }), false);
  assert.strictEqual(hasFields(null), false);
  assert.strictEqual(hasFields({ fixVersions: [], affectsVersions: [] }), false);
  assert.strictEqual(hasFields({ status: { name: '해결됨' } }), true);
  assert.strictEqual(hasFields({ affectsVersions: [{ name: '1.0' }] }), true);
});
