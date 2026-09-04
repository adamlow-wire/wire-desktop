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

import {loadedProxyPromptScreen} from './preload-proxy-prompt';

import {
  PROXY_PROMPT_CANCEL_CHANNEL,
  PROXY_PROMPT_LOCALE_READ_CHANNEL,
  PROXY_PROMPT_SUBMIT_CHANNEL,
} from '../../security/ProxyPromptContract';

describe('proxy prompt preload', () => {
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
  });

  it('[characterization][SEC-003][CAP-005] preserves labels, credentials, and cancellation controls', async () => {
    const invokeStub = stub(ipcRenderer, 'invoke').callsFake(async channel =>
      channel === PROXY_PROMPT_LOCALE_READ_CHANNEL
        ? {proxyPromptTitle: 'Proxy authentication', proxyPromptUsername: 'Username'}
        : undefined,
    );
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

    await loadedProxyPromptScreen();

    assert.strictEqual(focusSpy.calledOnce, true);
    assert.deepStrictEqual(invokeStub.firstCall.args, [
      PROXY_PROMPT_LOCALE_READ_CHANNEL,
      {labels: ['proxyPromptTitle', 'proxyPromptUsername']},
    ]);
    assert.strictEqual(document.querySelector('[data-string="proxyPromptTitle"]')?.textContent, 'Proxy authentication');
    assert.strictEqual(document.querySelector('[data-string="proxyPromptUsername"]')?.textContent, 'Username');

    document.querySelector<HTMLFormElement>('#form')?.dispatchEvent(new Event('submit', {cancelable: true}));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepStrictEqual(invokeStub.secondCall.args, [
      PROXY_PROMPT_SUBMIT_CHANNEL,
      {
        password: 'proxy-password',
        username: 'proxy-user',
      },
    ]);

    document.querySelector<HTMLButtonElement>('#cancelButton')?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepStrictEqual(invokeStub.thirdCall.args, [PROXY_PROMPT_CANCEL_CHANNEL, undefined]);
    assert.strictEqual(closeStub.callCount, 2);
  });

  it('[security-target][INV-010][SEC-003] keeps the prompt open when submission is rejected', async () => {
    stub(console, 'error');
    stub(ipcRenderer, 'invoke').callsFake(async channel => {
      if (channel === PROXY_PROMPT_LOCALE_READ_CHANNEL) {
        return {};
      }
      throw new Error('controlled rejection');
    });
    const closeStub = stub(window, 'close');
    document.body.innerHTML = `
      <form id="form">
        <input id="usernameInput" />
        <input id="passwordInput" />
        <button id="cancelButton" type="button"></button>
        <button id="okButton" type="submit"></button>
      </form>
    `;

    await loadedProxyPromptScreen();
    document.querySelector<HTMLFormElement>('#form')?.dispatchEvent(new Event('submit', {cancelable: true}));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(closeStub.called, false);
  });
});
