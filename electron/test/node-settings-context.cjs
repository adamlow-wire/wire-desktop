// Node-only adapter for settings filesystem tests. Native CI uses the actual
// Electron app/logger instead. Never load this in an application or Electron test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {LogFactory} = require('@wireapp/commons');

assert.equal(process.versions.electron, undefined, 'This adapter is only for Node-only settings tests.');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-node-settings-'));
process.once('exit', () => fs.rmSync(directory, {recursive: true, force: true}));
for (const [filename, exports] of [
  [require.resolve('electron'), {app: {getPath: () => directory}}],
  [
    path.resolve(__dirname, '../src/logging/getLogger.ts'),
    {getLogger: name => LogFactory.getLogger(name, {namespace: '@wireapp/desktop', forceEnable: true})},
  ],
]) {
  require.cache[filename] = {id: filename, filename, loaded: true, exports};
}
