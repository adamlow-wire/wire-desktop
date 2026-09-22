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

const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-hockey-stream-'));
const mode = process.env.HOCKEY_STREAM_MODE;
const asset = path.join(root, 'synthetic-private-path');
if (mode === 'success') fs.writeFileSync(asset, 'synthetic asset');
const emit = result => process.stdout.write(JSON.stringify(result) + '\n');
let reads = 0,
  requests = 0,
  closed = true;
const closures = [];
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'logdown') return () => ({state: {}, info() {}, error() {}});
  if (name === 'fs-extra')
    return {
      createReadStream: file => {
        reads++;
        closed = false;
        const stream = fs.createReadStream(file);
        closures.push(
          new Promise(resolve =>
            stream.once('close', () => {
              closed = true;
              resolve();
            }),
          ),
        );
        return stream;
      },
    };
  if (name === 'axios')
    return {
      put: async (url, data) => {
        requests++;
        await new Promise((resolve, reject) => {
          data.on('error', reject);
          data.on('end', resolve);
          data.resume();
        });
      },
    };
  return original.call(this, name, parent, isMain);
};
process.once('uncaughtException', error => {
  emit({uncaught: true, leaked: error.message.includes('synthetic-private-path')});
  fs.rmSync(root, {recursive: true, force: true});
  process.exit(0);
});
(async () => {
  let rejected = false,
    message = '';
  try {
    const {HockeyDeployer} = require('../lib/HockeyDeployer.ts');
    const deployer = new HockeyDeployer({
      dryRun: mode === 'dry',
      hockeyAppId: 'fixture',
      hockeyToken: 'fixture',
      version: '1.2.3',
    });
    try {
      await deployer.uploadVersion({filePath: asset, hockeyVersionId: 42});
    } catch (error) {
      rejected = true;
      message = error.message;
    }
    // Observe actual filesystem completion rather than assuming a timing budget.
    await Promise.all(closures);
    emit({uncaught: false, rejected, message, reads, requests, closed});
  } finally {
    Module._load = original;
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(() => {
  console.error('Stream fixture setup failed');
  process.exitCode = 1;
});
