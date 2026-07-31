'use strict';

// Runs the real background.js inside a minimal service-worker shim so tests can
// call its top-level functions without a browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function loadBackground() {
  const sandbox = {
    console,
    URL,
    Blob,
    fetch: async () => {
      throw new Error('network disabled in tests');
    },
    chrome: {
      runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      tabs: {},
      scripting: {},
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  let context;
  sandbox.importScripts = (...files) => {
    files.forEach((file) => {
      vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    });
  };

  context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8'), context, {
    filename: 'background.js',
  });

  return {
    context,
    call(expression, args = {}) {
      Object.entries(args).forEach(([key, value]) => {
        context[key] = value;
      });
      return vm.runInContext(expression, context);
    },
  };
}

module.exports = { loadBackground };
