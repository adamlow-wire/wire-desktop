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
const {EventEmitter} = require('node:events');
const util = require('node:util');
const mode = process.env.UPDATER_FIXTURE_MODE;
const secret = 'synthetic-updater-secret';
const feed = `https://updates.invalid/feed?token=${secret}`;
process.env.WIRE_INTERNAL_MAC_UPDATE_URL = feed;
process.env.NODE_ENV = mode === 'development' ? 'development' : 'production';
const records = [];
const result = {checks: 0, feeds: 0, dialogs: 0, installs: 0, threw: false, unhandled: false, exactFeed: false};
const updater = new EventEmitter();
updater.setFeedURL = options => {
  result.feeds++;
  result.exactFeed = options.provider === 'generic' && options.url === feed;
  if (mode === 'setup-throw') throw new Error(secret);
};
updater.checkForUpdates = () => {
  result.checks++;
  if (mode === 'check-throw') throw new Error(secret);
  return mode === 'check-reject' ? Promise.reject(new Error(secret)) : Promise.resolve(null);
};
updater.quitAndInstall = () => {
  result.installs++;
  if (mode === 'install-throw') throw new Error(secret);
};
const logger = {log: (...args) => records.push(args), error: (...args) => records.push(args)};
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'electron')
    return {
      app: {isPackaged: mode !== 'unpackaged'},
      dialog: {
        showMessageBox: async () => {
          result.dialogs++;
          if (mode === 'dialog-reject') throw new Error(secret);
          return {response: mode === 'install' || mode === 'install-throw' ? 0 : 1};
        },
      },
    };
  if (name === 'electron-updater') return {autoUpdater: updater};
  if (name === '../settings/config') return {config: {environment: mode === 'app-store' ? 'production' : 'internal',
      macAutoUpdateEnabled: mode === 'unsigned' ? false : mode === 'missing-policy' ? undefined : mode === 'invalid-policy' ? 'true' : true}};
  if (name === '../logging/getLogger') return {getLogger: () => logger};
  return original.call(this, name, parent, isMain);
};
process.on('unhandledRejection', () => {
  result.unhandled = true;
});
process.once('beforeExit', () => {
  result.leaked = util.inspect(records, {depth: null}).includes(secret);
  console.log(JSON.stringify(result));
});
try {
  const {initMacAutoUpdater} = require('../../src/update/macosAutoUpdater.ts');
  initMacAutoUpdater({});
  if (mode === 'event-error') updater.emit('error', new Error(secret));
  if (['later', 'install', 'dialog-reject', 'install-throw'].includes(mode))
    updater.emit('update-downloaded', {version: '1.2.3'});
} catch {
  result.threw = true;
} finally {
  Module._load = original;
}
