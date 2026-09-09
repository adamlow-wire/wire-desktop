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
import {assert as sinonAssert, replace, restore, spy, stub} from 'sinon';

import {strict as assert} from 'assert';

import {WindowManager} from './WindowManager';
import {sendToWebContents} from './WindowUtil';

import {EVENT_TYPE} from '../lib/eventType';

describe('WindowManager queued actions', () => {
  afterEach(() => {
    WindowManager.actionsQueue = [];
    restore();
  });

  for (const minimized of [false, true]) {
    it(`[regression][CAP-006] focuses an already visible window for login (minimized=${minimized})`, async () => {
      const window = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
      replace(WindowManager, 'getPrimaryWindow', () => window);
      stub(window, 'isVisible').returns(true);
      stub(window, 'isMinimized').returns(minimized);
      stub(window.webContents, 'isLoading').returns(false);
      const focus = stub(window, 'focus');
      const restoreWindow = stub(window, 'restore');
      const native = spy();
      const dispose = WindowManager.bindNativeActions(window.id, native);
      try {
        await WindowManager.sendActionAndFocusWindow(EVENT_TYPE.ACTION.START_LOGIN);
        sinonAssert.calledOnce(focus);
        assert.strictEqual(restoreWindow.callCount, minimized ? 1 : 0);
        assert.deepStrictEqual(native.args, [[EVENT_TYPE.ACTION.START_LOGIN, []]]);
      } finally {
        dispose();
        window.destroy();
      }
    });
  }

  it('[regression][CAP-006] restores focus when a pre-window login request is finally flushed', async () => {
    const target: {window: BrowserWindow | undefined} = {window: undefined};
    replace(WindowManager, 'getPrimaryWindow', () => target.window);
    await WindowManager.sendActionAndFocusWindow(EVENT_TYPE.ACTION.START_LOGIN);
    const window = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
    target.window = window;
    const focus = stub(window, 'focus');
    const native = spy();
    const dispose = WindowManager.bindNativeActions(window.id, native);
    try {
      WindowManager.flushActionsQueue();
      sinonAssert.calledOnce(focus);
      assert.deepStrictEqual(native.args, [[EVENT_TYPE.ACTION.START_LOGIN, []]]);
    } finally {
      dispose();
      window.destroy();
    }
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

  it('[regression][CAP-006] retains SSO received before the primary window and dispatches it once when startup flushes', async () => {
    replace(WindowManager, 'getPrimaryWindow', () => undefined);
    const code = 'wire-11111111-1111-4111-8111-111111111111';
    await WindowManager.sendActionAndFocusWindow(EVENT_TYPE.ACCOUNT.SSO_LOGIN, code);
    assert.deepStrictEqual(WindowManager.actionsQueue, [{action: EVENT_TYPE.ACCOUNT.SSO_LOGIN, args: [code]}]);
    const sendAction = spy();
    replace(WindowManager, 'sendActionToPrimaryWindow', sendAction);
    WindowManager.flushActionsQueue();
    WindowManager.flushActionsQueue();
    assert.deepStrictEqual(sendAction.args, [[EVENT_TYPE.ACCOUNT.SSO_LOGIN, code]]);
  });

  it('[security-target][CAP-006] bounds incoming startup actions and does not queue arbitrary channels', () => {
    replace(WindowManager, 'getPrimaryWindow', () => undefined);
    WindowManager.sendActionToPrimaryWindow('arbitrary-channel');
    assert.deepStrictEqual(WindowManager.actionsQueue, []);
    for (let index = 0; index < 32; index++) {
      WindowManager.sendActionToPrimaryWindow(EVENT_TYPE.ACCOUNT.SSO_LOGIN, `code-${index}`);
    }
    assert.throws(
      () => WindowManager.sendActionToPrimaryWindow(EVENT_TYPE.ACCOUNT.SSO_LOGIN, 'overflow'),
      /queue is full/,
    );
    assert.strictEqual(WindowManager.actionsQueue.length, 32);
    assert.strictEqual(WindowManager.actionsQueue[0].args[0], 'code-0');
  });

  it('[regression][CAP-006] retains incoming SSO while the window exists but its native binding is not ready', () => {
    const window = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
    replace(WindowManager, 'getPrimaryWindow', () => window);
    const shell = spy(window.webContents, 'send');
    const native = spy();
    let dispose = () => {};
    try {
      WindowManager.sendActionToPrimaryWindow(EVENT_TYPE.ACCOUNT.SSO_LOGIN, 'pending-code');
      sinonAssert.notCalled(shell);
      assert.strictEqual(WindowManager.actionsQueue.length, 1);
      WindowManager.flushActionsQueue();
      assert.strictEqual(WindowManager.actionsQueue.length, 1);
      dispose = WindowManager.bindNativeActions(window.id, native);
      WindowManager.flushActionsQueue();
      WindowManager.flushActionsQueue();
      assert.deepStrictEqual(native.args, [[EVENT_TYPE.ACCOUNT.SSO_LOGIN, ['pending-code']]]);
      assert.deepStrictEqual(WindowManager.actionsQueue, []);
      sinonAssert.notCalled(shell);
    } finally {
      dispose();
      window.destroy();
    }
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
