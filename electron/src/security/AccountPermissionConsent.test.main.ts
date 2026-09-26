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
import {restore, stub, SinonStub} from 'sinon';

import {strict as assert} from 'node:assert';

import {createAccountPermissionConsent} from './AccountPermissionConsent';
import {AccountPermissionConsent} from './AccountPermissionPolicy';
import {AccountPermissionPromptModel} from './AccountPermissionPromptContract';
import {AuthorizedViewIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

import * as locale from '../locale';

describe('[security-target][SEC-009] account permission consent', () => {
  let window: BrowserWindow;
  let consent: AccountPermissionConsent;
  let identity: AuthorizedViewIdentity;
  let prompt: SinonStub;
  let focus: SinonStub;
  let cancellation: AbortController;

  beforeEach(() => {
    window = new BrowserWindow({show: false, webPreferences: {sandbox: true, contextIsolation: true}});
    focus = stub(window, 'isFocused').returns(true);
    prompt = stub().resolves(true);
    identity = new ViewIdentityRegistry().register({
      accountId: 'fixture',
      allowedOrigin: 'https://app.wire.test',
      capabilities: [],
      partition: 'fixture',
      session: window.webContents.session,
      viewType: 'account',
      webContents: window.webContents,
    });
    cancellation = new AbortController();
    consent = createAccountPermissionConsent(window, prompt);
  });

  afterEach(() => {
    restore();
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });

  it('uses an owner-bound cancel-default model with canonical origin and separate requested scopes', async () => {
    assert.equal(consent.canPrompt(identity), true);
    assert.equal(await consent.ask(identity, ['audio', 'video'], cancellation.signal), true);
    assert.equal(prompt.firstCall.args[0], window);
    const model = prompt.firstCall.args[1] as AccountPermissionPromptModel;
    assert.equal(model.title, 'Use your camera and microphone?');
    assert.equal(model.origin, 'https://app.wire.test');
    assert.equal(model.cancel, 'Not now');
    assert.equal(model.allow, 'Allow');
    assert.deepEqual(
      model.scopes.map(scope => scope.label),
      ['Microphone', 'Camera'],
    );
    assert.ok(model.scopes.every(scope => scope.reason.length > 15));
    assert.ok(prompt.firstCall.args[2] instanceof AbortSignal);
  });

  it('[regression][SEC-009] explains why each requested permission is needed before approval', async () => {
    const cases = [
      {scope: 'audio' as const, reason: 'hear you'},
      {scope: 'video' as const, reason: 'see you'},
      {scope: 'notifications' as const, reason: 'new messages and calls'},
    ];
    for (const {scope, reason} of cases) {
      assert.equal(await consent.ask(identity, [scope], new AbortController().signal), true);
      const model = prompt.lastCall.args[1] as AccountPermissionPromptModel;
      assert.ok(model.scopes[0].reason.includes(reason), `${scope} must explain its purpose`);
    }
  });

  it('denies background, aborted, auxiliary and malformed requests without a dialog', async () => {
    focus.returns(false);
    assert.equal(consent.canPrompt(identity), false);
    assert.equal(await consent.ask(identity, ['audio'], cancellation.signal), false);
    focus.returns(true);
    cancellation.abort();
    assert.equal(await consent.ask(identity, ['audio'], cancellation.signal), false);
    cancellation = new AbortController();
    for (const invalid of [
      {...identity, viewType: 'sso' as const},
      {...identity, allowedOrigin: 'https://user:pass@wire.test'},
      {...identity, allowedOrigin: 'https://wire.test/path?secret=value'},
    ]) {
      assert.equal(await consent.ask(invalid, ['audio'], cancellation.signal), false);
    }
    assert.equal(await consent.ask(identity, [], cancellation.signal), false);
    assert.equal(await consent.ask(identity, ['audio', 'audio'], cancellation.signal), false);
    assert.equal(prompt.callCount, 0);
  });

  it('denies cancellation, unexpected presenter results and errors', async () => {
    for (const result of [false, 0, undefined, 'allow']) {
      prompt.resolves(result);
      assert.equal(await consent.ask(identity, ['notifications'], cancellation.signal), false);
    }
    prompt.rejects(new Error('Fixture dialog failure'));
    await assert.rejects(consent.ask(identity, ['audio'], cancellation.signal), /Fixture dialog failure/);
  });

  it('uses translated labels with English fallback for new copy', async () => {
    stub(locale, 'getText').callsFake(key => locale.LANGUAGES.de[key]);
    assert.equal(await consent.ask(identity, ['notifications'], cancellation.signal), true);
    const model = prompt.firstCall.args[1] as AccountPermissionPromptModel;
    assert.equal(model.title, 'Show notifications?');
    assert.equal(model.scopes[0].label, 'Notifications');
    assert.ok(model.scopes[0].reason.includes('new messages and calls'));
  });

  it('aborts an outstanding prompt, rejects its late answer and bounds concurrent prompts', async () => {
    let answer!: (value: boolean) => void;
    prompt.callsFake(
      () =>
        new Promise(resolve => {
          answer = resolve;
        }),
    );
    const pending = consent.ask(identity, ['audio'], cancellation.signal);
    assert.equal(prompt.callCount, 1);
    const signal = prompt.firstCall.args[2] as AbortSignal;
    assert.equal(signal.aborted, false);
    assert.equal(await consent.ask(identity, ['video'], new AbortController().signal), false);
    assert.equal(prompt.callCount, 1);
    cancellation.abort();
    assert.equal(signal.aborted, true);
    answer(true);
    assert.equal(await pending, false);
    prompt.resolves(true);
    assert.equal(await consent.ask(identity, ['video'], new AbortController().signal), true);
  });

  it('cancels on owner closure and removes its listener after completion', async () => {
    const listeners = window.listenerCount('closed');
    assert.equal(await consent.ask(identity, ['audio'], cancellation.signal), true);
    assert.equal(window.listenerCount('closed'), listeners);
    prompt.callsFake(async (_owner, _model, signal: AbortSignal) => {
      window.destroy();
      assert.equal(signal.aborted, true);
      return true;
    });
    assert.equal(await consent.ask(identity, ['audio'], cancellation.signal), false);
  });

  it('refuses presenter approval if the owning window loses foreground eligibility', async () => {
    prompt.callsFake(async () => {
      focus.returns(false);
      return true;
    });
    assert.equal(await consent.ask(identity, ['audio'], cancellation.signal), false);
  });
});
