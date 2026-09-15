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

import {mkdir, readFile, readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';

import {createApp} from '../../actions/createApp';
import {expect, test as fixtureTest} from '../../fixtures';
import {menuBar} from '../../poms/app/menuBar.page';

const test = fixtureTest.extend({
  appOptions: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Fixture restart</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await use({env: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, lang: 'en'});
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
});

test('[regression][TST-005] shared app fixture supports an intentional restart', async ({app}) => {
  const reopened = await app.reopen();
  await expect(reopened.page).toHaveTitle('Fixture restart');
});

test('[regression][TST-005] settings helper resolves the actual platform menu and accelerator', async ({app}) => {
  const menuItem = await menuBar(app).openPreferences();
  const platform = await app.evaluate(() => process.platform);
  expect(menuItem.accelerator).toBe(platform === 'darwin' ? 'Command+,' : 'Ctrl+,');
});

test('[regression][TST-005] repeated native restart retains every trace and closes the latest instance', async ({
  app,
}) => {
  const directory = path.join(await app.evaluate(({app}) => app.getPath('userData')), 'app-traces');
  const second = await app.reopen(() => menuBar(app).clickItem('Quit WireInternal'));
  await expect(second.page).toHaveTitle('Fixture restart');
  expect(await readdir(directory)).toHaveLength(1);
  const third = await second.reopen(() => menuBar(second).clickItem('Quit WireInternal'));
  await expect(third.page).toHaveTitle('Fixture restart');
  expect(await readdir(directory)).toHaveLength(2);
  const thirdProcess = third.process();
  await app.close();
  expect(third.page.isClosed()).toBe(true);
  expect(thirdProcess.exitCode).toBe(0);
  const archives = await readdir(directory);
  expect(archives).toHaveLength(3);
  for (const archive of archives) {
    const contents = await readFile(path.join(directory, archive));
    expect(contents.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(contents.includes(Buffer.from('.trace'))).toBe(true);
  }
});

test('[regression][TST-005] trace failure propagates while native teardown still completes', async ({
  appOptions,
}, testInfo) => {
  const traceDirectory = testInfo.outputPath('traces');
  await mkdir(traceDirectory, {recursive: true});
  const app = await createApp({...appOptions, dataDir: testInfo.outputPath('profile'), traceDirectory});
  const nativeProcess = app.process();
  app.context().tracing.stop = async () => {
    throw new Error('Synthetic trace failure');
  };
  try {
    await expect(app.close()).rejects.toThrow('Synthetic trace failure');
    expect(app.page.isClosed()).toBe(true);
    expect(nativeProcess.exitCode).toBe(0);
  } finally {
    await app.close().catch(() => undefined); // The injected failure was asserted above.
  }
});
