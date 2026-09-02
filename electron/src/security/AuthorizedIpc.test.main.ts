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

import {spy} from 'sinon';

import * as assert from 'assert';

import {AuthorizedIpcContract, bindAuthorizedIpc, bindAuthorizedSyncIpc, executeAuthorizedIpc} from './AuthorizedIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

interface TestRequest {
  readonly contractVersion: 1;
}

interface TestResponse {
  readonly accountId: string;
}

const contract: AuthorizedIpcContract<TestRequest, TestResponse> = Object.freeze({
  capability: 'test:read',
  channel: 'wire-desktop:v1:test:read',
  failureMode: 'reject',
  isRequest: (value: unknown): value is TestRequest =>
    Boolean(
      value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 1 &&
        (value as {contractVersion?: unknown}).contractVersion === 1,
    ),
  isResponse: (value: unknown): value is TestResponse =>
    Boolean(
      value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 1 &&
        typeof (value as {accountId?: unknown}).accountId === 'string',
    ),
  originPolicy: 'registered-view-origin',
  rateLimit: 'not-required',
  viewTypes: Object.freeze(['account'] as const),
});

const createSender = (id: number, viewType: 'account' | 'sso' = 'account', registry = new ViewIdentityRegistry()) => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  const event = {sender: webContents, senderFrame: frame} as SenderIdentity;
  registry.register({
    accountId: viewType === 'account' ? 'account-a' : undefined,
    allowedOrigin: 'https://app.wire.test',
    capabilities: [contract.capability],
    partition: 'persist:test',
    session,
    viewType,
    webContents,
  });
  return {event, registry};
};

describe('authorized IPC contract', () => {
  it('[security-target][INV-003][SEC-003] authorizes before validation and derives identity outside the payload', async () => {
    const {event, registry} = createSender(1);
    const handler = spy(async identity => ({accountId: identity.accountId!}));

    const response = await executeAuthorizedIpc(registry, contract, event, {contractVersion: 1}, handler);

    assert.deepStrictEqual(response, {accountId: 'account-a'});
    assert.strictEqual(handler.firstCall.firstArg.accountId, 'account-a');
    assert.strictEqual(Object.isFrozen(handler.firstCall.firstArg), true);

    await assert.rejects(() =>
      executeAuthorizedIpc(registry, contract, event, {accountId: 'attacker', contractVersion: 1}, handler),
    );
    await assert.rejects(() => executeAuthorizedIpc(registry, contract, event, {contractVersion: 2}, handler));
    await assert.rejects(() =>
      executeAuthorizedIpc(new ViewIdentityRegistry(), contract, event, {contractVersion: 1}, handler),
    );
    let requestValidationCount = 0;
    const requestValidator = (value: unknown): value is TestRequest => {
      requestValidationCount += 1;
      return contract.isRequest(value);
    };
    await assert.rejects(() =>
      executeAuthorizedIpc(
        new ViewIdentityRegistry(),
        {...contract, isRequest: requestValidator},
        event,
        {accountId: 'attacker'},
        handler,
      ),
    );
    assert.strictEqual(requestValidationCount, 0);
    assert.strictEqual(handler.callCount, 1);
  });

  it('[security-target][INV-003][SEC-003] rejects a view type outside the contract and an invalid response', async () => {
    const sso = createSender(2, 'sso');
    const handler = spy(async () => ({accountId: 'account-a'}));

    await assert.rejects(() => executeAuthorizedIpc(sso.registry, contract, sso.event, {contractVersion: 1}, handler));
    assert.strictEqual(handler.callCount, 0);

    const account = createSender(3);
    await assert.rejects(() =>
      executeAuthorizedIpc(account.registry, contract, account.event, {contractVersion: 1}, async () => ({})),
    );

    for (const invalidPolicy of [
      {...contract, failureMode: 'log-and-continue'},
      {...contract, originPolicy: 'any-origin'},
      {...contract, rateLimit: {maxRequests: 0, windowMs: 1_000}},
      {...contract, rateLimit: {maxRequests: 1, windowMs: 0}},
    ]) {
      await assert.rejects(() =>
        executeAuthorizedIpc(
          account.registry,
          invalidPolicy as unknown as AuthorizedIpcContract<TestRequest, TestResponse>,
          account.event,
          {contractVersion: 1},
          handler,
        ),
      );
    }
  });

  it('[security-target][INV-003][SEC-003] binds and removes only the declared channel', async () => {
    const handlers = new Map<string, (event: SenderIdentity, request: unknown) => Promise<unknown>>();
    const ipc = {
      handle: (channel: string, handler: (event: SenderIdentity, request: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    };
    const {event, registry} = createSender(4);
    const dispose = bindAuthorizedIpc(ipc, registry, contract, async identity => ({accountId: identity.accountId!}));

    assert.deepStrictEqual(await handlers.get(contract.channel)?.(event, {contractVersion: 1}), {
      accountId: 'account-a',
    });
    dispose();
    assert.strictEqual(handlers.has(contract.channel), false);
  });

  it('[security-target][INV-003][SEC-003] binds a fixed synchronous contract without exposing its event', () => {
    type SyncEvent = SenderIdentity & {returnValue?: unknown};
    const handlers = new Map<string, (event: SyncEvent, request: unknown) => void>();
    const ipc = {
      on: (channel: string, handler: (event: SyncEvent, request: unknown) => void) => {
        handlers.set(channel, handler);
      },
      removeListener: (channel: string, handler: (event: SyncEvent, request: unknown) => void) => {
        if (handlers.get(channel) === handler) {
          handlers.delete(channel);
        }
      },
    };
    const {event, registry} = createSender(7);
    const syncEvent = event as SyncEvent;
    const handler = spy(identity => ({accountId: identity.accountId!}));
    const dispose = bindAuthorizedSyncIpc(ipc, registry, contract, handler);

    handlers.get(contract.channel)?.(syncEvent, {contractVersion: 1});
    assert.deepStrictEqual(syncEvent.returnValue, {accountId: 'account-a'});
    assert.strictEqual(handler.firstCall.args.length, 2);
    assert.strictEqual(handler.firstCall.firstArg.accountId, 'account-a');

    dispose();
    assert.strictEqual(handlers.has(contract.channel), false);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rate-limits authorized requests per view', async () => {
    const handlers = new Map<string, (event: SenderIdentity, request: unknown) => Promise<unknown>>();
    const ipc = {
      handle: (channel: string, handler: (event: SenderIdentity, request: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    };
    let now = 1_000;
    const limitedContract = {
      ...contract,
      channel: 'wire-desktop:v1:test:limited',
      rateLimit: Object.freeze({maxRequests: 2, windowMs: 1_000}),
    } as const;
    const first = createSender(5);
    const second = createSender(6, 'account', first.registry);
    await assert.rejects(() =>
      executeAuthorizedIpc(first.registry, limitedContract, first.event, {contractVersion: 1}, async identity => ({
        accountId: identity.accountId!,
      })),
    );
    const dispose = bindAuthorizedIpc(
      ipc,
      first.registry,
      limitedContract,
      async identity => ({accountId: identity.accountId!}),
      () => now,
    );
    const handler = handlers.get(limitedContract.channel);
    assert.ok(handler);

    await handler(first.event, {contractVersion: 1});
    await handler(first.event, {contractVersion: 1});
    await assert.rejects(() => handler(first.event, {contractVersion: 1}), /rate limit/);
    assert.deepStrictEqual(await handler(second.event, {contractVersion: 1}), {accountId: 'account-a'});

    now += 1_000;
    assert.deepStrictEqual(await handler(first.event, {contractVersion: 1}), {accountId: 'account-a'});
    dispose();
  });
});
