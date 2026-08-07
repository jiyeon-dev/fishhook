'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadBackground } = require('./helpers/load-background.js');
const { loadContentScript } = require('./helpers/load-content-script.js');

const bg = loadBackground();
const win = loadContentScript('content/media-loader.js', {
  document: { addEventListener() {} },
  chrome: { runtime: {} },
});

// chrome.runtime.sendMessage serializes with JSON, not structured clone: an
// ArrayBuffer crosses as `{}` and `new Blob([{}])` becomes the 15-byte string
// "[object Object]". These tests pin the string encoding that avoids that.
function overTheWire(value) {
  return JSON.parse(JSON.stringify(value));
}

function encode(bytes) {
  return bg.call('arrayBufferToBase64(__buffer)', { __buffer: Uint8Array.from(bytes).buffer });
}

test('an ArrayBuffer does not survive the message boundary', () => {
  // The regression this guards against, stated as an executable fact.
  assert.deepStrictEqual(overTheWire({ buffer: Uint8Array.from([1, 2, 3]).buffer }).buffer, {});
});

test('encodes attachment bytes as a JSON-safe string', () => {
  const encoded = encode([0, 1, 2, 250, 255]);
  assert.strictEqual(typeof encoded, 'string');
  assert.strictEqual(overTheWire({ base64: encoded }).base64, encoded);
});

test('round-trips arbitrary bytes through the message boundary', async () => {
  const original = [];
  for (let i = 0; i < 1000; i += 1) original.push(i % 256);

  const wire = overTheWire({ base64: encode(original), contentType: 'application/octet-stream' });
  const blob = win.FishHookMediaLoader.base64ToBlob(wire.base64, wire.contentType);

  assert.strictEqual(blob.size, original.length);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepStrictEqual([...bytes], original);
});

test('round-trips UTF-8 text so a markdown preview is readable', async () => {
  const source = '# 제목\n\n본문 — em dash, 이모지 🐟\n';
  const bytes = [...new TextEncoder().encode(source)];

  const wire = overTheWire({ base64: encode(bytes), contentType: 'text/markdown' });
  const blob = win.FishHookMediaLoader.base64ToBlob(wire.base64, wire.contentType);
  const text = new TextDecoder('utf-8').decode(await blob.arrayBuffer());

  assert.strictEqual(text, source);
  assert.ok(!text.includes('[object Object]'));
});

test('encodes payloads larger than one fromCharCode chunk', async () => {
  // String.fromCharCode.apply overflows the stack past ~64k arguments, so the
  // encoder chunks; 0x8000 is the chunk size, cross it deliberately.
  const size = 0x8000 * 2 + 17;
  const original = new Uint8Array(size).map((_, i) => i % 256);

  const wire = overTheWire({ base64: encode([...original]) });
  const blob = win.FishHookMediaLoader.base64ToBlob(wire.base64, 'application/octet-stream');

  assert.strictEqual(blob.size, size);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.strictEqual(bytes[size - 1], original[size - 1]);
});

test('an empty attachment yields an empty blob, not a broken one', async () => {
  const blob = win.FishHookMediaLoader.base64ToBlob(encode([]), 'text/plain');
  assert.strictEqual(blob.size, 0);
});
