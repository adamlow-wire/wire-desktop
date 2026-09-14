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

import {BrowserWindow, dialog, MessageBoxOptions} from 'electron';
import {restore, stub, SinonStub} from 'sinon';

import {strict as assert} from 'node:assert';

import {approveAccountEnvironment} from './AccountEnvironmentApproval';

import * as locale from '../locale';

describe('native account environment approval', () => {
  let owner: BrowserWindow;
  let prompt: SinonStub;
  beforeEach(() => {
    owner = new BrowserWindow({
      show: false,
      webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false},
    });
    prompt = stub(dialog, 'showMessageBox').resolves({response: 1, checkboxChecked: false});
  });
  afterEach(() => {
    restore();
    if (!owner.isDestroyed()) {
      owner.destroy();
    }
  });

  it('[characterization][CAP-001] approves only the exact candidate through an owner-bound cancel-default prompt', async () => {
    const candidate = 'https://CUSTOM.wire.test:443/auth?env=fixture#login';
    assert.equal(await approveAccountEnvironment(owner, candidate), candidate);
    assert.equal(prompt.firstCall.args[0], owner);
    const options = prompt.firstCall.args[1] as MessageBoxOptions;
    assert.equal(options.type, 'question');
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 0);
  });

  it('[characterization][INV-010][CAP-001] rejects cancellation, unexpected results and dialog failure', async () => {
    for (const response of [0, -1, 2, NaN]) {
      prompt.resolves({response, checkboxChecked: false});
      await assert.rejects(approveAccountEnvironment(owner, 'https://custom.wire.test/'), /not approved/);
    }
    prompt.rejects(new Error('Fixture dialog failure'));
    await assert.rejects(approveAccountEnvironment(owner, 'https://custom.wire.test/'), /Fixture dialog failure/);
  });

  it('[regression][CAP-001] uses existing localized server-approval text without exposing URL query or fragment', async () => {
    stub(locale, 'getText').callsFake(key => locale.LANGUAGES.de[key]);
    await approveAccountEnvironment(owner, 'https://CUSTOM.wire.test:443/auth?private=value#secret');
    const options = prompt.firstCall.args[1] as MessageBoxOptions;
    assert.deepEqual(options.buttons, ['Abbrechen', 'Verbinden']);
    assert.equal(options.message, locale.LANGUAGES.de.changeEnvironmentModalTitle);
    assert.equal(
      options.detail,
      locale.LANGUAGES.de.changeEnvironmentModalText.replace('{url}', 'https://custom.wire.test'),
    );
  });

  it('[security-target][INV-005][CAP-001] rejects unsafe destinations before showing any approval prompt', async () => {
    for (const candidate of [
      'file:///fixture',
      'javascript:alert(1)',
      'https://user:password@wire.test/',
      'https://wire.test/\npath',
    ]) {
      await assert.rejects(approveAccountEnvironment(owner, candidate), /Invalid account destination/);
    }
    assert.equal(prompt.callCount, 0);
  });

  it('[security-target][INV-010][CAP-001] does not approve through a destroyed owner', async () => {
    owner.destroy();
    await assert.rejects(approveAccountEnvironment(owner, 'https://custom.wire.test/'), /not available/);
    assert.equal(prompt.callCount, 0);
  });

  it('[security-target][INV-005][CAP-001] refuses a foreign managed endpoint before asking the user', async () => {
    for (const candidate of [
      'https://other.wire.test/',
      'http://managed.wire.test/client',
      'https://managed.wire.test:444/client',
      'https://managed.wire.test.other.test/client',
    ]) {
      await assert.rejects(
        approveAccountEnvironment(owner, candidate, {
          isConfigured: true,
          url: 'https://managed.wire.test/client',
        }),
      );
    }
    assert.equal(prompt.callCount, 0);
  });

  it('[compatibility][CAP-001] still requires explicit confirmation for a same-origin managed route', async () => {
    const candidate = 'https://MANAGED.wire.test:443/auth?mode=desktop#login';
    assert.equal(
      await approveAccountEnvironment(owner, candidate, {isConfigured: true, url: 'https://managed.wire.test/client'}),
      candidate,
    );
    assert.equal(prompt.callCount, 1);
    assert.equal(prompt.firstCall.args[0], owner);
    assert.equal(prompt.firstCall.args[1].defaultId, 0);
  });

  it('[security-target][INV-010][CAP-001] refuses invalid managed configuration before asking the user', async () => {
    await assert.rejects(
      approveAccountEnvironment(owner, 'https://custom.wire.test/', {isConfigured: true, issue: 'invalid-url'}),
    );
    assert.equal(prompt.callCount, 0);
  });

  it('[security-target][INV-010][CAP-001] rejects approval if the owning window closes while awaiting the dialog', async () => {
    prompt.callsFake(async () => {
      owner.destroy();
      return {response: 1, checkboxChecked: false};
    });
    await assert.rejects(approveAccountEnvironment(owner, 'https://custom.wire.test/'), /not available/);
  });

  it('[security-target][CAP-001] inserts the canonical origin literally into the translated message', async () => {
    stub(locale, 'getText').callsFake(key => (key === 'changeEnvironmentModalText' ? 'Server: {url}' : key));
    await approveAccountEnvironment(owner, 'https://cash$&.wire.test/path?private=value');
    assert.equal(prompt.firstCall.args[1].detail, 'Server: https://cash$&.wire.test');
  });
});
