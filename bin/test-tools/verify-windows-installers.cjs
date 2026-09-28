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

const AdmZip = require('adm-zip');

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {findArchives} = require('./verify-package-contents.cjs');

function exactlyOne(directory, pattern, label) {
  const matches = fs.readdirSync(directory).filter(name => pattern.test(name));
  assert.equal(matches.length, 1, `Expected exactly one ${label}.`);
  const file = path.join(directory, matches[0]);
  assert.ok(fs.statSync(file).isFile() && fs.statSync(file).size > 0, `${label} must be a nonempty file.`);
  return file;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function verifyWindowsInstallers(distDirectory, buildDirectory) {
  const setup = exactlyOne(distDirectory, /-Setup\.exe$/i, 'Squirrel setup');
  const full = exactlyOne(distDirectory, /-full\.nupkg$/i, 'Squirrel full package');
  const releases = exactlyOne(distDirectory, /^RELEASES$/i, 'Squirrel RELEASES');
  const msi = exactlyOne(distDirectory, /\.msi$/i, 'MSI');
  const releaseEntries = fs.readFileSync(releases, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.ok(
    releaseEntries.some(line => line.trim().split(/\s+/)[1] === path.basename(full)),
    'Squirrel RELEASES must name the produced full package.',
  );

  const references = findArchives(buildDirectory);
  assert.equal(references.length, 1, 'Expected exactly one verified unpacked app archive.');
  const expectedSha256 = sha256(fs.readFileSync(references[0]));
  const zip = new AdmZip(full);
  const archives = zip.getEntries().filter(entry => /(?:^|\/)resources\/app\.asar$/i.test(entry.entryName));
  assert.equal(archives.length, 1, 'Squirrel full package must contain exactly one application archive.');
  const payloadSha256 = sha256(archives[0].getData());
  assert.equal(payloadSha256, expectedSha256, 'Squirrel application archive differs from verified unpacked archive.');
  return {
    formats: ['squirrel-setup', 'squirrel-full', 'squirrel-releases', 'msi'],
    files: [setup, full, releases, msi].map(file => ({name: path.basename(file), bytes: fs.statSync(file).size})),
    appArchiveSha256: expectedSha256,
    squirrelArchiveMatchesBuild: true,
    msiPayloadInspected: false,
  };
}

module.exports = {verifyWindowsInstallers};
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 4, 'Pass the installer and unpacked-build directories.');
    process.stdout.write(`${JSON.stringify(verifyWindowsInstallers(process.argv[2], process.argv[3]), null, 2)}\n`);
  } catch (error) {
    console.error(`Windows installer verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
