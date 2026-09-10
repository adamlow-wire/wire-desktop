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
import type {AddressInfo} from 'node:net';

import {createApp} from '../../actions/createApp';
import {seedLegacyAccountProfile} from '../../utils/seedLegacyAccountProfile';

for (const restored of [false, true]) {
  test(`[regression][CAP-001][SEC-009] E2E launcher exposes the selected account (restored=${restored})`, async ({}, testInfo) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      // Deliberately do not signal webapp readiness or request any device permission.
      response.end('<!doctype html><title>Launcher fixture</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const originalLaunch = _electron.launch;
    let launched: Awaited<ReturnType<typeof _electron.launch>> | undefined;
    _electron.launch = async options => {
      launched = await originalLaunch.call(_electron, options);
      return launched;
    };
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof createApp> | undefined;
    try {
      if (restored) {
        await seedLegacyAccountProfile(
          testInfo.outputPath('profile'),
          ids.map((id, index) => ({id, userID: id, visible: index === 1, sessionID: index ? id : undefined})),
        );
      }
      pending = createApp({env: origin, dataDir: testInfo.outputPath('profile')});
      const app = await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('E2E launcher did not expose both pages')), 30_000);
        }),
      ]);
      expect(new URL(decodeURIComponent(new URL(app.wrapper.url()).searchParams.get('env')!)).origin).toBe(origin);
      await expect(app.page).toHaveTitle('Launcher fixture');
      expect(new URL(app.page.url()).origin).toBe(origin);
      if (restored) {
        expect(new URL(app.page.url()).searchParams.get('id')).toBe(ids[1]);
        const reopened = await app.reopen();
        await expect(reopened.page).toHaveTitle('Launcher fixture');
        expect(new URL(reopened.page.url()).searchParams.get('id')).toBe(ids[1]);
      }
      expect(
        await launched!.evaluate(({app}) => ({
          profile: app.getPath('userData'),
          fakeDevices: app.commandLine.hasSwitch('use-fake-device-for-media-stream'),
        })),
      ).toEqual({profile: testInfo.outputPath('profile'), fakeDevices: true});
    } finally {
      clearTimeout(deadline);
      _electron.launch = originalLaunch;
      await launched?.close();
      await pending?.catch(() => undefined);
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
