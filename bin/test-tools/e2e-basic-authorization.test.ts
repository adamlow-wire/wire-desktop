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
 */

import * as assert from 'assert';

import {normalizeBasicAuthorization} from './e2e-basic-authorization';

describe('normalizeBasicAuthorization', () => {
  it('encodes a raw username and password', () => {
    assert.strictEqual(
      normalizeBasicAuthorization('test-user:test-password'),
      'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=',
    );
  });

  it('accepts an encoded username and password', () => {
    assert.strictEqual(
      normalizeBasicAuthorization('dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ='),
      'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=',
    );
  });

  it('accepts a complete authorization value', () => {
    assert.strictEqual(
      normalizeBasicAuthorization('Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ='),
      'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=',
    );
  });

  it('rejects empty credentials', () => {
    assert.throws(() => normalizeBasicAuthorization('  '), /must not be empty/);
  });

  it('rejects malformed encoded credentials', () => {
    assert.throws(() => normalizeBasicAuthorization('not-base64'), /valid Basic authentication/);
  });
});
