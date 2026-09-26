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

import type {Session} from 'electron';

import {strict as assert} from 'assert';

import {clearAccountSession} from './AccountSessionCleanup';

const steps = ['clearData', 'clearAuthCache', 'closeAllConnections'] as const;

describe('[CAP-001] account session cleanup ordering (inert session)', () => {
  it('awaits each cleanup stage before starting the next and before resolving', async () => {
    const calls: string[] = [];
    const release: Array<() => void> = [];
    const target = Object.fromEntries(
      steps.map(step => [
        step,
        () => {
          calls.push(step);
          return new Promise<void>(resolve => {
            release.push(resolve);
          });
        },
      ]),
    ) as unknown as Session;
    let settled = false;
    const pending = clearAccountSession(target).then(() => {
      settled = true;
    });
    for (let index = 0; index < steps.length; index++) {
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(calls, steps.slice(0, index + 1));
      assert.equal(settled, false);
      release[index]();
      await Promise.resolve();
    }
    await pending;
    assert.equal(settled, true);
  });

  for (const failedStep of steps) {
    it(`preserves ${failedStep} failure, stops later stages and permits retry`, async () => {
      const failure = new Error('owned cleanup failure');
      let shouldFail = true;
      const calls: string[] = [];
      const target = Object.fromEntries(
        steps.map(step => [
          step,
          async () => {
            calls.push(step);
            if (step === failedStep && shouldFail) {
              throw failure;
            }
          },
        ]),
      ) as unknown as Session;
      await assert.rejects(clearAccountSession(target), error => error === failure);
      assert.deepEqual(calls, steps.slice(0, steps.indexOf(failedStep) + 1));
      calls.length = 0;
      shouldFail = false;
      await clearAccountSession(target);
      assert.deepEqual(calls, steps);
    });
  }
});
