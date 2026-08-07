'use strict';

// Runs a content script inside a minimal window shim so tests can call the pure
// helpers it registers on `window` without a DOM.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function loadContentScript(relativePath, extraGlobals = {}) {
  const sandbox = {
    console,
    URL,
    Blob,
    TextDecoder,
    TextEncoder,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'), context, {
    filename: relativePath,
  });

  return sandbox;
}

module.exports = { loadContentScript };
