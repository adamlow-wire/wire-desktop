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

import type {WebContents} from 'electron';
import {useFakeTimers} from 'sinon';

import {strict as assert} from 'assert';
import {EventEmitter} from 'events';

import {loadAccountDestination} from './loadAccountDestination';

const origin = 'https://account.example.test';
const initialUrl = `${origin}/start`;
const aborted = () => Object.assign(new Error('Navigation superseded'), {code: 'ERR_ABORTED', errno: -3});

class NavigationFixture extends EventEmitter {
  url = initialUrl;
  loading = true;
  destroyed = false;
  owned = true;
  navigate: () => Promise<void> = async () => undefined;

  isDestroyed = () => this.destroyed;
  isLoadingMainFrame = () => this.loading;
  getURL = () => this.url;
  loadURL = async () => {
    this.start(initialUrl);
    await this.navigate();
  };
  start(url: string, isMainFrame = true, isSameDocument = false): void {
    this.emit('did-start-navigation', {url, isMainFrame, isSameDocument});
  }
  redirect(url = `${origin}/login`): void {
    this.start(url);
    this.url = url;
  }
  finish(): void {
    this.emit('did-finish-load');
    this.loading = false;
    this.emit('did-stop-loading');
  }
  load(): Promise<void> {
    return loadAccountDestination(this as unknown as WebContents, initialUrl, () => this.owned);
  }
}

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

describe('account startup navigation completion', () => {
  it('[regression][CAP-001] waits for the replacement document and stopped loading, preserving unrelated listeners', async () => {
    const fixture = new NavigationFixture();
    const existing = () => undefined;
    fixture.on('did-finish-load', existing);
    fixture.navigate = async () => {
      fixture.redirect();
      throw aborted();
    };
    let settled = false;
    const loaded = fixture.load().then(() => {
      settled = true;
    });
    await nextTurn();
    fixture.emit('did-stop-loading');
    await nextTurn();
    assert.equal(settled, false, 'An aborted old document is not a completed replacement');
    fixture.emit('did-finish-load');
    await nextTurn();
    assert.equal(settled, false, 'Finish alone does not clear native loading');
    fixture.loading = false;
    fixture.emit('did-stop-loading');
    await loaded;
    assert.deepEqual(fixture.eventNames(), ['did-finish-load']);
    assert.deepEqual(fixture.listeners('did-finish-load'), [existing]);
  });

  it('[regression][CAP-001] accepts a completed replacement recorded before the native rejection arrives', async () => {
    const fixture = new NavigationFixture();
    fixture.navigate = async () => {
      fixture.redirect();
      fixture.finish();
      throw aborted();
    };
    await fixture.load();
    assert.deepEqual(fixture.eventNames(), []);
  });

  for (const navigation of ['none', 'subframe', 'same-document', 'foreign'] as const) {
    it(`[security-target][CAP-001] cannot accept an aborted initial load using ${navigation} navigation`, async () => {
      const fixture = new NavigationFixture();
      fixture.navigate = async () => {
        if (navigation === 'subframe') {
          fixture.start(`${origin}/frame`, false);
        }
        if (navigation === 'same-document') {
          fixture.start(`${origin}/start#fragment`, true, true);
        }
        if (navigation === 'foreign') {
          fixture.redirect('https://foreign.example.test/login');
        }
        throw aborted();
      };
      await assert.rejects(fixture.load(), /Navigation superseded/);
      assert.deepEqual(fixture.eventNames(), []);
    });
  }

  it('[security-target][CAP-001] never swallows an ordinary native load failure', async () => {
    const fixture = new NavigationFixture();
    fixture.navigate = async () => {
      fixture.redirect();
      throw new Error('Native load failed');
    };
    await assert.rejects(fixture.load(), /Native load failed/);
    assert.deepEqual(fixture.eventNames(), []);
  });

  for (const cancellation of ['lost-owner', 'destroyed', 'crashed', 'foreign-commit', 'load-failure'] as const) {
    it(`[security-target][CAP-001] rejects a pending replacement after ${cancellation}`, async () => {
      const fixture = new NavigationFixture();
      fixture.navigate = async () => {
        fixture.redirect();
        throw aborted();
      };
      const rejected = assert.rejects(fixture.load(), /cancelled|failed/);
      await nextTurn();
      if (cancellation === 'lost-owner') {
        fixture.owned = false;
      }
      if (cancellation === 'foreign-commit') {
        fixture.url = 'https://foreign.example.test/login';
      }
      if (cancellation === 'destroyed') {
        fixture.destroyed = true;
        fixture.emit('destroyed');
      } else if (cancellation === 'crashed') {
        fixture.emit('render-process-gone');
      } else if (cancellation === 'load-failure') {
        fixture.emit('did-fail-load', {}, -105, 'Synthetic failure', fixture.url, true);
      } else {
        fixture.finish();
      }
      await rejected;
      assert.deepEqual(fixture.eventNames(), []);
    });
  }

  it('[regression][CAP-001] ignores subframe failures and superseded aborts while awaiting the completed main document', async () => {
    const fixture = new NavigationFixture();
    fixture.navigate = async () => {
      fixture.redirect();
      throw aborted();
    };
    const loaded = fixture.load();
    await nextTurn();
    fixture.emit('did-fail-load', {}, -105, 'Subframe failed', `${origin}/frame`, false);
    fixture.emit('did-fail-load', {}, -3, 'Old document aborted', initialUrl, true);
    fixture.finish();
    await loaded;
    assert.deepEqual(fixture.eventNames(), []);
  });

  it('[security-target][CAP-001] bounds a replacement that never completes and removes every listener', async () => {
    const clock = useFakeTimers();
    try {
      const fixture = new NavigationFixture();
      fixture.navigate = async () => {
        fixture.redirect();
        throw aborted();
      };
      const rejected = assert.rejects(fixture.load(), /timed out/);
      await clock.tickAsync(30_000);
      await rejected;
      assert.deepEqual(fixture.eventNames(), []);
      assert.equal(clock.countTimers(), 0);
    } finally {
      clock.restore();
    }
  });
});
