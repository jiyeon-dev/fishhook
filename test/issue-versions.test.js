'use strict';

// Covers the Fix versions / Affects versions payload the objectives banner
// renders as tags.
const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');

const bg = loadBackground();

function parseVersions(json, issueKey = 'GS-1234') {
  return bg.call('parseIssueVersions(__json, "https://acme.atlassian.net", __key)', {
    __json: json,
    __key: issueKey,
  });
}

test('maps both version fields to named tags with release-report links', () => {
  const result = parseVersions({
    fields: {
      project: { key: 'GS' },
      fixVersions: [{ id: 10796, name: '3.0.10 (RC)', released: false }],
      versions: [{ id: '10500', name: '3.0.9', released: true }],
    },
  });

  assert.deepEqual(result.fixVersions, [
    {
      name: '3.0.10 (RC)',
      url: 'https://acme.atlassian.net/projects/GS/versions/10796/tab/release-report-all-issues',
      released: false,
      archived: false,
    },
  ]);
  assert.deepEqual(result.affectsVersions, [
    {
      name: '3.0.9',
      url: 'https://acme.atlassian.net/projects/GS/versions/10500/tab/release-report-all-issues',
      released: true,
      archived: false,
    },
  ]);
});

test('falls back to the issue key prefix when the project field is absent', () => {
  const result = parseVersions({ fields: { fixVersions: [{ id: '7', name: '1.0' }] } }, 'abc-9');
  assert.strictEqual(
    result.fixVersions[0].url,
    'https://acme.atlassian.net/projects/ABC/versions/7/tab/release-report-all-issues'
  );
});

test('keeps unnamed or missing versions out of the payload', () => {
  const result = parseVersions({
    fields: { fixVersions: [{ id: '1', name: '  ' }, { id: '2' }], versions: null },
  });
  assert.deepEqual(result.fixVersions, []);
  assert.deepEqual(result.affectsVersions, []);
});

test('reads the issue type name from the REST field', () => {
  const result = bg.call('parseIssueType({ fields: { issuetype: __type } })', {
    __type: { name: ' 동작오류 (Problem) ', subtask: false },
  });
  assert.deepEqual(result, { name: '동작오류 (Problem)', subtask: false });
});

test('returns no issue type when the field is missing or unnamed', () => {
  assert.strictEqual(bg.call('parseIssueType({ fields: {} })'), null);
  assert.strictEqual(bg.call('parseIssueType({ fields: { issuetype: { name: " " } } })'), null);
});

test('reads the status name and normalises the status category', () => {
  const result = bg.call('parseIssueStatus({ fields: { status: __status } })', {
    __status: { name: ' 해결됨 ', statusCategory: { key: 'Done' } },
  });
  assert.deepEqual(result, { name: '해결됨', category: 'done' });
});

test('marks an unrecognised or missing status category as unknown', () => {
  const result = bg.call(
    'parseIssueStatus({ fields: { status: { name: "Custom", statusCategory: { key: "undefined" } } } })'
  );
  assert.deepEqual(result, { name: 'Custom', category: 'unknown' });
  assert.strictEqual(bg.call('parseIssueStatus({ fields: {} })'), null);
});

test('emits a plain tag when the version has no id to link to', () => {
  const result = parseVersions({ fields: { versions: [{ name: 'unscheduled' }] } });
  assert.strictEqual(result.affectsVersions[0].url, '');
});
