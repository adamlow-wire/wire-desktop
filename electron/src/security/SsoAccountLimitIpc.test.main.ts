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

import {
  bindSsoAccountLimitIpc,
  MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE,
  requestSsoAccountLimitWarning,
  SSO_ACCOUNT_LIMIT_CAPABILITY,
  SSO_ACCOUNT_LIMIT_CHANNEL,
} from './SsoAccountLimitIpc';
import {registerApplicationShellIdentity, SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 301): SenderIdentity => {
  const mainFrame = {url: 'file:///wire/renderer/index.html'};
  const session = {};
  const webContents = {
    id,
    isDestroyed: () => false,
    mainFrame,
    once: () => webContents,
    session,
  };
  registerApplicationShellIdentity(registry, webContents, mainFrame.url, [SSO_ACCOUNT_LIMIT_CAPABILITY]);
  return {sender: webContents, senderFrame: mainFrame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => handlers.set(channel, handler),
  removeHandler: (channel: string) => handlers.delete(channel),
});

describe('SSO account-limit warning IPC contract', () => {
  it('uses only the fixed warning channel', async () => {
    const calls: unknown[][] = [];
    await requestSsoAccountLimitWarning({invoke: async (...args: unknown[]) => calls.push(args)});
    assert.deepStrictEqual(calls, [[SSO_ACCOUNT_LIMIT_CHANNEL]]);
  });

  it('allows the registered application shell and rejects malformed or unknown senders', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let warnings = 0;
    bindSsoAccountLimitIpc(createIpc(handlers), registry, async () => {
      warnings += 1;
    });
    const handler = handlers.get(SSO_ACCOUNT_LIMIT_CHANNEL);
    assert.ok(handler);

    await handler(event, undefined);
    await assert.rejects(() => handler(event, {}), /payload/);
    await assert.rejects(() => handler({...event, sender: {...event.sender, id: 302}}, undefined), /not authorized/);
    assert.strictEqual(warnings, 1);
  });

  it('rate-limits repeated native warning requests', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let warnings = 0;
    bindSsoAccountLimitIpc(createIpc(handlers), registry, async () => {
      warnings += 1;
    });
    const handler = handlers.get(SSO_ACCOUNT_LIMIT_CHANNEL);
    assert.ok(handler);

    for (let index = 0; index < MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE; index += 1) {
      await handler(event, undefined);
    }
    await assert.rejects(() => handler(event, undefined), /rate limit/);
    assert.strictEqual(warnings, MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE);
  });
});
