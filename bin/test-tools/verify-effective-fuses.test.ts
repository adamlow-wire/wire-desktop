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

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));

describe('effective packaged Electron fuse wire', () => {
  it('accepts the complete reviewed unsigned wire and reports every bit', () => {
    const {assertConfiguredFuses} = requireCjs('./bin/test-tools/verify-effective-fuses.cjs');
    assert.equal(assertConfiguredFuses(Buffer.from('010001011', 'ascii')), '010001011');
  });

  it('rejects each changed configured security bit and incomplete wires', () => {
    const {assertConfiguredFuses} = requireCjs('./bin/test-tools/verify-effective-fuses.cjs');
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const changed = [...'010001011'];
      changed[index] = changed[index] === '1' ? '0' : '1';
      assert.throws(() => assertConfiguredFuses(Buffer.from(changed.join(''), 'ascii')), /fuse/i);
    }
    assert.throws(() => assertConfiguredFuses(Buffer.from('01000101', 'ascii')), /fuse/i);
  });
});
