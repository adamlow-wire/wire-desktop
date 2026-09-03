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
  ACCOUNT_DATA_DELETE_CAPABILITY,
  ACCOUNT_DATA_DELETE_CHANNEL,
  bindAccountDataDeletionIpc,
  MAX_ACCOUNT_DELETIONS_PER_MINUTE,
  requestAccountDataDeletion,
} from './AccountDataDeletionIpc';
import {
  registerApplicationShellIdentity,
  registerViewIdentity,
  SenderIdentity,
  ViewIdentityRegistry,
} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const accountId = '11111111-1111-4111-8111-111111111111';
const partitionId = '33333333-3333-4333-8333-333333333333';

const createContents = (id: number, url: string, session: object) => {
  const frame = {url};
  return {
    id,
    isDestroyed: () => false,
    mainFrame: frame,
    once() {
      return this;
    },
    session,
  };
};

const createAuthority = (accountPartition = partitionId) => {
  const registry = new ViewIdentityRegistry();
  const shellSession = {};
  const shell = createContents(121, 'file:///opt/wire/electron/renderer/index.html', shellSession);
  registerApplicationShellIdentity(registry, shell, shell.mainFrame.url, [ACCOUNT_DATA_DELETE_CAPABILITY]);

  const accountSession = {};
  const account = createContents(122, `https://app.example.test/?id=${accountId}`, accountSession);
  registerViewIdentity(registry, {
    accountId,
    allowedOrigin: 'https://app.example.test',
    capabilities: [],
    partition: accountPartition,
    session: accountSession,
    viewType: 'account',
    webContents: account,
  });

  return {account, event: {sender: shell, senderFrame: shell.mainFrame}, registry};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => {
    handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },
});

describe('account data deletion IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][DCP-004] invokes only the fixed channel with the exact target', async () => {
    const calls: unknown[][] = [];

    const ipc = {
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        return undefined;
      },
    };

    await requestAccountDataDeletion(ipc, 122, accountId, partitionId);
    await requestAccountDataDeletion(ipc, 122, accountId);

    assert.deepStrictEqual(calls, [
      [ACCOUNT_DATA_DELETE_CHANNEL, {accountId, partitionId, webContentsId: 122}],
      [ACCOUNT_DATA_DELETE_CHANNEL, {accountId, webContentsId: 122}],
    ]);
  });

  it('[characterization][security-target][INV-003][INV-004][SEC-003][DCP-004] deletes only the correlated account target', async () => {
    const handlers = new Map<string, BoundHandler>();
    const {account, event, registry} = createAuthority();
    const deletions: unknown[][] = [];
    const dispose = bindAccountDataDeletionIpc(createIpc(handlers), registry, async (...args) => {
      deletions.push(args);
    });
    const handler = handlers.get(ACCOUNT_DATA_DELETE_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, {accountId, partitionId, webContentsId: account.id}), undefined);
    assert.deepStrictEqual(deletions, [[account.id, accountId, partitionId]]);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[characterization][security-target][INV-003][INV-004][SEC-003][DCP-004] preserves default-session deletion without a partition ID', async () => {
    const handlers = new Map<string, BoundHandler>();
    const {account, event, registry} = createAuthority('default');
    const deletions: unknown[][] = [];
    bindAccountDataDeletionIpc(createIpc(handlers), registry, async (...args) => {
      deletions.push(args);
    });
    const handler = handlers.get(ACCOUNT_DATA_DELETE_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, {accountId, webContentsId: account.id}), undefined);
    assert.deepStrictEqual(deletions, [[account.id, accountId, undefined]]);
  });

  it('[security-target][INV-003][INV-004][INV-010][SEC-003][DCP-004] rejects mismatched and unauthorized targets', async () => {
    const handlers = new Map<string, BoundHandler>();
    const {account, event, registry} = createAuthority();
    let deletionCalls = 0;
    bindAccountDataDeletionIpc(createIpc(handlers), registry, async () => {
      deletionCalls += 1;
    });
    const handler = handlers.get(ACCOUNT_DATA_DELETE_CHANNEL);
    assert.ok(handler);

    const otherAccountId = '22222222-2222-4222-8222-222222222222';
    const otherPartitionId = '44444444-4444-4444-8444-444444444444';
    for (const request of [
      {accountId: otherAccountId, partitionId, webContentsId: account.id},
      {accountId, partitionId: otherPartitionId, webContentsId: account.id},
      {accountId, partitionId, webContentsId: account.id + 1},
    ]) {
      await assert.rejects(() => handler(event, request), /target/);
    }

    const unknownEvent = {...event, sender: {...event.sender, id: 999}};
    await assert.rejects(
      () => handler(unknownEvent, {accountId, partitionId, webContentsId: account.id}),
      /not authorized/,
    );
    assert.strictEqual(deletionCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-004] rejects malformed deletion requests', async () => {
    const handlers = new Map<string, BoundHandler>();
    const {event, registry} = createAuthority();
    let deletionCalls = 0;
    bindAccountDataDeletionIpc(createIpc(handlers), registry, async () => {
      deletionCalls += 1;
    });
    const handler = handlers.get(ACCOUNT_DATA_DELETE_CHANNEL);
    assert.ok(handler);

    for (const request of [
      undefined,
      {},
      {accountId, partitionId, webContentsId: 0},
      {accountId, partitionId, webContentsId: 1.5},
      {accountId: 'not-an-account', partitionId, webContentsId: 122},
      {accountId, partitionId: 'not-a-partition', webContentsId: 122},
      {accountId, partitionId, webContentsId: 122, extra: true},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(deletionCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-004] limits deletion requests per application shell', async () => {
    const handlers = new Map<string, BoundHandler>();
    const {account, event, registry} = createAuthority();
    let deletionCalls = 0;
    bindAccountDataDeletionIpc(createIpc(handlers), registry, async () => {
      deletionCalls += 1;
    });
    const handler = handlers.get(ACCOUNT_DATA_DELETE_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_ACCOUNT_DELETIONS_PER_MINUTE; request += 1) {
      await handler(event, {accountId, partitionId, webContentsId: account.id});
    }
    await assert.rejects(() => handler(event, {accountId, partitionId, webContentsId: account.id}), /rate limit/);
    assert.strictEqual(deletionCalls, MAX_ACCOUNT_DELETIONS_PER_MINUTE);
  });
});
