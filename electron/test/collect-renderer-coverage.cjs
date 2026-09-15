/* Test-runner only: Electron's renderer is not a child process wrapped by nyc. */
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Loaded as a Mocha file only by test:renderer:coverage. Flush before mocha-done
// closes the renderer; process-exit delivery is not a reliable coverage boundary.
after(() => {
  const coverage = globalThis.__coverage__;
  assert.ok(coverage && Object.keys(coverage).length, 'Renderer coverage instrumentation produced no counters.');
  const root = path.resolve(__dirname, '../..');
  const configuration = JSON.parse(fs.readFileSync(path.join(root, '.nycrc.json'), 'utf8'));
  const directory = path.resolve(root, configuration['temp-dir']);
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, `renderer-${randomUUID()}.json`), JSON.stringify(coverage), {flag: 'wx'});
});
