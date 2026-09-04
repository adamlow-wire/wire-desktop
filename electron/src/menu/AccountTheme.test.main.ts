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
import {EventEmitter} from 'events';

import {attachAccountTheme} from './AccountTheme';

describe('account theme delivery', () => {
  it('delivers the initial and updated native theme without renderer access to nativeTheme', () => {
    const contents = new EventEmitter() as EventEmitter & {
      isDestroyed(): boolean;
      send(channel: string, value: boolean): void;
    };
    const sent: unknown[] = [];
    contents.isDestroyed = () => false;
    contents.send = (channel, value) => sent.push({channel, value});
    const theme = new EventEmitter() as EventEmitter & {shouldUseDarkColors: boolean};
    theme.shouldUseDarkColors = false;

    attachAccountTheme(contents, theme);
    contents.emit('did-finish-load');
    theme.shouldUseDarkColors = true;
    theme.emit('updated');

    assert.deepStrictEqual(sent, [
      {channel: 'wire-desktop:account-theme', value: false},
      {channel: 'wire-desktop:account-theme', value: true},
    ]);
  });

  it('stops theme delivery when the account contents is destroyed', () => {
    const contents = new EventEmitter() as EventEmitter & {
      isDestroyed(): boolean;
      send(channel: string, value: boolean): void;
    };
    const sent: unknown[] = [];
    contents.isDestroyed = () => false;
    contents.send = (channel, value) => sent.push({channel, value});
    const theme = new EventEmitter() as EventEmitter & {shouldUseDarkColors: boolean};
    theme.shouldUseDarkColors = false;

    attachAccountTheme(contents, theme);
    contents.emit('destroyed');
    theme.shouldUseDarkColors = true;
    theme.emit('updated');

    assert.deepStrictEqual(sent, []);
    assert.strictEqual(theme.listenerCount('updated'), 0);
  });
});
