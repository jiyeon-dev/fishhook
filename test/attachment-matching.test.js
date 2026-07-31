'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');

const bg = loadBackground();

function match(media, attachments) {
  return bg.call('matchMediaToAttachment(__media, __attachments)', {
    __media: media,
    __attachments: attachments,
  });
}

const MEDIA_ID = 'f059930b-7143-4a16-9043-2866adb7bb60';

test('matches an attachment whose filename carries the media UUID suffix', () => {
  // Jira Cloud appends " (<media uuid>)" to the stored filename when a name
  // collides, while the ADF media node keeps the clean alt text.
  const attachments = [
    { id: 1, filename: '위협 관리 기본 정보 변경 전.png' },
    { id: 2, filename: `위협 관리 기본 정보 변경 후 (${MEDIA_ID}).png` },
  ];

  const found = match({ id: MEDIA_ID, alt: '위협 관리 기본 정보 변경 후.png' }, attachments);
  assert.strictEqual(found?.id, 2);
});

test('matches when the UUID suffix sits on the alt instead of the filename', () => {
  const attachments = [{ id: 7, filename: '변경 후.png' }];
  const found = match({ id: MEDIA_ID, alt: `변경 후 (${MEDIA_ID}).png` }, attachments);
  assert.strictEqual(found?.id, 7);
});

test('prefers the UUID-tagged attachment over a same-named untagged one', () => {
  const attachments = [
    { id: 10, filename: '변경 후.png' },
    { id: 11, filename: `변경 후 (${MEDIA_ID}).png` },
  ];
  const found = match({ id: MEDIA_ID, alt: '변경 후.png' }, attachments);
  assert.strictEqual(found?.id, 11, 'the media id in the filename is the stronger signal');
});

test('still prefers an exact filename match when no UUID is involved', () => {
  const attachments = [
    { id: 20, filename: 'a.png' },
    { id: 21, filename: 'b.png' },
  ];
  assert.strictEqual(match({ id: 'zzz', alt: 'b.png' }, attachments)?.id, 21);
});

test('refuses to guess when several attachments normalise to the same name', () => {
  const other = '11111111-2222-3333-4444-555555555555';
  const attachments = [
    { id: 30, filename: `변경 후 (${other}).png` },
    { id: 31, filename: '변경 후 (99999999-8888-7777-6666-555555555555).png' },
  ];
  // Neither carries this media's id, and picking either could show the wrong
  // screenshot in a before/after table.
  assert.strictEqual(match({ id: MEDIA_ID, alt: '변경 후.png' }, attachments), null);
});

test('keeps the existing collection/url/id matching order', () => {
  const attachments = [{ id: 309483, filename: 'other.png' }];
  assert.strictEqual(
    match({ id: '309483', collection: 'attachment', alt: 'nope.png' }, attachments)?.id,
    309483
  );
  assert.strictEqual(
    match({ id: 'x', url: '/rest/api/3/attachment/content/309483', alt: 'nope.png' }, attachments)
      ?.id,
    309483
  );
});

test('handles a UUID suffix with no file extension', () => {
  const attachments = [{ id: 40, filename: `dump (${MEDIA_ID})` }];
  assert.strictEqual(match({ id: MEDIA_ID, alt: 'dump' }, attachments)?.id, 40);
});

test('returns null when nothing matches', () => {
  assert.strictEqual(match({ id: 'a', alt: 'x.png' }, [{ id: 1, filename: 'y.png' }]), null);
  assert.strictEqual(match({ id: 'a', alt: 'x.png' }, []), null);
  assert.strictEqual(match(null, [{ id: 1, filename: 'x.png' }]), null);
});
