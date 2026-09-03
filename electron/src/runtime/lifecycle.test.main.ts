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

import {app, ipcMain} from 'electron';
import {fake, replace, restore} from 'sinon';

import assert from 'node:assert';

import * as EnvironmentUtil from './EnvironmentUtil';
import {addRelaunchListeners, initSquirrelListener, relaunch} from './lifecycle';

import {EVENT_TYPE} from '../lib/eventType';
import * as Squirrel from '../update/squirrel';

describe('initSquirrelListener', () => {
  afterEach(() => {
    ipcMain.removeAllListeners(EVENT_TYPE.WRAPPER.UPDATE);
    restore();
  });

  it('does not initialize Squirrel for an MSI installation', async () => {
    const handleSquirrelArgs = fake.resolves(undefined);
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
    replace(Squirrel, 'isSquirrelInstallation', fake.returns(false));
    replace(Squirrel, 'handleSquirrelArgs', handleSquirrelArgs);

    await initSquirrelListener();

    assert.strictEqual(handleSquirrelArgs.callCount, 0);
    assert.strictEqual(ipcMain.listenerCount(EVENT_TYPE.WRAPPER.UPDATE), 0);
  });

  it('initializes updates only for a Squirrel installation on Windows', async () => {
    const handleSquirrelArgs = fake.resolves(undefined);
    const installUpdate = fake.resolves(undefined);
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
    replace(Squirrel, 'isSquirrelInstallation', fake.returns(true));
    replace(Squirrel, 'handleSquirrelArgs', handleSquirrelArgs);
    replace(Squirrel, 'installUpdate', installUpdate);

    await initSquirrelListener();
    ipcMain.emit(EVENT_TYPE.WRAPPER.UPDATE, {} as Electron.IpcMainEvent);

    assert.strictEqual(handleSquirrelArgs.callCount, 1);
    assert.strictEqual(installUpdate.callCount, 1);
  });
});

describe('relaunch', () => {
  afterEach(() => restore());

  it('[characterization][SEC-003] reloads registered content instead of relaunching the application on macOS', async () => {
    const reload = fake();
    const electronRelaunch = fake();
    const electronQuit = fake();
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: false, IS_MAC_OS: true, IS_LINUX: false});
    replace(app, 'relaunch', electronRelaunch);
    replace(app, 'quit', electronQuit);
    addRelaunchListeners(reload);

    await relaunch();

    assert.strictEqual(reload.callCount, 1);
    assert.strictEqual(electronRelaunch.callCount, 0);
    assert.strictEqual(electronQuit.callCount, 0);
  });

  it('[characterization][SEC-003] requests a relaunch before quitting on non-macOS platforms', async () => {
    const order: string[] = [];
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
    replace(app, 'relaunch', fake(() => order.push('relaunch')));
    replace(app, 'quit', fake(() => order.push('quit')));

    await relaunch();

    assert.deepStrictEqual(order, ['relaunch', 'quit']);
  });
});
