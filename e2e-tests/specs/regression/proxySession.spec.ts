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

import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {seedLegacyAccountProfile} from '../../utils/seedLegacyAccountProfile';

for (const systemProxy of ['absent', 'without credentials', 'different proxy credentials'] as const) {
  test(`[CAP-005][security-target] proxy authentication preserves session ownership with ${systemProxy}`, async () => {
    test.setTimeout(60000);
    const profile = await mkdtemp(path.join(tmpdir(), 'wire-proxy-'));
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const partition = '33333333-3333-4333-8333-333333333333';
    const authorization = `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`;
    let authenticated = 0;
    let challenged = 0;
    let foreignCredentials = 0;
    const foreignAuthorization = `Basic ${Buffer.from('foreign-user:foreign-password').toString('base64')}`;
    const originServer = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Proxy account fixture</title><body>Account ready</body>');
    });
    const proxyServer = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      if (request.headers['proxy-authorization'] === foreignAuthorization) {
        foreignCredentials++;
      }
      if (request.headers['proxy-authorization'] !== authorization) {
        challenged++;
        response.writeHead(407, {'Proxy-Authenticate': 'Basic realm="m3-isolated-proxy"'}).end();
        return;
      }
      authenticated++;
      response.end('authenticated fixture');
    });
    let app: Awaited<ReturnType<typeof _electron.launch>> | undefined;
    try {
      await new Promise<void>(resolve => originServer.listen(0, '127.0.0.1', resolve));
      await new Promise<void>(resolve => proxyServer.listen(0, '127.0.0.1', resolve));
      const origin = `http://127.0.0.1:${(originServer.address() as AddressInfo).port}`;
      const proxy = `http://127.0.0.1:${(proxyServer.address() as AddressInfo).port}`;
      await seedLegacyAccountProfile(
        profile,
        ids.map((id, index) => ({
          id,
          accountIndex: index,
          badgeCount: 0,
          darkMode: false,
          isAdding: false,
          name: `Account ${index}`,
          sessionID: index === 0 ? undefined : partition,
          userID: id,
          visible: index === 0,
          webappUrl: origin,
        })),
      );
      const env = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      for (const key of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
        'http_proxy',
        'https_proxy',
        'all_proxy',
        'no_proxy',
      ]) {
        delete env[key];
      }
      if (systemProxy !== 'absent') {
        env.HTTP_PROXY =
          systemProxy === 'without credentials'
            ? proxy
            : 'http://foreign-user:foreign-password@other-proxy.invalid:4321';
        env.HTTPS_PROXY = env.HTTP_PROXY;
      }
      app = await _electron.launch({
        chromiumSandbox: true,
        env,
        args: ['.', `--env=${origin}`, `--user-data-dir=${profile}`, `--proxy-server=${proxy}`],
      });
      await expect
        .poll(() =>
          app!.evaluate(
            ({webContents}, ids) =>
              ids.every(id =>
                webContents.getAllWebContents().some(contents => {
                  try {
                    return new URL(contents.getURL()).searchParams.get('id') === id && !contents.isLoading();
                  } catch {
                    return false;
                  }
                }),
              ),
            ids,
          ),
        )
        .toBe(true);
      await app.evaluate(
        async ({session, webContents}, {ids, partition, proxy}) => {
          await session.defaultSession.setProxy({mode: 'direct'});
          await session.fromPartition(partition).setProxy({proxyRules: proxy, proxyBypassRules: '<-loopback>'});
          const target = webContents
            .getAllWebContents()
            .find(contents => new URL(contents.getURL()).searchParams.get('id') === ids[1])!;
          await target.executeJavaScript(
            `void fetch('http://proxy-target.invalid/fixture').then(response => response.text()).then(value => {document.body.dataset.proxyResult = value;})`,
          );
        },
        {ids, partition, proxy},
      );
      await expect.poll(() => challenged).toBeGreaterThan(0);
      await expect
        .poll(() => foreignCredentials > 0 || app!.windows().some(page => page.url().includes('proxy-prompt.html')))
        .toBe(true);
      expect(foreignCredentials, 'Credentials configured for a different proxy must never be transmitted').toBe(0);
      const prompt = app.windows().find(page => page.url().includes('proxy-prompt.html'))!;
      await expect(prompt.locator('#okButton')).not.toBeEmpty();
      await prompt.locator('#usernameInput').fill('fixture-user');
      await prompt.locator('#passwordInput').fill('fixture-password');
      await prompt.locator('#okButton').click();
      await expect.poll(() => prompt.isClosed()).toBe(true);
      await expect.poll(() => authenticated).toBeGreaterThan(0);
      await expect
        .poll(() =>
          app!.evaluate(async ({webContents}, id) => {
            const target = webContents
              .getAllWebContents()
              .find(contents => new URL(contents.getURL()).searchParams.get('id') === id)!;
            return target.executeJavaScript('document.body.dataset.proxyResult');
          }, ids[1]),
        )
        .toBe('authenticated fixture');
      expect(
        await app.evaluate(({session}) => session.defaultSession.resolveProxy('http://unrelated.invalid')),
        'Submitting another account proxy prompt must preserve the unrelated default session',
      ).toBe('DIRECT');
    } finally {
      if (app) {
        const process = app.process();
        await app.evaluate(({app}) => {
          setImmediate(() => app.quit());
        });
        await expect.poll(() => process.exitCode).toBe(0);
        await app.close();
      }
      originServer.closeAllConnections();
      proxyServer.closeAllConnections();
      await Promise.all([
        new Promise<void>(resolve => originServer.close(() => resolve())),
        new Promise<void>(resolve => proxyServer.close(() => resolve())),
      ]);
      await rm(profile, {recursive: true, force: true});
    }
  });
}
