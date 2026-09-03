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

import {assert as sinonAssert, replace, restore, spy} from 'sinon';

import {strict as assert} from 'assert';

import {WindowManager} from './WindowManager';

describe('WindowManager queued actions', () => {
  afterEach(() => {
    WindowManager.actionsQueue = [];
    restore();
  });

  it('[characterization][DCP-002][CAP-001] forwards every queued action once and empties the queue', () => {
    const sendAction = spy();
    replace(WindowManager, 'sendActionToPrimaryWindow', sendAction);
    WindowManager.actionsQueue = [
      {action: 'action:first', args: ['account-a', 1]},
      {action: 'action:second', args: [{conversationId: 'conversation-a'}]},
    ];

    WindowManager.flushActionsQueue();

    sinonAssert.calledTwice(sendAction);
    assert.deepStrictEqual(sendAction.firstCall.args, ['action:first', 'account-a', 1]);
    assert.deepStrictEqual(sendAction.secondCall.args, ['action:second', {conversationId: 'conversation-a'}]);
    assert.deepStrictEqual(WindowManager.actionsQueue, []);
  });
});
