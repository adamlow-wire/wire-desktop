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

import {ProxyPromptCoordinator} from './ProxyPromptCoordinator';
import {showRegisteredProxyPrompt} from './ProxyPromptRegistration';

describe('proxy prompt registration', () => {
  it('[security-target][INV-003][INV-010][CAP-005] correlates native close with the active prompt only', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const events: string[] = [];
    let close: (() => void) | undefined;
    await showRegisteredProxyPrompt({
      actions: {
        cancel: () => void events.push('cancel'),
        submit: () => void events.push('submit'),
      },
      coordinator,
      fireAndForget: action => void action(),
      showWindow: async onCreated => {
        close = onCreated(101);
      },
    });

    assert.strictEqual(coordinator.has(101), true);
    close?.();
    await Promise.resolve();
    assert.deepStrictEqual(events, ['cancel']);
    assert.strictEqual(coordinator.has(101), false);

    close?.();
    assert.deepStrictEqual(events, ['cancel']);
  });

  it('[security-target][INV-003][INV-010][CAP-005] does not cancel a successfully submitted prompt on close', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const events: string[] = [];
    let close: (() => void) | undefined;
    await showRegisteredProxyPrompt({
      actions: {
        cancel: () => void events.push('cancel'),
        submit: () => void events.push('submit'),
      },
      coordinator,
      fireAndForget: action => void action(),
      showWindow: async onCreated => {
        close = onCreated(101);
      },
    });

    await coordinator.submit(101, {password: '', username: ''});
    close?.();

    assert.deepStrictEqual(events, ['submit']);
  });

  for (const succeeds of [false, true]) {
    it(`does not restore a closed prompt after pending submission ${succeeds ? 'succeeds' : 'fails'}`, async () => {
      const coordinator = new ProxyPromptCoordinator();
      let close!: () => void;
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      let cancellations = 0;
      const observed: Promise<void>[] = [];
      const failure = new Error('controlled pending submission failure');
      await showRegisteredProxyPrompt({
        coordinator,
        actions: {
          submit: () =>
            new Promise<void>((res, rej) => {
              resolve = res;
              reject = rej;
            }),
          cancel: () => {
            cancellations++;
          },
        },
        fireAndForget: action => {
          observed.push(action());
        },
        showWindow: async created => {
          close = created(101)!;
        },
      });
      const submitted = coordinator.submit(101, {username: 'fixture', password: 'fixture'});
      const settled = succeeds ? submitted : assert.rejects(submitted, error => error === failure);
      assert.equal(coordinator.has(101), false);
      close();
      if (succeeds) {
        resolve();
      } else {
        reject(failure);
      }
      await settled;
      await Promise.all(observed);
      assert.equal(coordinator.has(101), false);
      assert.equal(cancellations, succeeds ? 0 : 1);
      close();
      await Promise.all(observed);
      assert.equal(cancellations, succeeds ? 0 : 1);
      await assert.rejects(coordinator.submit(101, {username: '', password: ''}), /not active/);
    });
  }

  it('does not restore retry authority when cancellation on native close fails', async () => {
    const coordinator = new ProxyPromptCoordinator();
    let close!: () => void;
    const observed: Promise<void>[] = [];
    const failure = new Error('controlled close cancellation failure');
    await showRegisteredProxyPrompt({
      coordinator,
      actions: {
        submit() {},
        cancel: async () => {
          throw failure;
        },
      },
      fireAndForget: action => {
        observed.push(assert.rejects(action(), error => error === failure));
      },
      showWindow: async created => {
        close = created(101)!;
      },
    });
    close();
    await Promise.all(observed);
    assert.equal(coordinator.has(101), false);
    await assert.rejects(coordinator.cancel(101), /not active/);
  });

  it('retains retry after submission failure while the native prompt remains open', async () => {
    const coordinator = new ProxyPromptCoordinator();
    let attempts = 0;
    await showRegisteredProxyPrompt({
      coordinator,
      actions: {
        cancel() {},
        submit: async () => {
          if (++attempts === 1) {
            throw new Error('retry');
          }
        },
      },
      fireAndForget: () => {
        assert.fail('open prompt must not be cancelled');
      },
      showWindow: async created => {
        created(101);
      },
    });
    await assert.rejects(coordinator.submit(101, {username: '', password: ''}), /retry/);
    assert.equal(coordinator.has(101), true);
    await coordinator.submit(101, {username: '', password: ''});
    assert.equal(attempts, 2);
    assert.equal(coordinator.has(101), false);
  });

  for (const succeeds of [false, true]) {
    it(`does not restore a closed prompt after pending cancellation ${succeeds ? 'succeeds' : 'fails'}`, async () => {
      const coordinator = new ProxyPromptCoordinator();
      let close!: () => void;
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      let calls = 0;
      const failure = new Error('controlled cancellation failure');
      await showRegisteredProxyPrompt({
        coordinator,
        actions: {
          submit() {},
          cancel: () => {
            calls++;
            return new Promise<void>((res, rej) => {
              resolve = res;
              reject = rej;
            });
          },
        },
        fireAndForget: () => {
          assert.fail('must not repeat pending cancellation');
        },
        showWindow: async created => {
          close = created(101)!;
        },
      });
      const cancellation = coordinator.cancel(101);
      const settled = succeeds ? cancellation : assert.rejects(cancellation, error => error === failure);
      close();
      if (succeeds) {
        resolve();
      } else {
        reject(failure);
      }
      await settled;
      assert.equal(coordinator.has(101), false);
      assert.equal(calls, 1);
    });
  }

  for (const closeFirst of [true, false]) {
    it(`reports terminal cleanup failure without replacing submission failure (${
      closeFirst ? 'close' : 'reject'
    } first)`, async () => {
      const coordinator = new ProxyPromptCoordinator();
      let close!: () => void;
      let reject!: (error: Error) => void;
      let cancellations = 0;
      const observed: Promise<void>[] = [];
      const submissionFailure = new Error('controlled submission failure');
      const cleanupFailure = new Error('controlled terminal cleanup failure');
      await showRegisteredProxyPrompt({
        coordinator,
        actions: {
          submit: () =>
            new Promise<void>((_resolve, rejectPromise) => {
              reject = rejectPromise;
            }),
          cancel: async () => {
            cancellations++;
            throw cleanupFailure;
          },
        },
        fireAndForget: action => {
          observed.push(assert.rejects(action(), error => error === cleanupFailure));
        },
        showWindow: async created => {
          close = created(101)!;
        },
      });
      const submitted = coordinator.submit(101, {username: 'fixture', password: 'fixture'});
      const rejected = assert.rejects(submitted, error => error === submissionFailure);
      if (closeFirst) {
        close();
        reject(submissionFailure);
      } else {
        reject(submissionFailure);
        close();
      }
      close();
      await rejected;
      await Promise.all(observed);
      assert.equal(observed.length, 1);
      assert.equal(cancellations, 1);
      assert.equal(coordinator.has(101), false);
      close();
      assert.equal(observed.length, 1);
      await assert.rejects(coordinator.cancel(101), /not active/);
    });
  }
});
