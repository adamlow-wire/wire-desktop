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

import type {Session, WebContents} from 'electron';

import {strict as assert} from 'node:assert';
import {EventEmitter} from 'node:events';

import {ACCOUNT_PERMISSION_CAPABILITY, AccountPermissionPolicy} from './AccountPermissionPolicy';
import {bindAccountPermissionSession} from './AccountPermissionSession';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

const origin = 'https://permission.example.test';
const details = {isMainFrame: true, requestingUrl: origin};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

const fixture = () => {
  let request!: NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>;
  let check!: NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>;
  const target = {
    setPermissionRequestHandler: (handler: typeof request) => {
      assert.equal(typeof handler, 'function');
      request = handler;
    },
    setPermissionCheckHandler: (handler: typeof check) => {
      assert.equal(typeof handler, 'function');
      check = handler;
    },
  } as unknown as Session;
  const contents = Object.assign(new EventEmitter(), {
    id: 1,
    session: target,
    mainFrame: {url: origin},
    isDestroyed: () => false,
  }) as unknown as WebContents;
  const registry = new ViewIdentityRegistry();
  const owner = registry.register({
    webContents: contents,
    session: target,
    partition: 'owned',
    accountId: 'owned',
    viewType: 'account',
    allowedOrigin: origin,
    capabilities: [ACCOUNT_PERMISSION_CAPABILITY],
  });
  let answer!: (value: boolean) => void;
  let prompts = 0;
  let signal: AbortSignal | undefined;
  const policy = new AccountPermissionPolicy(registry, owner, {
    canPrompt: () => true,
    ask: async (_owner, _scopes, cancellation) => {
      prompts++;
      signal = cancellation;
      return new Promise<boolean>(resolve => {
        answer = resolve;
      });
    },
  });
  let reports = 0;
  const bind = () =>
    bindAccountPermissionSession(target, contents, policy, () => {
      reports++;
    });
  const dispose = bind();
  const values: boolean[] = [];
  return {
    contents,
    target,
    policy,
    dispose,
    bind,
    values,
    request: (
      callback = (allowed: boolean) => {
        values.push(allowed);
      },
    ) => request(contents, 'notifications', callback, details),
    check: () => check(contents, 'notifications', origin, details),
    answer: (value: boolean) => answer(value),
    signal: () => signal,
    prompts: () => prompts,
    reports: () => reports,
    handlers: () => ({request, check}),
  };
};

describe('[SEC-009][INV-006] permission session lifecycle with inert native ports', () => {
  it('routes accepted consent through the real policy and installs explicit denial on disposal', async () => {
    const f = fixture();
    assert.equal(f.check(), false);
    f.request();
    await settle();
    f.answer(true);
    await settle();
    assert.deepEqual(f.values, [true]);
    assert.equal(f.check(), true);
    f.dispose();
    assert.equal(f.check(), false);
    f.request();
    assert.deepEqual(f.values, [true, false]);
    assert.equal(f.prompts(), 1);
  });
  for (const event of ['dispose', 'destroyed', 'render-process-gone', 'did-start-navigation']) {
    it(`denies pending consent exactly once on ${event} and ignores a late answer`, async () => {
      const f = fixture();
      f.request();
      await settle();
      assert.equal(f.signal()!.aborted, false);
      if (event === 'dispose') {
        f.dispose();
      } else {
        f.contents.emit(event, {isMainFrame: true, isSameDocument: false});
      }
      assert.deepEqual(f.values, [false]);
      assert.equal(f.signal()!.aborted, true);
      f.answer(true);
      await settle();
      assert.deepEqual(f.values, [false]);
      assert.equal(f.check(), false);
      f.dispose();
      assert.equal(f.contents.listenerCount('did-start-navigation'), 0);
      assert.equal(f.contents.listenerCount('destroyed'), 0);
      assert.equal(f.contents.listenerCount('render-process-gone'), 0);
    });
  }
  it('cancels queued evaluation before it can show consent', async () => {
    const f = fixture();
    f.request();
    f.contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    await settle();
    assert.deepEqual(f.values, [false]);
    assert.equal(f.prompts(), 0);
    f.dispose();
  });
  it('preserves replacement authority against repeated stale disposal', async () => {
    const f = fixture();
    const old = f.handlers();
    const replacement = f.bind();
    f.request();
    await settle();
    f.answer(true);
    await settle();
    f.dispose();
    assert.equal(f.check(), true);
    assert.equal(old.check(f.contents, 'notifications', origin, details), false);
    const stale: boolean[] = [];
    old.request(f.contents, 'notifications', value => stale.push(value), details);
    assert.deepEqual(stale, [false]);
    assert.equal(f.prompts(), 1);
    replacement();
    assert.equal(f.check(), false);
  });
  it('contains a throwing native completion without repeating its answer', async () => {
    const f = fixture();
    let calls = 0;
    f.request(() => {
      calls++;
      throw new Error('Owned callback failure.');
    });
    await settle();
    f.dispose();
    f.answer(true);
    await settle();
    assert.equal(calls, 1);
    assert.equal(f.reports(), 1);
  });
});
