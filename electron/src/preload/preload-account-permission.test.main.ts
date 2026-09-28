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

import {JSDOM} from 'jsdom';

import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

import {LANGUAGES} from '../locale/languages';
import {
  ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL,
} from '../security/AccountPermissionPromptContract';
import {createAccountPermissionPromptCopy} from '../security/AccountPermissionPromptCopy';

type ModelListener = (_event: unknown, model: unknown) => void;

const withPreload = (check: (fixture: {document: Document; model: ModelListener; sent: unknown[][]}) => void): void => {
  const html = readFileSync(path.resolve('electron/html/account-permission.html'), 'utf8');
  const dom = new JSDOM(html);
  const filename = require.resolve('./preload-account-permission.ts');
  const globalDocument = globalThis as typeof globalThis & {document?: Document};
  const originalDocument = globalDocument.document;
  const loader = Module as unknown as {
    _load(request: string, parent: NodeModule | undefined, isMain: boolean): unknown;
  };
  const originalLoad = loader._load;
  const sent: unknown[][] = [];
  let model: ModelListener | undefined;
  const ipcRenderer = {
    once(channel: string, listener: ModelListener) {
      assert.equal(channel, ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL);
      model = listener;
    },
    send(...args: unknown[]) {
      sent.push(args);
    },
  };
  try {
    globalDocument.document = dom.window.document;
    loader._load = (request, parent, isMain) =>
      request === 'electron' && parent?.filename === filename
        ? {ipcRenderer}
        : originalLoad.call(loader, request, parent, isMain);
    delete require.cache[filename];
    require(filename);
    assert.ok(model, 'The real preload must register one model listener.');
    check({document: dom.window.document, model, sent});
  } finally {
    loader._load = originalLoad;
    delete require.cache[filename];
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalDocument, 'document');
    } else {
      globalDocument.document = originalDocument;
    }
    dom.window.close();
  }
};

describe('[security-target][SEC-009] isolated permission preload', () => {
  const copy = () =>
    createAccountPermissionPromptCopy('https://app.wire.test', ['audio', 'video'], key => LANGUAGES.en[key], 'Wire');

  it('renders exact bounded copy as text, then sends one focused Allow decision', () => {
    withPreload(({document, model, sent}) => {
      model({}, {...copy(), origin: 'https://app.wire.test/<img src=x onerror=alert(1)>'});
      assert.equal(document.querySelector('#permission-title')?.textContent, 'Use your camera and microphone?');
      assert.equal(
        document.querySelector('#requesting-origin')?.textContent,
        'https://app.wire.test/<img src=x onerror=alert(1)>',
      );
      assert.equal(document.querySelector('#requesting-origin img'), null);
      assert.deepEqual(
        [...document.querySelectorAll('.scope strong')].map(node => node.textContent),
        ['Microphone', 'Camera'],
      );
      assert.ok([...document.querySelectorAll('.scope p')].every(node => Boolean(node.textContent)));
      assert.deepEqual(sent, [[ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL]]);
      (document.querySelector('#permission-allow') as HTMLButtonElement).click();
      (document.querySelector('#permission-cancel') as HTMLButtonElement).click();
      assert.deepEqual(sent, [
        [ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL],
        [ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL, true],
      ]);
    });
  });

  it('sends one denial for Not now or Escape without an approval', () => {
    for (const action of ['cancel', 'escape']) {
      withPreload(({document, model, sent}) => {
        model({}, copy());
        if (action === 'cancel') {
          (document.querySelector('#permission-cancel') as HTMLButtonElement).click();
        } else {
          document.dispatchEvent(new document.defaultView!.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        }
        (document.querySelector('#permission-allow') as HTMLButtonElement).click();
        assert.deepEqual(sent, [
          [ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL],
          [ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL, false],
        ]);
      });
    }
  });

  it('denies a malformed model before it can create a grant', () => {
    withPreload(({document, model, sent}) => {
      model({}, {...copy(), scopes: [{label: 'Camera', reason: ''}]});
      assert.equal(document.querySelectorAll('.scope').length, 0);
      assert.deepEqual(sent, [[ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL, false]]);
    });
  });
});
