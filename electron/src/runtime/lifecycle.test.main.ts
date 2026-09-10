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

import {app} from 'electron';
import {fake, replace, restore} from 'sinon';

import assert from 'node:assert';

import * as EnvironmentUtil from './EnvironmentUtil';
import {addRelaunchListeners, checkSingleInstance, initSquirrelListener, isFirstInstance, relaunch} from './lifecycle';

import {settings} from '../settings/ConfigurationPersistence';
import * as Squirrel from '../update/squirrel';
import {WindowManager} from '../window/WindowManager';

describe('[characterization][CAP-006] single-instance ownership', () => {
  let originalListeners: ReturnType<typeof app.listeners>;
  let originalArgv: string[];

  beforeEach(() => {
    originalListeners = app.listeners('second-instance');
    originalArgv = process.argv;
    replace(app, 'quit', fake());
    replace(settings, 'persistToFile', fake());
  });

  afterEach(() => {
    for (const listener of app.listeners('second-instance')) {
      if (!originalListeners.includes(listener)) {
        app.removeListener('second-instance', listener as () => void);
      }
    }
    process.argv = originalArgv;
    restore();
  });

  for (const windows of [false, true]) {
    it(`lets the lock owner activate its primary window (Windows=${windows})`, async () => {
      replace(EnvironmentUtil, 'platform', {IS_WINDOWS: windows, IS_MAC_OS: false, IS_LINUX: !windows});
      replace(app, 'requestSingleInstanceLock', fake.returns(true));
      const show = fake();
      replace(WindowManager, 'showPrimaryWindow', show);

      await checkSingleInstance();

      assert.strictEqual(isFirstInstance, true);
      const listeners = app.listeners('second-instance').filter(listener => !originalListeners.includes(listener));
      assert.strictEqual(listeners.length, 1);
      listeners[0]();
      assert.strictEqual(show.callCount, 1);
      assert.strictEqual((app.quit as ReturnType<typeof fake>).callCount, 0);
      assert.strictEqual((settings.persistToFile as ReturnType<typeof fake>).callCount, 0);
    });
  }

  for (const event of ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete']) {
    it(`defers secondary-process exit for the installed Squirrel lifecycle event ${event}`, async () => {
      replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
      replace(app, 'requestSingleInstanceLock', fake.returns(false));
      replace(Squirrel, 'isSquirrelInstallation', fake.returns(true));
      const handle = fake.resolves(undefined);
      replace(Squirrel, 'handleSquirrelArgs', handle);
      process.argv = ['Wire.exe', event];

      await checkSingleInstance();
      await initSquirrelListener();

      assert.strictEqual(isFirstInstance, false);
      assert.strictEqual(handle.callCount, 1);
      assert.strictEqual((app.quit as ReturnType<typeof fake>).callCount, 0);
      assert.strictEqual((settings.persistToFile as ReturnType<typeof fake>).callCount, 0);
    });
  }
});

describe('initSquirrelListener', () => {
  afterEach(() => {
    restore();
  });

  it('does not initialize Squirrel for an MSI installation', async () => {
    const handleSquirrelArgs = fake.resolves(undefined);
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
    replace(Squirrel, 'isSquirrelInstallation', fake.returns(false));
    replace(Squirrel, 'handleSquirrelArgs', handleSquirrelArgs);

    await initSquirrelListener();

    assert.strictEqual(handleSquirrelArgs.callCount, 0);
  });

  it('initializes Squirrel without registering dormant renderer update authority', async () => {
    const handleSquirrelArgs = fake.resolves(undefined);
    const installUpdate = fake.resolves(undefined);
    replace(EnvironmentUtil, 'platform', {IS_WINDOWS: true, IS_MAC_OS: false, IS_LINUX: false});
    replace(Squirrel, 'isSquirrelInstallation', fake.returns(true));
    replace(Squirrel, 'handleSquirrelArgs', handleSquirrelArgs);
    replace(Squirrel, 'installUpdate', installUpdate);

    await initSquirrelListener();

    assert.strictEqual(handleSquirrelArgs.callCount, 1);
    assert.strictEqual(installUpdate.callCount, 0);
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
    replace(
      app,
      'relaunch',
      fake(() => order.push('relaunch')),
    );
    replace(
      app,
      'quit',
      fake(() => order.push('quit')),
    );

    await relaunch();

    assert.deepStrictEqual(order, ['relaunch', 'quit']);
  });
});
