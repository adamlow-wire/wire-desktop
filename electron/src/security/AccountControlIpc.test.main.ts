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
  ACCOUNT_CONTROL_CAPABILITY,
  ACCOUNT_CONTROL_CHANNEL,
  MAX_ACCOUNT_COMMANDS_PER_MINUTE,
} from './AccountControlContract';
import {AccountControl, bindAccountControlIpc, isAccountSnapshots} from './AccountControlIpc';
import {SenderIdentity, ViewIdentityRegistry, ViewType} from './ViewIdentityRegistry';

import {parseLegacyAccounts} from '../accounts/AccountProfile';
import {AccountState} from '../accounts/AccountState';

const accountId = '11111111-1111-4111-8111-111111111111';
type Handler = (event: SenderIdentity, value: unknown) => Promise<unknown>;

const fixture = (viewType: ViewType = 'application-shell') => {
  const registry = new ViewIdentityRegistry();
  const frame = {url: 'https://shell.wire.test/index.html'};
  const session = {};
  let destroyed = false;
  const sender = {id: 701, mainFrame: frame, session, isDestroyed: () => destroyed};
  registry.register({
    accountId: viewType === 'account' ? accountId : undefined,
    allowedOrigin: 'https://shell.wire.test',
    capabilities: [ACCOUNT_CONTROL_CAPABILITY],
    partition: 'default',
    session,
    viewType,
    webContents: sender,
  });
  const event = {sender, senderFrame: frame};
  const state = new AccountState(
    parseLegacyAccounts(JSON.stringify({accounts: [{id: accountId, userID: accountId, visible: true}]}), 3),
    3,
    () => undefined,
  );
  const handlers = new Map<string, Handler>();
  const effects: unknown[][] = [];
  const control: AccountControl = {
    snapshots: () => state.snapshots(),
    add: async () => {
      state.add();
    },
    select: async (id: string) => state.select(id),
    remove: async (id: string) => state.remove(id),
    reload: async (...args) => {
      effects.push(['reload', ...args]);
    },
    logout: async (...args) => {
      effects.push(['logout', ...args]);
    },
    contextMenu: async (...args) => {
      effects.push(['context-menu', ...args]);
    },
    layout: async (...args) => {
      effects.push(['layout', ...args]);
    },
    join: async (...args) => {
      effects.push(['join', ...args]);
    },
  };
  const dispose = bindAccountControlIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      removeHandler: channel => {
        handlers.delete(channel);
      },
    },
    registry,
    control,
  );
  return {
    state,
    event,
    frame,
    registry,
    control,
    effects,
    dispose,
    handlers,
    destroy: () => {
      destroyed = true;
    },
    invoke: (request: unknown, identity: SenderIdentity = event) =>
      handlers.get(ACCOUNT_CONTROL_CHANNEL)!(identity, request),
  };
};

describe('account control IPC', () => {
  it('[security-target][CAP-001] routes layout, lifecycle and join controls with main-registered authority', async () => {
    const {invoke, effects, registry, event} = fixture();
    const identity = registry.authorize(event, ACCOUNT_CONTROL_CAPABILITY);
    for (const action of ['reload', 'logout', 'context-menu']) {
      await invoke({action, accountId});
    }
    await invoke({action: 'layout', sidebarWidth: 0, headerHeight: 0});
    await invoke({action: 'layout', sidebarWidth: 240, headerHeight: 120});
    for (const domain of [undefined, null, '', 'wire.test']) {
      await invoke({action: 'join', accountId, code: 'code', key: 'key', domain});
    }
    assert.deepEqual(effects, [
      ...['reload', 'logout', 'context-menu'].map(action => [action, accountId, identity]),
      ['layout', 0, 0, identity],
      ['layout', 240, 120, identity],
      ...[undefined, null, '', 'wire.test'].map(domain => [
        'join',
        accountId,
        {code: 'code', key: 'key', domain},
        identity,
      ]),
    ]);
  });

  it('[security-target][CAP-001] denies malformed extended controls before any lifecycle side effect', async () => {
    const {invoke, effects} = fixture();
    for (const request of [
      ...['reload', 'logout', 'context-menu'].flatMap(action => [
        {action},
        {action, accountId: '../other'},
        {action, accountId, sessionID: accountId},
      ]),
      ...[-1, 241, 0.5, '78', Infinity].map(sidebarWidth => ({action: 'layout', sidebarWidth, headerHeight: 0})),
      ...[-1, 121, 0.5, '56'].map(headerHeight => ({action: 'layout', sidebarWidth: 0, headerHeight})),
      {action: 'layout', sidebarWidth: 78, headerHeight: 56, accountId},
      ...['', 'x'.repeat(8193), null, 42].flatMap(value => [
        {action: 'join', accountId, code: value, key: 'key'},
        {action: 'join', accountId, code: 'code', key: value},
      ]),
      ...[42, {}, [], 'x'.repeat(254)].map(domain => ({action: 'join', accountId, code: 'code', key: 'key', domain})),
      {action: 'join', accountId, code: 'code', key: 'key', partition: 'default'},
    ]) {
      await assert.rejects(invoke(request), /payload/);
    }
    assert.deepEqual(effects, []);
  });

  it('[security-target][CAP-001] denies every extended control from a remote account without effects', async () => {
    const {invoke, effects} = fixture('account');
    for (const request of [
      ...['reload', 'logout', 'context-menu'].map(action => ({action, accountId})),
      {action: 'layout', sidebarWidth: 78, headerHeight: 56},
      {action: 'join', accountId, code: 'code', key: 'key'},
    ]) {
      await assert.rejects(invoke(request), /view type/);
    }
    assert.deepEqual(effects, []);
  });

  it('[security-target][CAP-001] exposes only named controls to the registered shell and strips private state', async () => {
    const {invoke, state, handlers, dispose} = fixture();
    const initial = await invoke({action: 'read'});
    assert.deepEqual(initial, state.snapshots());
    assert.deepEqual([...handlers.keys()], [ACCOUNT_CONTROL_CHANNEL]);
    await invoke({action: 'add'});
    const added = state.snapshots()[1].id;
    await invoke({action: 'select', accountId});
    assert.equal(state.get(accountId).visible, true);
    assert.equal(state.get(added).visible, false);
    const result = await invoke({action: 'remove', accountId: added});
    assert.deepEqual(result, state.snapshots());
    assert.equal(state.snapshots().length, 1);
    assert.equal(Object.hasOwn(state.snapshots()[0], 'sessionID'), false);
    dispose();
    assert.equal(handlers.size, 0);
  });

  it('[security-target][CAP-001] rejects malformed commands without changing account state', async () => {
    const {invoke, state} = fixture();
    const before = state.snapshots();
    for (const request of [
      undefined,
      null,
      [],
      {},
      'add',
      {action: 'execute', code: 'process.exit()'},
      {action: 'read', accountId},
      {action: 'add', sessionID: accountId},
      {action: 'select'},
      {action: 'select', accountId: '../outside'},
      {action: 'remove', accountId, partition: 'default'},
    ]) {
      await assert.rejects(invoke(request), /payload/);
      assert.deepEqual(state.snapshots(), before);
    }
  });

  it('[security-target][CAP-001] denies remote accounts even if accidentally granted the shell capability', async () => {
    const {invoke, state} = fixture('account');
    const before = state.snapshots();
    await assert.rejects(invoke({action: 'add'}), /view type/);
    assert.deepEqual(state.snapshots(), before);
  });

  it('[security-target][CAP-001] denies unknown, subframe, foreign-origin, destroyed and revoked senders', async () => {
    const {invoke, state, event, frame, registry, destroy} = fixture();
    const before = state.snapshots();
    await assert.rejects(invoke({action: 'add'}, {...event, sender: {...event.sender, id: 999}}), /authorized/);
    await assert.rejects(invoke({action: 'add'}, {...event, senderFrame: {url: frame.url}}), /authorized/);
    frame.url = 'https://hostile.wire.test/';
    await assert.rejects(invoke({action: 'add'}), /authorized/);
    frame.url = 'https://shell.wire.test/index.html';
    destroy();
    await assert.rejects(invoke({action: 'add'}), /authorized/);
    registry.unregister(event.sender.id);
    await assert.rejects(invoke({action: 'add'}), /authorized/);
    assert.deepEqual(state.snapshots(), before);
  });

  it('[security-target][CAP-001] bounds repeated account commands per shell', async () => {
    const {invoke} = fixture();
    for (let index = 0; index < MAX_ACCOUNT_COMMANDS_PER_MINUTE; index++) {
      await invoke({action: 'read'});
    }
    await assert.rejects(invoke({action: 'read'}), /rate limit/);
  });

  it('[security-target][CAP-001] rejects unknown targets and failed operations without a success response', async () => {
    const {invoke, control, state} = fixture();
    const before = state.snapshots();
    await assert.rejects(invoke({action: 'select', accountId: '22222222-2222-4222-8222-222222222222'}), /Unknown/);
    control.add = async () => {
      throw new Error('Creation failed');
    };
    await assert.rejects(invoke({action: 'add'}), /Creation failed/);
    assert.deepEqual(state.snapshots(), before);
  });

  it('[security-target][CAP-001] rejects invalid or private snapshot responses', async () => {
    const {invoke, control, state} = fixture();
    const valid = state.snapshots()[0];
    for (const invalid of [
      null,
      [],
      Array(33).fill(valid),
      [{...valid, sessionID: accountId}],
      [{...valid, ssoCode: 'secret'}],
      [{...valid, conversationJoinData: {code: 'secret', key: 'secret', domain: ''}}],
      [{...valid, canCancel: 'true'}],
      [{...valid, isLoading: 'true'}],
      [{...valid, loadError: 'x'.repeat(257)}],
      [{...valid, id: 'invalid'}],
      [{...valid, name: 'x'.repeat(4097)}],
    ]) {
      assert.equal(isAccountSnapshots(invalid), false);
    }
    control.snapshots = () => [{...valid, sessionID: accountId}];
    await assert.rejects(invoke({action: 'read'}), /response payload/);
  });
});
