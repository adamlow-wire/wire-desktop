/*
 * Wire
 * Copyright (C) 2026 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

const asar = require('@electron/asar');

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const required = [
  'package.json',
  'LICENSE',
  'electron/wire.json',
  'electron/dist/main.js',
  'electron/renderer/index.html',
  'electron/renderer/dist/bundle.js',
  'electron/dist/preload/preload-shell.js',
  'electron/dist/preload/preload-account.js',
  'electron/dist/preload/menu/preload-about.js',
  'electron/dist/preload/menu/preload-proxy-prompt.js',
  'electron/dist/preload/preload-secure-account.js',
  'electron/dist/preload/preload-display-broker.js',
  'electron/dist/preload/preload-display-pip.js',
  'electron/dist/runtime/wallClockLoader.mjs',
  'electron/dist/locale/en-US.json',
  'electron/html/about.html',
  'electron/html/proxy-prompt.html',
  'electron/html/display-capture.html',
  'electron/css/about.css',
  'electron/css/proxy-prompt.css',
  'electron/css/display-capture.css',
  'electron/css/wrapper.css',
];
const canaries = [
  '.wire-package-canary.env',
  'private-keys/wire-package-canary.pem',
  'e2e-tests/wire-package-canary.trace.zip',
];

async function verifyArchive(archive, {unsignedMacOS = false} = {}) {
  // Inspect current bytes even if this process has previously read this path.
  asar.uncache(archive);
  const entries = asar.listPackage(archive).map(file => file.replace(/^[/\\]/, '').replace(/\\/g, '/'));
  const names = new Set(entries);
  for (const name of required) {
    assert.ok(names.has(name), `Required package file missing: ${name}`);
    assert.equal(Boolean(asar.statFile(archive, name).files), false, `Required package file is a directory: ${name}`);
  }
  assert.ok(
    entries.some(name => name.startsWith('node_modules/') && name.endsWith('/package.json')),
    'Runtime dependencies missing.',
  );
  for (const name of entries) {
    const own = !name.startsWith('node_modules/');
    const allowedRoot =
      ['package.json', 'LICENSE', 'electron', 'node_modules'].includes(name) || name.startsWith('electron/') || !own;
    const ownFile = own && !asar.statFile(archive, name).files;
    const runtimeFile =
      required.includes(name) ||
      name === 'electron/renderer/dist/bundle.js.LICENSE.txt' ||
      /^electron\/img\/.+\.(?:png|ico|icns|svg)$/.test(name) ||
      /^electron\/dist\/.+\.(?:js|mjs|cjs|LICENSE\.txt)$/.test(name) ||
      /^electron\/dist\/locale\/[a-z]{2}-[A-Z]{2}\.json$/.test(name);
    const forbidden =
      name.includes('wire-package-canary') ||
      (ownFile && !runtimeFile) ||
      !allowedRoot ||
      (own &&
        (/(?:^|\/)(?:src|test|tests|fixtures)(?:\/|$)/.test(name) ||
          /\.(?:map|d\.ts)$/.test(name) ||
          /\.(?:test|spec)(?:\.|$)/.test(name) ||
          /(?:^|\/)\.env(?:\.|$)/.test(name) ||
          /\.(?:pem|key|p12|pfx)$/.test(name)));
    assert.equal(forbidden, false, 'Package contains source, test, map, key, environment or canary input.');
  }
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  assert.equal(metadata.main, 'electron/dist/main.js', 'Unexpected package entry point.');
  if (unsignedMacOS) {
    let wire;
    try {
      wire = JSON.parse(asar.extractFile(archive, 'electron/wire.json').toString('utf8'));
    } catch {
      throw new Error('Unsigned macOS update policy metadata is invalid.');
    }
    assert.equal(wire?.macAutoUpdateEnabled, false, 'Unsigned macOS update policy must explicitly disable updates.');
  }
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) {
    hash.update(chunk);
  }
  return {
    archive: path.relative(process.cwd(), archive),
    sha256: hash.digest('hex'),
    entries: entries.length,
    requiredFiles: required.length,
  };
}

function findArchives(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...findArchives(file));
    } else if (entry.isFile() && entry.name === 'app.asar' && path.basename(directory).toLowerCase() === 'resources') {
      result.push(file);
    }
  }
  return result;
}

async function main(args) {
  if (args[0] === '--seed') {
    assert.equal(args.length, 2);
    for (const name of canaries) {
      const file = path.join(args[1], name);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, 'synthetic non-secret package canary\n', {flag: 'wx', mode: 0o600});
    }
    return;
  }
  const unsignedMacOS = args[0] === '--unsigned-macos';
  if (unsignedMacOS) {
    args = args.slice(1);
  }
  assert.ok(
    args.every(arg => !arg.startsWith('--')),
    'Unknown package verification option.',
  );
  assert.ok(args.length > 0, 'Supply build output directories.');
  const archives = [...new Set(args.flatMap(directory => findArchives(directory)))];
  assert.ok(archives.length > 0, 'No packaged app.asar found.');
  const manifests = [];
  for (const archive of archives) {
    manifests.push(await verifyArchive(archive, {unsignedMacOS}));
  }
  process.stdout.write(`${JSON.stringify({archives: manifests}, null, 2)}\n`);
}
module.exports = {required, canaries, verifyArchive, findArchives, main};
if (require.main === module) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Package content verification failed.\n');
    process.exitCode = 1;
  });
}
