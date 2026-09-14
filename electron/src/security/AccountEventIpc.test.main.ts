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
  ACCOUNT_EVENT_CAPABILITY,
  ACCOUNT_EVENT_CHANNEL,
  AccountEvent,
  MAX_ACCOUNT_EVENTS_PER_MINUTE,
} from './AccountEventContract';
import {bindAccountEventIpc} from './AccountEventIpc';
import {AuthorizedViewIdentity, SenderIdentity, ViewIdentityRegistry, ViewType} from './ViewIdentityRegistry';

const accountId = '11111111-1111-4111-8111-111111111111';
type Handler = (event: SenderIdentity, value: unknown) => Promise<unknown>;

const fixture = (viewType: ViewType = 'account', capabilities = [ACCOUNT_EVENT_CAPABILITY]) => {
  const registry = new ViewIdentityRegistry();
  const frame = {url: 'https://account.wire.test/?id=spoofed'};
  const session = {};
  let destroyed = false;
  const sender = {id: 901, mainFrame: frame, session, isDestroyed: () => destroyed};
  registry.register({
    accountId: viewType === 'account' ? accountId : undefined,
    allowedOrigin: 'https://account.wire.test',
    capabilities,
    partition: 'persist:owned',
    session,
    viewType,
    webContents: sender,
  });
  const event = {sender, senderFrame: frame};
  const received: {identity: AuthorizedViewIdentity; event: AccountEvent}[] = [];
  let fail = false;
  const handlers = new Map<string, Handler>();
  const dispose = bindAccountEventIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
      removeHandler: channel => {
        handlers.delete(channel);
      },
    },
    registry,
    (identity, value) => {
      if (fail) {
        throw new Error('Account operation failed');
      }
      received.push({identity, event: value});
    },
  );
  return {
    registry,
    event,
    frame,
    received,
    dispose,
    handlers,
    destroy: () => {
      destroyed = true;
    },
    fail: () => {
      fail = true;
    },
    invoke: (request: unknown, identity: SenderIdentity = event) =>
      handlers.get(ACCOUNT_EVENT_CHANNEL)!(identity, request),
  };
};

describe('account event IPC', () => {
  it('[security-target][CAP-001] routes every bounded event using main-owned identity, never URL query identity', async () => {
    const {invoke, received, event, handlers, dispose} = fixture();
    const events: AccountEvent[] = [
      {type: 'loaded'},
      {type: 'sign-out'},
      {type: 'activate'},
      {type: 'signed-out', clearData: true},
      {type: 'signed-out', clearData: false},
      {
        type: 'metadata',
        data: {
          name: 'Wire',
          userID: 'user',
          accentID: 2,
          availability: 1,
          darkMode: true,
          picture: 'data:image/png;base64,AA',
          teamID: 'team',
          teamRole: '',
          webappUrl: 'https://account.wire.test/',
        },
      },
      {type: 'theme', theme: 'dark'},
      {type: 'unread', count: 0},
      {type: 'environment', url: 'https://custom.wire.test/'},
      {type: 'join', code: 'code', key: 'key'},
      {type: 'join', code: 'code', key: 'key', domain: null},
      {type: 'join', code: 'code', key: 'key', domain: 'wire.test'},
    ];
    for (const value of events) {
      assert.equal(await invoke(value), undefined);
    }
    assert.deepEqual(
      received.map(value => value.event),
      events,
    );
    for (const value of received) {
      assert.equal(value.identity.accountId, accountId);
      assert.equal(value.identity.webContents.id, event.sender.id);
      assert.equal(value.identity.session, event.sender.session);
    }
    assert.deepEqual([...handlers.keys()], [ACCOUNT_EVENT_CHANNEL]);
    dispose();
    assert.equal(handlers.size, 0);
  });

  it('[security-target][CAP-001] rejects malformed, oversized and desktop-owned event fields without side effects', async () => {
    const {invoke, received} = fixture();
    for (const value of [
      undefined,
      null,
      [],
      {},
      'loaded',
      {type: 'execute', code: 'process.exit()'},
      {type: 'loaded', accountId},
      {type: 'activate', partition: 'default'},
      {type: 'signed-out'},
      {type: 'signed-out', clearData: 'true'},
      {type: 'metadata', data: {sessionID: accountId}},
      {type: 'metadata', data: {id: accountId}},
      {type: 'metadata', data: {visible: true}},
      {type: 'metadata', data: {name: 'x'.repeat(4097)}},
      {type: 'metadata', data: {picture: 'x'.repeat(2 * 1024 * 1024 + 1)}},
      {type: 'metadata', data: []},
      {type: 'metadata', data: {darkMode: 'false'}},
      {type: 'theme', theme: 'x'.repeat(33)},
      {type: 'unread', count: -1},
      {type: 'unread', count: 0.5},
      {type: 'unread', count: Number.MAX_SAFE_INTEGER + 1},
      {type: 'unread', count: '1'},
      {type: 'environment', url: 'x'.repeat(8193)},
      {type: 'join', code: 'code'},
      {type: 'join', code: 'code', key: 'key', domain: {}},
      {type: 'join', code: 'x'.repeat(8193), key: 'key'},
      {type: 'join', code: 'code', key: 'key', domain: 'x'.repeat(254)},
    ]) {
      await assert.rejects(invoke(value), /payload/);
      assert.equal(received.length, 0);
    }
  });

  it('[security-target][CAP-001] denies wrong view types and missing account capability', async () => {
    for (const type of ['application-shell', 'sso', 'about'] as const) {
      const {invoke, received} = fixture(type);
      await assert.rejects(invoke({type: 'loaded'}), /view type/);
      assert.equal(received.length, 0);
    }
    const {invoke, received} = fixture('account', []);
    await assert.rejects(invoke({type: 'loaded'}), /authorized/);
    assert.equal(received.length, 0);
  });

  it('[security-target][CAP-001] denies unknown, subframe, foreign-origin, changed-session, destroyed and revoked senders', async () => {
    const {invoke, received, event, frame, registry, destroy} = fixture();
    await assert.rejects(invoke({type: 'loaded'}, {...event, sender: {...event.sender, id: 902}}), /authorized/);
    await assert.rejects(invoke({type: 'loaded'}, {...event, senderFrame: {url: frame.url}}), /authorized/);
    frame.url = 'https://hostile.wire.test/';
    await assert.rejects(invoke({type: 'loaded'}), /authorized/);
    frame.url = 'https://account.wire.test/';
    const originalSession = event.sender.session;
    event.sender.session = {};
    await assert.rejects(invoke({type: 'loaded'}), /authorized/);
    event.sender.session = originalSession;
    destroy();
    await assert.rejects(invoke({type: 'loaded'}), /authorized/);
    registry.unregister(event.sender.id);
    await assert.rejects(invoke({type: 'loaded'}), /authorized/);
    assert.equal(received.length, 0);
  });

  it('[security-target][CAP-001] bounds event floods without exhausting another view quota', async () => {
    const {invoke, received, registry} = fixture();
    for (let index = 0; index < MAX_ACCOUNT_EVENTS_PER_MINUTE; index++) {
      await invoke({type: 'loaded'});
    }
    await assert.rejects(invoke({type: 'loaded'}), /rate limit/);
    assert.equal(received.length, MAX_ACCOUNT_EVENTS_PER_MINUTE);
    const frame = {url: 'https://account.wire.test/'};
    const session = {};
    const sender = {id: 902, mainFrame: frame, session, isDestroyed: () => false};
    registry.register({
      accountId: '22222222-2222-4222-8222-222222222222',
      allowedOrigin: 'https://account.wire.test',
      capabilities: [ACCOUNT_EVENT_CAPABILITY],
      partition: 'persist:other',
      session,
      viewType: 'account',
      webContents: sender,
    });
    await invoke({type: 'loaded'}, {sender, senderFrame: frame});
    assert.equal(received.length, MAX_ACCOUNT_EVENTS_PER_MINUTE + 1);
    assert.equal(received.at(-1)!.identity.webContents.id, 902);
  });

  it('[regression][CAP-001] propagates failed account operations without reporting success', async () => {
    const {invoke, received, fail} = fixture();
    fail();
    await assert.rejects(invoke({type: 'loaded'}), /Account operation failed/);
    assert.equal(received.length, 0);
  });
});
