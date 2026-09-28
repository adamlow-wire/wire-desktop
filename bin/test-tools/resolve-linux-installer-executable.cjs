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
const fs = require('node:fs');
const path = require('node:path');

const {findArchives} = require('./verify-package-contents.cjs');

function resolveLinuxInstallerExecutable(root) {
  const archives = findArchives(path.resolve(root));
  assert.equal(archives.length, 1, 'Linux installer must contain exactly one application archive.');
  const archive = archives[0];
  asar.uncache(archive);
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  assert.match(
    metadata.desktopName,
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'Linux installer has an unsafe archived desktop identity.',
  );
  const executable = path.join(path.dirname(path.dirname(archive)), metadata.desktopName);
  assert.ok(fs.existsSync(executable), 'Linux installer executable is missing.');
  const details = fs.lstatSync(executable);
  assert.ok(details.isFile() && !details.isSymbolicLink(), 'Linux installer executable is not a regular file.');
  assert.ok((details.mode & 0o111) !== 0, 'Linux installer executable is not runnable.');
  return executable;
}

module.exports = {resolveLinuxInstallerExecutable};
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 3, 'Pass exactly one extracted Linux installer root.');
    process.stdout.write(`${resolveLinuxInstallerExecutable(process.argv[2])}\n`);
  } catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message : error?.code || error?.name || 'unknown';
    process.stderr.write(`Linux installer executable verification failed: ${detail}\n`);
    process.exitCode = 1;
  }
}
