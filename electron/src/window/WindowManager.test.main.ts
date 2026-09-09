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

import {BrowserWindow} from 'electron';
import {assert as sinonAssert, replace, restore, spy} from 'sinon';

import {strict as assert} from 'assert';

import {WindowManager} from './WindowManager';
import {sendToWebContents} from './WindowUtil';

import {EVENT_TYPE} from '../lib/eventType';

describe('WindowManager queued actions', () => {
  afterEach(() => {
    WindowManager.actionsQueue = [];
    restore();
  });

  it('[regression][CAP-001] routes native menu callbacks only for the bound window and releases the binding', () => {
    const window = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
    const native = spy();
    const shell = spy(window.webContents, 'send');
    const dispose = WindowManager.bindNativeActions(window.id, native);
    try {
      sendToWebContents(window, EVENT_TYPE.UI.SYSTEM_MENU, EVENT_TYPE.CONVERSATION.SEARCH);
      assert.deepEqual(native.args, [[EVENT_TYPE.UI.SYSTEM_MENU, [EVENT_TYPE.CONVERSATION.SEARCH]]]);
      sinonAssert.notCalled(shell);
      assert.equal(WindowManager.dispatchNativeAction(window.id + 1, EVENT_TYPE.UI.SYSTEM_MENU, ['wrong']), false);
      assert.equal(WindowManager.dispatchNativeAction(window.id, 'other-channel', []), false);
      assert.equal(WindowManager.dispatchNativeAction(window.id, EVENT_TYPE.UI.SYSTEM_MENU, [42]), true);
      sinonAssert.calledOnce(native);
      sendToWebContents(window, EVENT_TYPE.EDIT.COPY);
      sendToWebContents(window, EVENT_TYPE.ACTION.SWITCH_ACCOUNT, 1);
      assert.deepEqual(native.secondCall.args, [EVENT_TYPE.EDIT.COPY, []]);
      assert.deepEqual(native.thirdCall.args, [EVENT_TYPE.ACTION.SWITCH_ACCOUNT, [1]]);
      sinonAssert.notCalled(shell);
      dispose();
      assert.equal(WindowManager.dispatchNativeAction(window.id, EVENT_TYPE.UI.SYSTEM_MENU, ['stale']), false);
    } finally {
      dispose();
      window.destroy();
    }
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

  it('[regression][DCP-010][CAP-001] retains actions queued during a flush for the next flush', () => {
    const sendAction = spy(() => {
      if (sendAction.callCount === 1) {
        WindowManager.actionsQueue.push({action: 'action:later', args: ['account-b']});
      }
    });
    replace(WindowManager, 'sendActionToPrimaryWindow', sendAction);
    WindowManager.actionsQueue = [{action: 'action:first', args: ['account-a']}];

    WindowManager.flushActionsQueue();

    sinonAssert.calledOnce(sendAction);
    assert.deepStrictEqual(WindowManager.actionsQueue, [{action: 'action:later', args: ['account-b']}]);
    WindowManager.flushActionsQueue();
    sinonAssert.calledTwice(sendAction);
    assert.deepStrictEqual(sendAction.secondCall.args, ['action:later', 'account-b']);
    assert.deepStrictEqual(WindowManager.actionsQueue, []);
  });
});
