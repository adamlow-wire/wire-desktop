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

import {ContextMenuPolicyInput, selectContextMenuAction} from './contextMenuPolicy';

const defaults: ContextMenuPolicyInput = {
  canCopy: false,
  canSelectAll: false,
  isEditable: false,
  linkURL: '',
  mediaType: 'none',
  selectionText: '',
};

describe('context menu policy', () => {
  it('preserves editable and image priority over copyable content', () => {
    assert.deepStrictEqual(
      selectContextMenuAction({...defaults, canCopy: true, isEditable: true, linkURL: 'https://wire.com'}),
      {kind: 'editable'},
    );
    assert.deepStrictEqual(
      selectContextMenuAction({...defaults, canCopy: true, linkURL: 'https://wire.com', mediaType: 'image'}),
      {kind: 'image'},
    );
  });

  it('copies links before selections and removes only a mailto prefix', () => {
    assert.deepStrictEqual(
      selectContextMenuAction({
        ...defaults,
        linkURL: 'mailto:person@wire.com',
        selectionText: 'ignored selection',
      }),
      {kind: 'copy', text: 'person@wire.com'},
    );
    assert.deepStrictEqual(selectContextMenuAction({...defaults, linkURL: 'MAILTO:person@wire.com'}), {
      kind: 'copy',
      text: 'MAILTO:person@wire.com',
    });
  });

  it('retains empty copy and DOM select-all fallback behavior', () => {
    assert.deepStrictEqual(selectContextMenuAction({...defaults, canCopy: true}), {kind: 'copy', text: ''});
    assert.deepStrictEqual(selectContextMenuAction({...defaults, canSelectAll: true}), {
      kind: 'select-all-fallback',
    });
    assert.deepStrictEqual(selectContextMenuAction(defaults), {kind: 'none'});
  });
});
