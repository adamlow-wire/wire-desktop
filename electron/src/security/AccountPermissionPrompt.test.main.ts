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

import {strict as assert} from 'node:assert';

import {showAccountPermissionPrompt} from './AccountPermissionPrompt';
import {
  ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_URL,
} from './AccountPermissionPromptContract';
import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';

import {LANGUAGES} from '../locale/languages';

const until = async <T>(read: () => T | undefined): Promise<T> => {
  const deadline = Date.now() + 10_000;
  let value = read();
  while (!value) {
    if (Date.now() >= deadline) {
      throw new Error('Local permission prompt did not become ready.');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
    value = read();
  }
  return value;
};

describe('[security-target][SEC-009] native local account permission prompt', function () {
  this.timeout(20_000);
  let owner: BrowserWindow;
  let prompt: BrowserWindow | undefined;

  beforeEach(async () => {
    owner = new BrowserWindow({
      show: true,
      webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false},
    });
    await owner.loadURL('data:text/html,<title>Test owner</title>');
    owner.focus();
    await until(() => owner.isFocused() || undefined);
  });

  afterEach(() => {
    if (prompt && !prompt.isDestroyed()) {
      prompt.destroy();
    }
    if (owner && !owner.isDestroyed()) {
      owner.destroy();
    }
  });

  const start = (signal: AbortSignal) => {
    const model = createAccountPermissionPromptCopy(
      'https://app.wire.test',
      ['audio', 'video'],
      key => LANGUAGES.en[key],
      'Wire',
    );
    const result = showAccountPermissionPrompt(owner, model, signal);
    return {result, model};
  };

  const visiblePrompt = async (): Promise<BrowserWindow> => {
    prompt = await until(() =>
      BrowserWindow.getAllWindows().find(
        window =>
          window !== owner && !window.isDestroyed() && window.webContents.getURL() === ACCOUNT_PERMISSION_PROMPT_URL,
      ),
    );
    try {
      await until(() => (prompt!.isVisible() && prompt!.isFocused() ? true : undefined));
    } catch {
      const state = await prompt.webContents.executeJavaScript(
        '({readyState:document.readyState,url:location.href,title:document.title,body:document.body?.textContent?.slice(0,160)})',
      );
      throw new Error(
        `Local permission prompt unavailable: visible=${prompt.isVisible()}, focused=${prompt.isFocused()}, ` +
          `document=${JSON.stringify(state)}`,
      );
    }
    return prompt;
  };

  it('shows only purpose and origin text, then accepts one focused local Allow action', async () => {
    const {result} = start(new AbortController().signal);
    const modal = await visiblePrompt();
    const content = await modal.webContents.executeJavaScript(
      "({title:document.getElementById('permission-title').textContent,origin:document.getElementById('requesting-origin').textContent,reasons:[...document.querySelectorAll('.scope p')].map(node=>node.textContent)})",
    );
    assert.equal(content.title, 'Use your camera and microphone?');
    assert.equal(content.origin, 'https://app.wire.test');
    assert.equal(content.reasons.length, 2);
    assert.match(content.reasons[0], /hear you/);
    assert.match(content.reasons[1], /see you/);
    void modal.webContents
      .executeJavaScript("document.getElementById('permission-allow').click(); void 0;", true)
      .catch(() => undefined);
    assert.equal(await result, true);
    assert.equal(modal.isDestroyed(), true);
  });

  it('defaults to denial on cancellation and destroys the local modal', async () => {
    const cancellation = new AbortController();
    const {result} = start(cancellation.signal);
    const modal = await visiblePrompt();
    cancellation.abort();
    assert.equal(await result, false);
    assert.equal(modal.isDestroyed(), true);
  });

  it('denies a forged decision from a different sender before any permission grant', async () => {
    const {result} = start(new AbortController().signal);
    const modal = await visiblePrompt();
    modal.webContents.emit(
      'ipc-message',
      {sender: owner.webContents, senderFrame: owner.webContents.mainFrame} as Electron.IpcMainEvent,
      ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL,
      true,
    );
    assert.equal(await result, false);
    assert.equal(modal.isDestroyed(), true);
  });
});
