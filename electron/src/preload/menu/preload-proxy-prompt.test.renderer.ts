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

import {ipcRenderer} from 'electron';
import {restore, spy, stub} from 'sinon';

import * as assert from 'assert';

import {loadedProxyPromptScreen, renderProxyPromptLocales} from './preload-proxy-prompt';

import {EVENT_TYPE} from '../../lib/eventType';

describe('proxy prompt preload', () => {
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
  });

  it('[characterization][SEC-003][CAP-005] preserves labels, credentials, and cancellation controls', () => {
    const sendSpy = spy(ipcRenderer, 'send');
    const closeStub = stub(window, 'close');
    document.body.innerHTML = `
      <form id="form">
        <h1 data-string="proxyPromptTitle"></h1>
        <label data-string="proxyPromptUsername"></label>
        <input id="usernameInput" value="proxy-user" />
        <input id="passwordInput" value="proxy-password" />
        <button id="cancelButton" type="button"></button>
        <button id="okButton" type="submit"></button>
      </form>
    `;
    const usernameInput = document.querySelector<HTMLInputElement>('#usernameInput');
    assert.ok(usernameInput);
    const focusSpy = spy(usernameInput, 'focus');

    loadedProxyPromptScreen();
    renderProxyPromptLocales(null, {
      proxyPromptTitle: 'Proxy authentication',
      proxyPromptUsername: 'Username',
    });

    assert.strictEqual(focusSpy.calledOnce, true);
    assert.deepStrictEqual(sendSpy.firstCall.args, [
      EVENT_TYPE.PROXY_PROMPT.LOCALE_VALUES,
      ['proxyPromptTitle', 'proxyPromptUsername'],
    ]);
    assert.strictEqual(document.querySelector('[data-string="proxyPromptTitle"]')?.textContent, 'Proxy authentication');
    assert.strictEqual(document.querySelector('[data-string="proxyPromptUsername"]')?.textContent, 'Username');

    document.querySelector<HTMLFormElement>('#form')?.dispatchEvent(new Event('submit'));
    assert.deepStrictEqual(sendSpy.secondCall.args, [
      EVENT_TYPE.PROXY_PROMPT.SUBMITTED,
      {
        password: 'proxy-password',
        username: 'proxy-user',
      },
    ]);

    document.querySelector<HTMLButtonElement>('#cancelButton')?.click();
    assert.deepStrictEqual(sendSpy.thirdCall.args, [EVENT_TYPE.PROXY_PROMPT.CANCELED]);
    assert.strictEqual(closeStub.callCount, 2);
  });
});
