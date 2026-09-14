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

import {_electron, expect, test} from '@playwright/test';

import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {promisify} from 'node:util';

import {seedLegacyAccountProfile} from '../../utils/seedLegacyAccountProfile';

// A later retry must not turn a failed native quit/persistence assertion green.
test.describe.configure({retries: 0});

test(
  '[CAP-001] metadata cannot replace account identity or partition across restart',
  {tag: ['@regression']},
  async ({}, testInfo) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><title>Local account fixture</title><script>
      window.amplify={publish(){},subscribe(){},unsubscribe(){}};window.wire={};
      window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
    </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const partitionId = '33333333-3333-4333-8333-333333333333';
    const accounts = ids.map((id, index) => ({
      accountIndex: index,
      badgeCount: 0,
      darkMode: true,
      id,
      isAdding: false,
      name: `Account ${index}`,
      picture: 'data:image/png;base64,b3RoZXI=',
      sessionID: index === 0 ? undefined : partitionId,
      teamRole: 'member',
      userID: id,
      visible: index === 0,
      webappUrl: origin,
    }));
    const phase = (name: string) => console.info(`[CAP-001 metadata] ${name}`);
    let nativeLog = '';
    const launch = async () => {
      phase('launching native application');
      const launched = await _electron.launch({
        chromiumSandbox: true,
        args: ['.', `--env=${origin}`, `--user-data-dir=${testInfo.outputPath('profile')}`],
      });
      nativeLog = '';
      const record = (chunk: Buffer) => {
        nativeLog = (nativeLog + chunk.toString()).slice(-65536);
      };
      launched.process().stdout?.on('data', record);
      launched.process().stderr?.on('data', record);
      return launched;
    };
    let app: Awaited<ReturnType<typeof launch>> | undefined;
    const quit = async () => {
      const target = app;
      if (!target) {
        return;
      }
      const applicationProcess = target.process();
      if (applicationProcess.exitCode === null && applicationProcess.signalCode === null) {
        phase('requesting normal native quit');
        // Native quit can close the inspector before its reply arrives. The
        // process exit assertion below is the authoritative completion signal.
        void target
          .evaluate(({app, BrowserWindow, webContents}) => {
            console.info(
              '[native quit] requested',
              BrowserWindow.getAllWindows().length,
              webContents.getAllWebContents().length,
            );
            app.once('before-quit', () => console.info('[native quit] before-quit'));
            app.once('will-quit', () => console.info('[native quit] will-quit'));
            for (const contents of webContents.getAllWebContents()) {
              const id = contents.id;
              contents.once('destroyed', () => console.info('[native quit] contents destroyed', id));
              contents.once('will-prevent-unload', () => console.info('[native quit] unload veto', id));
            }
            setImmediate(() => {
              console.info('[native quit] calling app.quit');
              app.quit();
              console.info('[native quit] app.quit returned');
            });
          })
          .catch(() => undefined);
      }
      phase('waiting for native exit');
      try {
        await expect
          .poll(() => ({code: applicationProcess.exitCode, signal: applicationProcess.signalCode}), {
            message: 'Native application quit must exit successfully before test-context cleanup',
          })
          .toEqual({code: 0, signal: null});
      } catch (error) {
        console.info(nativeLog);
        await testInfo.attach('native-quit-log', {body: Buffer.from(nativeLog), contentType: 'text/plain'});
        if (process.platform === 'darwin' && applicationProcess.pid && applicationProcess.exitCode === null) {
          const sample = await promisify(execFile)('/usr/bin/sample', [String(applicationProcess.pid), '1'], {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          }).then(
            ({stdout, stderr}) => stdout + stderr,
            failure => String(failure),
          );
          await testInfo.attach('native-quit-sample', {body: Buffer.from(sample), contentType: 'text/plain'});
        }
        // The exit assertion has already failed. Terminate only this fixture's
        // child so an original failure cannot strand the test worker.
        applicationProcess.kill('SIGKILL');
        await target.close();
        app = undefined;
        throw error;
      }
      phase('closing Playwright context after native exit');
      await target.close();
      phase('native application and context closed');
      app = undefined;
    };
    const readSavedAccounts = async () =>
      JSON.parse(await readFile(testInfo.outputPath('profile/accounts.v1.json'), 'utf8')).accounts;
    try {
      await seedLegacyAccountProfile(testInfo.outputPath('profile'), accounts);
      app = await launch();
      const findShell = () =>
        app!.windows().find(page => !page.isClosed() && new URL(page.url()).searchParams.has('env'));
      await expect.poll(() => !!findShell()).toBe(true);
      const shell = findShell()!;
      await expect(shell.locator('webview')).toHaveCount(0);
      await expect
        .poll(() =>
          app!.evaluate(
            ({webContents}, origin) =>
              webContents
                .getAllWebContents()
                .filter(
                  contents => contents.getURL().startsWith(origin) && new URL(contents.getURL()).searchParams.has('id'),
                )
                .map(contents => ({loading: contents.isLoading(), url: contents.getURL()}))
                .sort((left, right) => left.url.localeCompare(right.url)),
            origin,
          ),
        )
        .toEqual(ids.map(id => ({loading: false, url: expect.stringContaining(id)})));

      phase('saving cookies and submitting metadata');
      await app.evaluate(
        async ({webContents}, {ids, origin, partitionId}) => {
          for (const id of ids) {
            const contents = webContents
              .getAllWebContents()
              .find(
                candidate =>
                  candidate.getURL().startsWith(origin) && new URL(candidate.getURL()).searchParams.get('id') === id,
              )!;
            await contents.session.cookies.set({
              url: origin,
              name: 'account-marker',
              value: id,
              expirationDate: Date.now() / 1000 + 3600,
            });
            await contents.session.cookies.flushStore();
            if (id === ids[0]) {
              await contents.executeJavaScript(`
            wireDesktopBridge.events.teamInfo(null);
            wireDesktopBridge.events.teamInfo(${JSON.stringify({
              userID: id,
              id: ids[1],
              sessionID: partitionId,
              name: 'poison',
            })});
            wireDesktopBridge.events.teamInfo(${JSON.stringify({userID: id, name: 'Updated team'})});
          `);
            }
          }
        },
        {ids, origin, partitionId},
      );
      await expect.poll(async () => (await readSavedAccounts())[0].name).toBe('Updated team');
      const saved = await readSavedAccounts();
      const displayed = await shell.evaluate(() => window.wireAccounts.read());
      expect(displayed.map(account => account.id)).toEqual(ids);
      expect(displayed.every(account => !Object.hasOwn(account, 'sessionID'))).toBe(true);
      expect(saved[0]).toMatchObject({
        id: ids[0],
        name: 'Updated team',
        userID: ids[0],
        visible: true,
        webappUrl: origin,
      });
      expect(saved[0].sessionID).toBeUndefined();
      expect(saved[0].picture).toBeUndefined();
      expect(saved[1]).toMatchObject(accounts[1]);

      phase('metadata assertions passed; restarting');
      await quit();
      app = await launch();
      await expect.poll(() => !!findShell()).toBe(true);
      await expect
        .poll(() =>
          app!.evaluate(async ({webContents}, origin) => {
            const accounts = webContents
              .getAllWebContents()
              .filter(
                contents =>
                  contents.getURL().startsWith(origin) &&
                  new URL(contents.getURL()).searchParams.has('id') &&
                  !contents.isLoading(),
              );
            return Promise.all(
              accounts.map(async contents => ({
                id: new URL(contents.getURL()).searchParams.get('id'),
                marker: (await contents.session.cookies.get({name: 'account-marker'}))[0]?.value,
              })),
            ).then(values => values.sort((left, right) => String(left.id).localeCompare(String(right.id))));
          }, origin),
        )
        .toEqual(ids.map(id => ({id, marker: id})));
      expect(await readSavedAccounts()).toEqual(saved);
      phase('restart persistence assertions passed');
    } finally {
      await quit();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
);
