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

import {systemPreferences} from 'electron';
import {createSandbox} from 'sinon';

import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
import * as path from 'node:path';

const requireFixture = createRequire(
  path.join(process.cwd(), 'electron/src/managed/backends/ManagedBackends.test.main.ts'),
);
const fileSystem: typeof import('fs-extra') = requireFixture('fs-extra');
const isDeviceManagedLinux = (): boolean => {
  // Reload after stubbing: Babel snapshots fs-extra's CommonJS exports.
  delete requireFixture.cache[requireFixture.resolve('./linux.ts')];
  return (requireFixture('./linux.ts') as typeof import('./linux')).isDeviceManagedLinux();
};
const {isDeviceManagedMacOS}: typeof import('./macos') = requireFixture('./macos.ts');
const {isDeviceManagedWindows}: typeof import('./windows') = requireFixture('./windows.ts');
const constants: typeof import('../constants') = requireFixture('../constants.ts');

describe('[characterization][CAP-005] managed backend contracts', () => {
  const sandbox = createSandbox();
  afterEach(() => sandbox.restore());

  describe('Linux machine configuration', () => {
    for (const [payload, expected] of [
      [{}, true],
      [{applockOverride: true}, true],
      [{applockOverride: false}, false],
    ] as const) {
      it(`reads only the machine configuration and maps ${JSON.stringify(payload)} to ${expected}`, () => {
        const read = sandbox.stub(fileSystem, 'readJSONSync').returns(payload);
        assert.equal(isDeviceManagedLinux(), expected);
        assert.deepEqual(read.args, [[constants.LINUX_MANAGED_CONFIG_PATH]]);
      });
    }

    for (const exists of [false, true]) {
      it(`retains the unmanaged fallback for unreadable configuration when presence is ${exists}`, () => {
        sandbox.stub(fileSystem, 'readJSONSync').throws(new Error('synthetic config read failure'));
        const probe = sandbox.stub(fileSystem, 'pathExistsSync').returns(exists);
        assert.equal(isDeviceManagedLinux(), false);
        assert.deepEqual(probe.args, [[constants.LINUX_MANAGED_CONFIG_PATH]]);
      });
    }
  });

  describe('macOS app preference adapter', () => {
    const preferenceReader = () => {
      const read = sandbox.stub();
      if ('getUserDefault' in systemPreferences) {
        sandbox.replace(systemPreferences, 'getUserDefault', read);
      } else {
        // The native API is absent on Linux; the adapter test supplies it only
        // for this test and sandbox.restore removes it afterward.
        sandbox.define(systemPreferences, 'getUserDefault', read);
      }
      return read;
    };
    for (const enabled of [false, true]) {
      it(`reads the named boolean preference as ${enabled}`, () => {
        const read = preferenceReader().returns(enabled);
        assert.equal(isDeviceManagedMacOS(), enabled);
        assert.deepEqual(read.args, [[constants.APPLOCK_OVERRIDE_KEY, 'boolean']]);
      });
    }

    it('retains the unmanaged fallback on native preference failure', () => {
      preferenceReader().throws(new Error('synthetic preference failure'));
      assert.equal(isDeviceManagedMacOS(), false);
    });
  });

  describe('Windows registry adapter', () => {
    const hives = {HKEY_CURRENT_USER: 'HKEY_CURRENT_USER', HKEY_LOCAL_MACHINE: 'HKEY_LOCAL_MACHINE'} as const;
    let registry: {
      HKEY: typeof hives;
      enumerateKeys: ReturnType<typeof sandbox.stub>;
      enumerateValues: ReturnType<typeof sandbox.stub>;
    };
    let unavailable = false;

    beforeEach(() => {
      unavailable = false;
      registry = {
        HKEY: hives,
        enumerateKeys: sandbox.stub().returns([]),
        enumerateValues: sandbox.stub().returns([]),
      };
      // Intercept only this lazy dependency; never read the host's registry.
      const modules = requireFixture('node:module') as {
        _load(name: string, ...args: unknown[]): unknown;
      };
      const originalLoad = modules._load;
      sandbox.stub(modules, '_load').callsFake((name, ...args) => {
        if (name === 'registry-js') {
          if (unavailable) {
            throw new Error('synthetic registry module unavailable');
          }
          return registry;
        }
        return originalLoad.call(modules, name, ...args);
      });
    });

    for (const hive of [hives.HKEY_LOCAL_MACHINE, hives.HKEY_CURRENT_USER]) {
      for (const data of [1, true, '1', 'TrUe']) {
        it(`recognizes an explicit override ${JSON.stringify(data)} in hive ${hive}`, () => {
          registry.enumerateValues
            .withArgs(hive, constants.WINDOWS_POLICY_KEY)
            .returns([
              {name: constants.APPLOCK_OVERRIDE_KEY, type: typeof data === 'string' ? 'REG_SZ' : 'REG_DWORD', data},
            ]);
          assert.equal(isDeviceManagedWindows(), true);
          assert.equal(registry.enumerateKeys.callCount, 0, 'explicit policy does not need enrollment probing');
        });
      }
    }

    it('ignores disabled and unrelated policy values without enrollment', () => {
      registry.enumerateValues.withArgs(hives.HKEY_LOCAL_MACHINE, constants.WINDOWS_POLICY_KEY).returns([
        {name: constants.APPLOCK_OVERRIDE_KEY, type: 'REG_DWORD', data: 0},
        {name: constants.APPLOCK_OVERRIDE_KEY, type: 'REG_SZ', data: 'false'},
        {name: 'unrelated', type: 'REG_DWORD', data: 1},
      ]);
      assert.equal(isDeviceManagedWindows(), false);
    });

    for (const marker of ['UPN', 'ProviderID']) {
      it(`recognizes MDM enrollment by ${marker} under the machine enrollment key`, () => {
        registry.enumerateKeys
          .withArgs(hives.HKEY_LOCAL_MACHINE, constants.WINDOWS_ENROLLMENTS_KEY)
          .returns(['fixture']);
        registry.enumerateValues
          .withArgs(hives.HKEY_LOCAL_MACHINE, `${constants.WINDOWS_ENROLLMENTS_KEY}\\fixture`)
          .returns([{name: marker, type: 'REG_SZ', data: 'synthetic enrollment'}]);
        assert.equal(isDeviceManagedWindows(), true);
      });
    }

    it('does not treat an unrelated enrollment child as a managed-device marker', () => {
      registry.enumerateKeys.withArgs(hives.HKEY_LOCAL_MACHINE, constants.WINDOWS_ENROLLMENTS_KEY).returns(['fixture']);
      registry.enumerateValues
        .withArgs(hives.HKEY_LOCAL_MACHINE, `${constants.WINDOWS_ENROLLMENTS_KEY}\\fixture`)
        .returns([{name: 'unrelated', type: 'REG_SZ', data: 'synthetic value'}]);
      assert.equal(isDeviceManagedWindows(), false);
    });

    it('recognizes a machine cloud-domain join when enrollment policy reads fail', () => {
      registry.enumerateValues.throws(new Error('synthetic registry read failure'));
      registry.enumerateKeys
        .withArgs(hives.HKEY_LOCAL_MACHINE, constants.WINDOWS_CLOUD_DOMAIN_JOIN_KEY)
        .returns(['fixture']);
      assert.equal(isDeviceManagedWindows(), true);
    });

    it('returns unmanaged when the native registry module is unavailable', () => {
      unavailable = true;
      assert.equal(isDeviceManagedWindows(), false);
      assert.equal(registry.enumerateKeys.callCount, 0);
      assert.equal(registry.enumerateValues.callCount, 0);
    });

    it('retains the unmanaged fallback when all native enumeration fails', () => {
      registry.enumerateValues.throws(new Error('synthetic registry read failure'));
      registry.enumerateKeys.throws(new Error('synthetic registry key failure'));
      assert.equal(isDeviceManagedWindows(), false);
    });
  });
});
