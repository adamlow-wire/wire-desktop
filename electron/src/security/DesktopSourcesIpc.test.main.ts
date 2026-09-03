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

import {DesktopCapturerSource} from 'electron';

import {strict as assert} from 'assert';

import {
  bindDesktopSourcesIpc,
  DESKTOP_SOURCES_ENUMERATE_CAPABILITY,
  DESKTOP_SOURCES_ENUMERATE_CHANNEL,
  MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE,
  MAX_DESKTOP_SOURCES,
  MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION,
  requestDesktopSources,
} from './DesktopSourcesIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const options = Object.freeze({
  fetchWindowIcons: false,
  thumbnailSize: Object.freeze({height: 176, width: 312}),
  types: ['screen', 'window'] as Array<'screen' | 'window'>,
});
const nativeImage = Object.freeze({toDataURL: () => 'data:image/png;base64,AA=='});
const sources = Object.freeze([
  {
    appIcon: null,
    display_id: '1',
    id: 'screen:1:0',
    name: 'Entire Screen',
    thumbnail: nativeImage,
  },
]) as unknown as DesktopCapturerSource[];

const createSender = (registry: ViewIdentityRegistry, id = 171): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [DESKTOP_SOURCES_ENUMERATE_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => handlers.set(channel, handler),
  removeHandler: (channel: string) => handlers.delete(channel),
});

describe('desktop sources IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003] invokes only the fixed channel with the requested options', async () => {
    const calls: unknown[][] = [];

    const result = await requestDesktopSources(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return sources;
        },
      },
      options,
    );

    assert.deepStrictEqual(calls, [[DESKTOP_SOURCES_ENUMERATE_CHANNEL, options]]);
    assert.strictEqual(result, sources);
  });

  it('[security-target][INV-002][INV-010][SEC-003] rejects malformed renderer responses', async () => {
    for (const response of [undefined, {}, [{...sources[0], thumbnail: null}]]) {
      await assert.rejects(() => requestDesktopSources({invoke: async () => response}, options), /payload is invalid/);
    }
  });

  it('[characterization][security-target][INV-003][SEC-003][DCP-008] preserves options and source objects', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let forwarded: unknown;
    const dispose = bindDesktopSourcesIpc(createIpc(handlers), registry, async value => {
      forwarded = value;
      return sources;
    });
    const handler = handlers.get(DESKTOP_SOURCES_ENUMERATE_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, options), sources);
    assert.strictEqual(forwarded, options);
    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects unauthorized and malformed requests before enumeration', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let enumerationCalls = 0;
    bindDesktopSourcesIpc(createIpc(handlers), registry, async () => {
      enumerationCalls += 1;
      return sources;
    });
    const handler = handlers.get(DESKTOP_SOURCES_ENUMERATE_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 172}};
    await assert.rejects(() => handler(unknownEvent, options), /not authorized/);
    for (const request of [
      undefined,
      {},
      {types: []},
      {types: ['audio']},
      {types: ['screen', 'screen']},
      {types: ['screen'], extra: true},
      {types: ['screen'], fetchWindowIcons: 'yes'},
      {types: ['screen'], thumbnailSize: {height: -1, width: 312}},
      {types: ['screen'], thumbnailSize: {height: 176, width: MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION + 1}},
      {types: ['screen'], thumbnailSize: {height: 176, width: 312, scale: 2}},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(enumerationCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects malformed or excessive main-process responses', async () => {
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    for (const response of [
      [{...sources[0], id: ''}],
      [{...sources[0], name: 42}],
      [{...sources[0], appIcon: {}}],
      Array.from({length: MAX_DESKTOP_SOURCES + 1}, () => sources[0]),
    ]) {
      const handlers = new Map<string, BoundHandler>();
      bindDesktopSourcesIpc(createIpc(handlers), registry, async () => response as DesktopCapturerSource[]);
      await assert.rejects(() => handlers.get(DESKTOP_SOURCES_ENUMERATE_CHANNEL)!(event, options), /response payload/);
    }
  });

  it('[security-target][INV-003][INV-010][SEC-003] limits enumeration requests per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let enumerationCalls = 0;
    bindDesktopSourcesIpc(createIpc(handlers), registry, async () => {
      enumerationCalls += 1;
      return sources;
    });
    const handler = handlers.get(DESKTOP_SOURCES_ENUMERATE_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE; request += 1) {
      await handler(event, options);
    }
    await assert.rejects(() => handler(event, options), /rate limit/);
    assert.strictEqual(enumerationCalls, MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE);
  });
});
