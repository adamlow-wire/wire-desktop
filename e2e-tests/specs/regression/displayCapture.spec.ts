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

import {createServer} from 'node:http';
import {AddressInfo} from 'node:net';

import {expect, test as baseTest} from '../../fixtures';

const test = baseTest.extend<{displayOrigin: string}>({
  displayOrigin: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><title>Synthetic display source</title><body style="background:#176a91"><script>
        window.amplify={publish(){},subscribe(){},unsubscribe(){}};window.wire={};
        window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
      </script></body>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
  appOptions: async ({displayOrigin}, use) => {
    await use({env: displayOrigin, lang: 'en', mediaConsent: 'deny'});
  },
});

test.beforeEach(async ({app}) => {
  // A real user cannot act until the product's delayed native startup show has completed.
  await expect
    .poll(() =>
      app.evaluate(({BrowserWindow}) =>
        BrowserWindow.getAllWindows().some(
          window => new URL(window.webContents.getURL()).searchParams.has('env') && window.isVisible(),
        ),
      ),
    )
    .toBe(true);
});

test('[security-target][CAP-003] product PiP cannot outlive its parent account document', async ({
  app,
  displayOrigin: origin,
}) => {
  await app.page.evaluate(() => {
    window.open('', 'WIRE_PICTURE_IN_PICTURE_CALL');
  });
  await expect
    .poll(() => app.windows().filter(page => !page.isClosed() && page.url() === 'about:blank').length)
    .toBe(1);
  const child = app.windows().find(page => !page.isClosed() && page.url() === 'about:blank')!;
  expect(await child.evaluate(() => typeof (window as unknown as {require?: unknown}).require)).toBe('undefined');
  await app.page.goto(`${origin}/replacement`);
  await expect.poll(() => child.isClosed()).toBe(true);
});

for (const entry of ['account', 'picture-in-picture'] as const) {
  test(`[security-target][CAP-003] product ${entry} shares only explicitly selected synthetic video`, async ({
    app,
    displayOrigin: origin,
  }) => {
    expect(await app.page.evaluate(() => window.wireDesktopBridge.version)).toBe(2);
    expect(await app.page.evaluate(() => 'desktopCapturer' in window)).toBe(false);
    // Intercept only test-owned native boundaries. No host source enumeration or display capture occurs.
    await app.evaluate(({app, BrowserWindow, desktopCapturer, nativeImage, session, webContents}, origin) => {
      const source = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!;
      const evidence = {enumerations: 0, approvals: 0, windowEvents: [] as string[]};
      const watch = (window: Electron.BrowserWindow) => {
        const record = (event: string) => {
          if (evidence.windowEvents.length < 32) {
            const role =
              window.isDestroyed() || window.webContents.isDestroyed()
                ? 'closed'
                : window.webContents.getURL().includes('/html/display-capture.html')
                ? 'broker'
                : 'owner';
            evidence.windowEvents.push(`${role}:${event}`);
          }
        };
        window.on('focus', () => record('focus'));
        window.on('blur', () => record('blur'));
        window.on('show', () => record('show'));
        window.on('hide', () => record('hide'));
      };
      BrowserWindow.getAllWindows().forEach(watch);
      app.on('browser-window-created', (_event, window) => watch(window));
      (globalThis as unknown as {syntheticDisplayEvidence: typeof evidence}).syntheticDisplayEvidence = evidence;
      desktopCapturer.getSources = async () => {
        evidence.enumerations++;
        return [
          {
            id: 'window:synthetic:0',
            name: 'Synthetic owned account',
            display_id: 'synthetic',
            appIcon: nativeImage.createEmpty(),
            thumbnail: nativeImage.createEmpty(),
          },
        ];
      };
      const fromPartition = session.fromPartition.bind(session);
      session.fromPartition = (partition, options) => {
        const target = fromPartition(partition, options);
        if (partition.startsWith('wire-display-')) {
          const bind = target.setDisplayMediaRequestHandler.bind(target);
          target.setDisplayMediaRequestHandler = (handler, options) => {
            bind(
              handler
                ? (request, callback) =>
                    handler(request, streams => {
                      if (streams.video && 'id' in streams.video && streams.video.id === 'window:synthetic:0') {
                        evidence.approvals++;
                        callback({video: source.mainFrame});
                      } else {
                        callback({});
                      }
                    })
                : null,
              options,
            );
          };
        }
        return target;
      };
    }, origin);
    if (entry === 'picture-in-picture') {
      await app.page.evaluate(() => {
        window.open('', 'WIRE_PICTURE_IN_PICTURE_CALL');
      });
      await expect.poll(() => app.windows().some(page => !page.isClosed() && page.url() === 'about:blank')).toBe(true);
    }
    const receiverId = await app.evaluate(
      ({BrowserWindow, webContents}, {entry, origin}) => {
        const contents =
          entry === 'account'
            ? webContents.getAllWebContents().find(contents => contents.getURL().startsWith(origin))!
            : BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'about:blank')!.webContents;
        const parent =
          BrowserWindow.fromWebContents(contents) ??
          BrowserWindow.getAllWindows().find(window =>
            window.contentView.children.some(view => 'webContents' in view && view.webContents === contents),
          )!;
        parent.show();
        parent.focus();
        contents.focus();
        return contents.id;
      },
      {entry, origin},
    );
    await expect
      .poll(() =>
        app.evaluate(({BrowserWindow, webContents}, id) => {
          const contents = webContents.fromId(id)!;
          const parent =
            BrowserWindow.fromWebContents(contents) ??
            BrowserWindow.getAllWindows().find(window =>
              window.contentView.children.some(view => 'webContents' in view && view.webContents === contents),
            );
          parent?.focus();
          if (parent?.isFocused()) {
            contents.focus();
          }
          return {window: !!parent?.isFocused(), view: contents.isFocused()};
        }, receiverId),
      )
      .toEqual({window: true, view: true});
    await app.evaluate(async ({webContents}, id) => {
      await webContents.fromId(id)!.executeJavaScript(
        `
          window.captureState='pending';
          navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false}).then(stream=>{
            window.captureStream=stream;window.captureClone=stream.getVideoTracks()[0].clone();window.captureState='started';
          },error=>{window.captureState=error.name;}); void 0;
        `,
        true,
      );
    }, receiverId);
    const brokerUrl = 'wire-app://shell/html/display-capture.html';
    await expect.poll(() => app.windows().some(page => !page.isClosed() && page.url() === brokerUrl)).toBe(true);
    const broker = app.windows().find(page => !page.isClosed() && page.url() === brokerUrl)!;
    await expect(broker.getByRole('button', {name: 'Synthetic owned account'})).toBeVisible();
    await expect(broker.locator('#capture-origin')).toHaveText(origin);
    expect(
      await app.evaluate(
        () =>
          (globalThis as unknown as {syntheticDisplayEvidence: {approvals: number}}).syntheticDisplayEvidence.approvals,
      ),
    ).toBe(0);
    expect(
      await app.evaluate(
        ({webContents}, id) => webContents.fromId(id)!.executeJavaScript('window.captureState'),
        receiverId,
      ),
    ).toBe('pending');
    await app.evaluate(({BrowserWindow}, url) => {
      BrowserWindow.getAllWindows()
        .find(window => window.webContents.getURL() === url)!
        .focus();
    }, brokerUrl);
    await expect
      .poll(() =>
        app.evaluate(
          ({BrowserWindow}, url) =>
            BrowserWindow.getAllWindows()
              .find(window => window.webContents.getURL() === url)
              ?.isFocused(),
          brokerUrl,
        ),
      )
      .toBe(true);
    await broker.getByRole('button', {name: 'Synthetic owned account'}).click();
    try {
      await expect
        .poll(() =>
          app.evaluate(
            ({webContents}, id) => webContents.fromId(id)!.executeJavaScript('window.captureState'),
            receiverId,
          ),
        )
        .toBe('started');
    } catch (error) {
      // Only synthetic counters and native window events; no source data or URLs.
      // eslint-disable-next-line no-console
      console.error(
        'Synthetic capture startup state',
        await app
          .evaluate(() => (globalThis as unknown as {syntheticDisplayEvidence: unknown}).syntheticDisplayEvidence)
          .catch(() => ({unavailable: true})),
      );
      throw error;
    }
    const video = await app.evaluate(
      ({webContents}, id) =>
        webContents.fromId(id)!.executeJavaScript(`(async()=>{
        const track=window.captureStream.getVideoTracks()[0];const reader=new MediaStreamTrackProcessor({track}).readable.getReader();
        const {value}=await reader.read();const result={width:value.displayWidth,height:value.displayHeight,kind:track.kind,state:track.readyState};
        value.close();reader.releaseLock();return result;
      })()`),
      receiverId,
    );
    expect(video).toMatchObject({kind: 'video', state: 'live'});
    expect(video.width).toBeGreaterThan(0);
    expect(video.width).toBeLessThanOrEqual(3840);
    expect(video.height).toBeGreaterThan(0);
    expect(video.height).toBeLessThanOrEqual(2160);
    await broker.getByRole('button', {name: 'Stop sharing'}).click();
    await expect
      .poll(() =>
        app.evaluate(
          ({webContents}, id) =>
            webContents
              .fromId(id)!
              .executeJavaScript(
                '[window.captureStream.getVideoTracks()[0].readyState,window.captureClone.readyState]',
              ),
          receiverId,
        ),
      )
      .toEqual(['ended', 'ended']);
    await expect.poll(() => broker.isClosed()).toBe(true);
    expect(
      await app.evaluate(() => {
        const {enumerations, approvals} = (
          globalThis as unknown as {syntheticDisplayEvidence: {enumerations: number; approvals: number}}
        ).syntheticDisplayEvidence;
        return {enumerations, approvals};
      }),
    ).toEqual({enumerations: 1, approvals: 1});
  });
}
