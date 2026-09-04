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

import {createRendererRuntimeArguments, readRendererLocale, readRendererUserDataPath} from './rendererRuntimeArguments';

describe('renderer runtime arguments', () => {
  it('round-trips locale and user-data values without renderer access to Electron app', () => {
    const argv = createRendererRuntimeArguments({locale: 'de-DE', userDataPath: '/tmp/Wire Desktop/user data'});

    assert.strictEqual(readRendererLocale(argv), 'de-DE');
    assert.strictEqual(readRendererUserDataPath(argv), '/tmp/Wire Desktop/user data');
  });

  it('fails closed for missing or malformed values', () => {
    assert.strictEqual(readRendererLocale([]), undefined);
    assert.strictEqual(readRendererUserDataPath(['--wire-desktop-user-data=%E0%A4%A']), undefined);
  });
});
