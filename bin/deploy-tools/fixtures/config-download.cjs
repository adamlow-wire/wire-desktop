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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const {createRequire} = require('node:module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-config-download-'));
const mode = process.env.CONFIG_DOWNLOAD_MODE;
const archive = path.join(root, 'archive.zip');
if (mode === 'collision') fs.writeFileSync(archive, 'existing-owned-file');
const result = {settled: false, rejected: false, unhandled: false, message: ''};
process.on('unhandledRejection', () => {
  result.unhandled = true;
});
process.on('uncaughtException', () => {
  result.unhandled = true;
});
process.once('beforeExit', () => {
  result.archiveExists = fs.existsSync(archive);
  result.existingPreserved =
    mode !== 'collision' || (result.archiveExists && fs.readFileSync(archive, 'utf8') === 'existing-owned-file');
  result.extracted = fs.existsSync(path.join(root, 'fixture.json'));
  console.log(JSON.stringify(result));
  fs.rmSync(root, {recursive: true, force: true});
});
(async () => {
  const scoped = createRequire(require.resolve('@wireapp/copy-config/package.json'));
  const axios = scoped('axios');
  const zip = new (require('jszip'))();
  zip.file('root/fixture.json', '{"fixture":true}');
  const bytes = await zip.generateAsync({type: 'nodebuffer'});
  axios.defaults.adapter = async config => {
    if (mode === 'request') throw new Error('synthetic-config-secret');
    const data =
      mode === 'stream'
        ? new Readable({
            read() {
              this.destroy(new Error('synthetic-config-secret'));
            },
          })
        : Readable.from(mode === 'invalid' ? Buffer.from('invalid zip') : bytes);
    return {data, config, status: 200, statusText: 'OK', headers: {}};
  };
  try {
    await scoped('./lib/utils').downloadFileAsync('https://fixture.invalid/config.zip', root);
  } catch (error) {
    result.rejected = true;
    result.message = error.message;
  }
  result.settled = true;
})().catch(() => {
  console.error('Fixture setup failed');
  process.exitCode = 1;
});
