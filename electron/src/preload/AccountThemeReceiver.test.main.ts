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

import * as assert from 'assert';

import {createAccountThemeReceiver} from './AccountThemeReceiver';

describe('account theme receiver', () => {
  it('retains an early native theme until the web app is ready and publishes later updates', () => {
    const published: boolean[] = [];
    const receiver = createAccountThemeReceiver(value => published.push(value));

    receiver.receive(true);
    assert.deepStrictEqual(published, []);
    receiver.markWebAppLoaded();
    receiver.receive(false);

    assert.deepStrictEqual(published, [true, false]);
  });

  it('ignores malformed theme messages', () => {
    const published: boolean[] = [];
    const receiver = createAccountThemeReceiver(value => published.push(value));

    receiver.receive('dark');
    receiver.markWebAppLoaded();

    assert.deepStrictEqual(published, [false]);
  });
});
