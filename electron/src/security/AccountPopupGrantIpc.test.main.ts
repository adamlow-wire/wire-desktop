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

import {
  ACCOUNT_POPUP_GRANT_CAPABILITY,
  ACCOUNT_POPUP_GRANT_CHANNEL,
  ACCOUNT_POPUP_GRANT_FEATURE,
} from './AccountPopupGrantContract';
import {bindAccountPopupGrantIpc} from './AccountPopupGrantIpc';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

const ORIGIN = 'https://account.wire.test';
const DESTINATION = 'https://example.test/message';

describe('account popup one-use main-frame grants [security-target][SEC-008]', () => {
  const createHarness = () => {
    const registry = new ViewIdentityRegistry();
    const listeners = new Map<string, (event: any, request: unknown) => void>();
    const session = {};
    const frame = {url: `${ORIGIN}/account`};
    let destroyed = false;
    const contents = {id: 101, mainFrame: frame, session, isDestroyed: () => destroyed};
    registry.register({
      accountId: 'account-1',
      allowedOrigin: ORIGIN,
      capabilities: [ACCOUNT_POPUP_GRANT_CAPABILITY],
      partition: 'persist:account-1',
      session,
      viewType: 'account',
      webContents: contents,
    });
    let clock = 100;
    const grants = bindAccountPopupGrantIpc(
      {
        on: (channel, listener) => listeners.set(channel, listener),
        removeListener: channel => void listeners.delete(channel),
      },
      registry,
      () => clock,
    );
    const issue = (
      request: unknown,
      senderFrame: typeof frame | {url: string} = frame,
      sender: typeof contents = contents,
    ): string => {
      const event = {sender, senderFrame, returnValue: undefined as unknown};
      listeners.get(ACCOUNT_POPUP_GRANT_CHANNEL)!(event, request);
      return event.returnValue as string;
    };
    const details = (token: string, url = DESTINATION, frameName = '_blank', features = '') => ({
      features: `${features},${ACCOUNT_POPUP_GRANT_FEATURE}=${token}`,
      frameName,
      url,
    });
    return {
      contents,
      details,
      grants,
      issue,
      registry,
      setClock: (value: number) => (clock = value),
      setDestroyed: () => (destroyed = true),
    };
  };

  it('issues a bounded token only to the registered account main frame and consumes it once for an exact popup', () => {
    const {contents, details, grants, issue} = createHarness();
    const token = issue({url: DESTINATION, frameName: '_blank'});
    assert.match(token, /^[0-9a-f]{32}$/);
    assert.strictEqual(grants.consume(contents, details(token)), true);
    assert.strictEqual(grants.consume(contents, details(token)), false);
    grants.dispose();
  });

  it('denies child, wrong-view, stale and malformed issuance before a usable grant exists', () => {
    const {contents, details, grants, issue, registry} = createHarness();
    assert.throws(() => issue({url: DESTINATION, frameName: '_blank'}, {url: `${ORIGIN}/child`}), /authorized/);
    const otherContents = {
      id: 102,
      mainFrame: {url: `${ORIGIN}/shell`},
      session: contents.session,
      isDestroyed: () => false,
    };
    registry.register({
      allowedOrigin: ORIGIN,
      capabilities: [ACCOUNT_POPUP_GRANT_CAPABILITY],
      partition: 'persist:account-1',
      session: contents.session,
      viewType: 'application-shell',
      webContents: otherContents,
    });
    assert.throws(
      () => issue({url: DESTINATION, frameName: '_blank'}, otherContents.mainFrame, otherContents),
      /view type/,
    );
    for (const request of [
      null,
      {url: DESTINATION},
      {url: DESTINATION, frameName: '_blank', extra: true},
      {url: 'file:///secret', frameName: '_blank'},
    ]) {
      assert.throws(() => issue(request));
    }
    const token = issue({url: DESTINATION, frameName: '_blank'});
    registry.unregister(contents.id);
    assert.strictEqual(grants.consume(contents, details(token)), false);
    grants.dispose();
  });

  it('binds each token to its destination, window name and short lifetime, rejecting marker ambiguity', () => {
    const {contents, details, grants, issue, setClock} = createHarness();
    const wrongDestination = issue({url: DESTINATION, frameName: '_blank'});
    assert.strictEqual(grants.consume(contents, details(wrongDestination, 'https://example.test/other')), false);
    const wrongName = issue({url: DESTINATION, frameName: '_blank'});
    assert.strictEqual(grants.consume(contents, details(wrongName, DESTINATION, 'WIRE_SSO')), false);
    const duplicate = issue({url: DESTINATION, frameName: '_blank'});
    assert.strictEqual(
      grants.consume(
        contents,
        details(duplicate, DESTINATION, '_blank', `${ACCOUNT_POPUP_GRANT_FEATURE}=${duplicate}`),
      ),
      false,
    );
    const expired = issue({url: DESTINATION, frameName: '_blank'});
    setClock(5_100);
    assert.strictEqual(grants.consume(contents, details(expired)), false);
    grants.dispose();
  });

  it('preserves one-use blank PiP and HTTPS SSO destinations without allowing arbitrary or excessive grants', () => {
    const {contents, details, grants, issue} = createHarness();
    const pip = issue({url: '', frameName: 'WIRE_PICTURE_IN_PICTURE_CALL'});
    assert.strictEqual(grants.consume(contents, details(pip, 'about:blank', 'WIRE_PICTURE_IN_PICTURE_CALL')), true);
    const sso = issue({url: 'https://idp.test/login', frameName: 'WIRE_SSO'});
    assert.strictEqual(grants.consume(contents, details(sso, 'https://idp.test/login', 'WIRE_SSO')), true);
    assert.throws(() => issue({url: 'javascript:alert(1)', frameName: '_blank'}), /not allowed/);
    for (let index = 0; index < 16; index++) {
      issue({url: DESTINATION, frameName: '_blank'});
    }
    assert.throws(() => issue({url: DESTINATION, frameName: '_blank'}), /capacity/);
    grants.dispose();
  });
});
