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

import {strict as assert} from 'assert';

import {controlSsoWindowForAccount} from './SsoWindowControl';
import {
  bindSsoWindowControlIpc,
  MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE,
  requestSsoWindowClose,
  requestSsoWindowFocus,
  SSO_WINDOW_CLOSE_CAPABILITY,
  SSO_WINDOW_CLOSE_CHANNEL,
  SSO_WINDOW_FOCUS_CAPABILITY,
  SSO_WINDOW_FOCUS_CHANNEL,
} from './SsoWindowControlIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 101): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [SSO_WINDOW_CLOSE_CAPABILITY, SSO_WINDOW_FOCUS_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => {
    handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },
});

describe('SSO window-control IPC contracts', () => {
  it('[security-target][INV-004][SEC-003][CAP-002][DCP-003] controls only the requesting account SSO window', () => {
    const calls: string[] = [];
    const ssoWindow = {
      close: () => void calls.push('close'),
      focus: () => void calls.push('focus'),
      isOwnedByAccount: (accountId: string) => accountId === 'account-a',
    };

    assert.strictEqual(controlSsoWindowForAccount(ssoWindow, 'account-b', 'focus'), ssoWindow);
    assert.strictEqual(controlSsoWindowForAccount(ssoWindow, 'account-b', 'close'), ssoWindow);
    assert.strictEqual(controlSsoWindowForAccount(ssoWindow, undefined, 'close'), ssoWindow);
    assert.strictEqual(controlSsoWindowForAccount(null, 'account-a', 'close'), null);
    assert.deepStrictEqual(calls, []);

    assert.strictEqual(controlSsoWindowForAccount(ssoWindow, 'account-a', 'focus'), ssoWindow);
    assert.strictEqual(controlSsoWindowForAccount(ssoWindow, 'account-a', 'close'), null);
    assert.deepStrictEqual(calls, ['focus', 'close']);
  });

  it('[security-target][INV-002][INV-003][SEC-003][CAP-002] invokes only the fixed close and focus channels', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];
    const ipc = {
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        return undefined;
      },
    };
    const logger = {error: (...args: unknown[]) => errors.push(args)};

    await requestSsoWindowClose(ipc, logger);
    await requestSsoWindowFocus(ipc, logger);

    assert.deepStrictEqual(calls, [[SSO_WINDOW_CLOSE_CHANNEL], [SSO_WINDOW_FOCUS_CHANNEL]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][CAP-002] contains rejected and malformed responses', async () => {
    const controlledFailure = new Error('controlled SSO control failure');
    const errors: unknown[][] = [];

    await requestSsoWindowClose(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
    );
    await requestSsoWindowFocus(
      {invoke: async () => 'unexpected response'},
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.strictEqual(errors.length, 2);
    assert.deepStrictEqual(errors[0], ['Failed to close the SSO window.', controlledFailure]);
    assert.strictEqual(errors[1][0], 'Failed to focus the SSO window.');
    assert.match(String(errors[1][1]), /response payload/);
  });

  it('[characterization][security-target][INV-003][SEC-003][CAP-002][DCP-003] preserves close and focus behavior', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const calls: string[] = [];
    const dispose = bindSsoWindowControlIpc(createIpc(handlers), registry, {
      close: accountId => void calls.push(`close:${accountId}`),
      focus: accountId => void calls.push(`focus:${accountId}`),
    });

    assert.strictEqual(await handlers.get(SSO_WINDOW_FOCUS_CHANNEL)?.(event, undefined), undefined);
    assert.strictEqual(await handlers.get(SSO_WINDOW_CLOSE_CHANNEL)?.(event, undefined), undefined);
    assert.deepStrictEqual(calls, ['focus:account-a', 'close:account-a']);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][CAP-002] rejects unauthorized and malformed controls', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let sideEffects = 0;
    bindSsoWindowControlIpc(createIpc(handlers), registry, {
      close: () => void (sideEffects += 1),
      focus: () => void (sideEffects += 1),
    });
    const close = handlers.get(SSO_WINDOW_CLOSE_CHANNEL);
    const focus = handlers.get(SSO_WINDOW_FOCUS_CHANNEL);
    assert.ok(close);
    assert.ok(focus);

    const unknownEvent = {...event, sender: {...event.sender, id: 102}};
    await assert.rejects(() => close(unknownEvent, undefined), /not authorized/);
    await assert.rejects(() => focus(event, null), /payload/);
    await assert.rejects(() => close(event, {}), /payload/);
    assert.strictEqual(sideEffects, 0);
  });

  for (const [channel, action] of [
    [SSO_WINDOW_CLOSE_CHANNEL, 'close'],
    [SSO_WINDOW_FOCUS_CHANNEL, 'focus'],
  ] as const) {
    it(`[security-target][INV-003][INV-010][SEC-003][CAP-002] limits ${action} requests per account view`, async () => {
      const handlers = new Map<string, BoundHandler>();
      const registry = new ViewIdentityRegistry();
      const event = createSender(registry);
      let sideEffects = 0;
      bindSsoWindowControlIpc(createIpc(handlers), registry, {
        close: () => void (sideEffects += 1),
        focus: () => void (sideEffects += 1),
      });
      const handler = handlers.get(channel);
      assert.ok(handler);

      for (let request = 0; request < MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE; request += 1) {
        await handler(event, undefined);
      }
      await assert.rejects(() => handler(event, undefined), /rate limit/);
      assert.strictEqual(sideEffects, MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE);
    });
  }
});
