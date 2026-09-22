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
