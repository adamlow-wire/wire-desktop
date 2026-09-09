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

import {isAccount} from './guards';

describe('[CAP-001] account metadata guard', () => {
  it('recognizes metadata with an own string user ID, including null-prototype messages', () => {
    expect(isAccount({userID: 'user-id'})).toBe(true);
    expect(isAccount(Object.assign(Object.create(null), {userID: 'user-id'}))).toBe(true);
  });

  it.each([null, undefined, false, 1, 'user-id', [], {}, {userID: null}, {userID: 1}])(
    '[security-target] rejects malformed metadata %j without throwing',
    value => {
      expect(isAccount(value)).toBe(false);
    },
  );

  it('[security-target] does not trust inherited IDs or a supplied hasOwnProperty method', () => {
    expect(isAccount(Object.create({userID: 'inherited'}))).toBe(false);
    expect(isAccount({hasOwnProperty: () => true})).toBe(false);
    expect(isAccount({hasOwnProperty: null})).toBe(false);
    expect(isAccount(Object.assign([], {userID: 'array'}))).toBe(false);
  });
});
