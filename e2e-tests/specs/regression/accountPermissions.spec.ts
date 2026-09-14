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

import {createServer} from 'node:http';
import {AddressInfo} from 'node:net';

import {WebAppEvents} from '@wireapp/webapp-events';

test(
  '[SEC-009] production consent controls notification and fake-media grants across documents',
  {tag: ['@regression']},
  async ({}, testInfo) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><title>Permission fixture</title><script>
      window.permissionResults=[];
      window.amplify={publish(name,value){
        if(name===${JSON.stringify(WebAppEvents.NOTIFICATION.PERMISSION_STATE)}) window.permissionResults.push(value);
      },subscribe(){},unsubscribe(){}};
      window.wire={};window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
    </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let app: Awaited<ReturnType<typeof _electron.launch>> | undefined;
    try {
      app = await _electron.launch({
        chromiumSandbox: true,
        args: [
          '--use-fake-device-for-media-stream',
          '--mute-audio',
          '.',
          `--env=${origin}`,
          '--lang=en',
          `--user-data-dir=${testInfo.outputPath('profile')}`,
        ],
      });
      await expect
        .poll(() => app!.windows().some(page => !page.isClosed() && new URL(page.url()).searchParams.has('env')))
        .toBe(true);
      await app.evaluate(({desktopCapturer, dialog}) => {
        const fixture = {
          response: 1,
          enumerations: 0,
          requests: [] as Array<{defaultId?: number; cancelId?: number; detail?: string}>,
        };
        (globalThis as unknown as {permissionFixture: typeof fixture}).permissionFixture = fixture;
        // Never capture the host desktop. Count attempts at the real IPC boundary instead.
        desktopCapturer.getSources = async () => {
          fixture.enumerations++;
          return [];
        };
        const original = dialog.showMessageBox.bind(dialog);
        dialog.showMessageBox = ((
          ...args: [Electron.BaseWindow, Electron.MessageBoxOptions] | [Electron.MessageBoxOptions]
        ) => {
          const options = args.length === 2 ? args[1] : args[0];
          if (options?.message === 'Allow account permissions?') {
            fixture.requests.push({defaultId: options.defaultId, cancelId: options.cancelId, detail: options.detail});
            return Promise.resolve({response: options.signal?.aborted ? 0 : fixture.response, checkboxChecked: false});
          }
          return args.length === 2 ? original(args[0], args[1]) : original(args[0]);
        }) as typeof dialog.showMessageBox;
      });
      await expect
        .poll(() =>
          app!.evaluate(
            ({webContents}, origin) =>
              webContents
                .getAllWebContents()
                .some(contents => contents.getURL().startsWith(origin) && !contents.isLoading()),
            origin,
          ),
        )
        .toBe(true);
      const focusOwner = async () => {
        await app!.evaluate(({BrowserWindow}) => {
          const owner = BrowserWindow.getAllWindows().find(window =>
            new URL(window.webContents.getURL()).searchParams.has('env'),
          )!;
          owner.show();
          owner.focus();
        });
        await expect
          .poll(() =>
            app!.evaluate(({BrowserWindow}) => {
              const owner = BrowserWindow.getAllWindows().find(window =>
                new URL(window.webContents.getURL()).searchParams.has('env'),
              )!;
              return owner.isFocused();
            }),
          )
          .toBe(true);
      };
      await focusOwner();
      const ready = () =>
        app!.evaluate(async ({webContents}, origin) => {
          const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
          await contents.executeJavaScript('window.wireDesktopBridge.events.loaded()');
        }, origin);
      const results = () =>
        app!.evaluate(async ({webContents}, origin) => {
          const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
          return contents.executeJavaScript('window.permissionResults');
        }, origin);
      const capture = (kind: 'audio' | 'video') =>
        app!.evaluate(
          async ({app, BrowserWindow, webContents}, {origin, kind}) => {
            if (
              !app.commandLine.hasSwitch('use-fake-device-for-media-stream') ||
              app.commandLine.hasSwitch('use-fake-ui-for-media-stream')
            ) {
              throw new Error('Synthetic devices without a permission bypass are required.');
            }
            const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
            const result = await contents.executeJavaScript(`(async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({${kind}: true});
            const tracks = stream.getTracks();
            const kinds = tracks.map(track => track.kind);
            tracks.forEach(track => track.stop());
            return {kinds};
          } catch (error) { return {error: error.name}; }
        })()`);
            return {
              result,
              owners: BrowserWindow.getAllWindows().map(owner => ({
                focused: owner.isFocused(),
                visible: owner.isVisible(),
              })),
              fixture: (globalThis as unknown as {permissionFixture: unknown}).permissionFixture,
            };
          },
          {origin, kind},
        );
      const expectCapture = async (kind: 'audio' | 'video', expected: {kinds: string[]} | {error: string}) => {
        // Each request models a foreground user flow; OS focus can change between requests.
        await focusOwner();
        const {result, ...context} = await capture(kind);
        expect(result, JSON.stringify(context)).toEqual(expected);
      };
      const expectNoDesktopEnumeration = async () => {
        const result = await app!.evaluate(async ({webContents}, origin) => {
          const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
          const denied = await contents.executeJavaScript(`(async () => {
            try {
              await window.desktopCapturer.getDesktopSources({types: ['screen', 'window']});
              return false;
            } catch { return true; }
          })()`);
          return {
            denied,
            enumerations: (globalThis as unknown as {permissionFixture: {enumerations: number}}).permissionFixture
              .enumerations,
          };
        }, origin);
        expect(result, 'Desktop thumbnails require an authorized source-selection flow').toEqual({
          denied: true,
          enumerations: 0,
        });
      };
      await expectNoDesktopEnumeration();
      await ready();
      await expect.poll(results).toEqual(['granted']);
      await expectCapture('audio', {kinds: ['audio']});
      await expectCapture('video', {kinds: ['video']});
      await expectNoDesktopEnumeration();
      expect(
        await app.evaluate(
          () => (globalThis as unknown as {permissionFixture: {requests: unknown[]}}).permissionFixture.requests,
        ),
      ).toEqual(
        ['Notifications', 'Microphone', 'Camera'].map(scope => ({
          defaultId: 0,
          cancelId: 0,
          detail: `${origin}\n\n${scope}`,
        })),
      );
      await app.evaluate(async ({webContents}, origin) => {
        (globalThis as unknown as {permissionFixture: {response: number}}).permissionFixture.response = 0;
        const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
        await contents.loadURL(contents.getURL());
      }, origin);
      await ready();
      await expect.poll(results).toEqual(['denied']);
      await expectCapture('audio', {error: 'NotAllowedError'});
      expect(
        await app.evaluate(
          () => (globalThis as unknown as {permissionFixture: {requests: unknown[]}}).permissionFixture.requests.length,
        ),
      ).toBe(5);
    } finally {
      await app?.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
);
