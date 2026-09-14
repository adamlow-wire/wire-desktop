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

import {BrowserWindow, dialog} from 'electron';
import {createSandbox} from 'sinon';

import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

import {
  getWindowsMsiWebAppConfiguration,
  loadWindowsRegistry,
  selectWebAppUrlOverride,
} from './WindowsMsiConfiguration';

import {getAccountDestination} from '../accounts/AccountDestination';
import {approveAccountEnvironment} from '../accounts/AccountEnvironmentApproval';

// Machine policy is Windows-only. The platform gate must run this on a native
// Windows runner with rights to create this unique, test-owned registry key.
if (process.platform === 'win32') {
  describe('[CAP-005] native Windows machine destination', () => {
    it('reads real machine policy and denies foreign or invalid account destinations before prompting', async function () {
      this.timeout(10_000);
      const productName = `M3-destination-test-${randomUUID()}`;
      const key = `HKLM\\SOFTWARE\\Wire\\${productName}`;
      const sandbox = createSandbox();
      const owner = new BrowserWindow({
        show: false,
        webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false},
      });
      let created = false;
      const write = (value: string, type = 'REG_SZ') => {
        execFileSync('reg.exe', ['ADD', key, '/v', 'WebAppUrl', '/t', type, '/d', value, '/f', '/reg:64'], {
          stdio: 'pipe',
        });
        created = true;
      };
      try {
        // Do not silently downgrade this native check to an adapter fixture.
        assert.ok(loadWindowsRegistry(), 'the pinned native registry dependency must load in Electron');
        const prompt = sandbox.stub(dialog, 'showMessageBox').resolves({response: 0, checkboxChecked: false});
        write('https://managed.example.test/client?policy=1');
        const policy = getWindowsMsiWebAppConfiguration(productName);
        assert.deepEqual(policy, {isConfigured: true, url: 'https://managed.example.test/client?policy=1'});
        assert.equal(
          selectWebAppUrlOverride(policy, 'https://command.example.test', 'https://user.example.test'),
          policy.url,
        );
        assert.equal(
          getAccountDestination(
            {isAdding: false, webappUrl: 'https://managed.example.test/team?account=1'},
            policy.url!,
            'en',
            policy,
          ),
          'https://managed.example.test/team?account=1&hl=en',
        );
        for (const foreign of ['https://foreign.example.test', 'https://managed.example.test.evil.test']) {
          assert.throws(
            () => getAccountDestination({isAdding: false, webappUrl: foreign}, policy.url!, 'en', policy),
            /machine policy/,
            'foreign registry destination must be denied',
          );
          await assert.rejects(approveAccountEnvironment(owner, foreign, policy), /machine policy/);
        }
        assert.equal(prompt.callCount, 0, 'native approval cannot bypass machine policy');

        for (const [value, type, issue] of [
          ['http://managed.example.test', 'REG_SZ', 'invalid-url'],
          ['42', 'REG_DWORD', 'invalid-registry-type'],
        ]) {
          write(value, type);
          const invalid = getWindowsMsiWebAppConfiguration(productName);
          assert.deepEqual(invalid, {isConfigured: true, issue});
          assert.equal(
            selectWebAppUrlOverride(invalid, 'https://command.example.test', 'https://user.example.test'),
            undefined,
          );
          assert.throws(
            () =>
              getAccountDestination(
                {isAdding: false, webappUrl: 'https://managed.example.test'},
                policy.url!,
                'en',
                invalid,
              ),
            /Invalid managed account destination/,
          );
          await assert.rejects(
            approveAccountEnvironment(owner, 'https://managed.example.test', invalid),
            /Invalid managed account destination/,
          );
        }
        assert.equal(prompt.callCount, 0);
      } finally {
        sandbox.restore();
        owner.destroy();
        if (created) {
          // The UUID leaf is owned by this test; never remove the shared Wire key.
          execFileSync('reg.exe', ['DELETE', key, '/f', '/reg:64'], {stdio: 'pipe'});
        }
      }
    });
  });
}
