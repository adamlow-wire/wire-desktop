/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import {dialog} from 'electron';
import {spy, replace, restore, stub} from 'sinon';

import * as assert from 'assert';

import {CustomProtocolHandler} from './CoreProtocol';
import {EVENT_TYPE} from './eventType';

let protocolHandler: CustomProtocolHandler;

describe('dispatchDeepLink', () => {
  const sendActionSpy = spy();

  beforeEach(() => {
    sendActionSpy.resetHistory();
    stub(dialog, 'showMessageBoxSync').returns(0);
    protocolHandler = new CustomProtocolHandler();
    replace(protocolHandler['windowManager'], 'sendActionToPrimaryWindow', sendActionSpy);
    replace(protocolHandler['windowManager'], 'sendActionAndFocusWindow', sendActionSpy);
  });

  for (const route of [
    'user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f/wire.test',
    'user/wire.test/266d36c0-ae62-48b5-91b5-b10ed42f1a0f',
    'conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd/wire.test',
    'conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd/files/folder/report%20one.pdf',
    'conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd/wire.test/files/folder',
    'preferences/account',
    'meetings',
  ]) {
    it(`[characterization][SEC-013] preserves the supported webapp route ${route}`, async () => {
      await protocolHandler.dispatchDeepLink(`wire://${route}`);
      assert.ok(sendActionSpy.calledOnceWithExactly(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, `/${route}`));
    });
  }

  it('[characterization][SEC-013] preserves absent join domain as null at the existing dispatch boundary', async () => {
    await protocolHandler.dispatchDeepLink('wire://conversation-join/?key=invite-key&code=invite-code');
    assert.ok(
      sendActionSpy.calledOnceWithExactly(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {
        code: 'invite-code',
        key: 'invite-key',
        domain: null,
      }),
    );
  });

  afterEach(() => restore());

  for (const url of [
    'wire://unknown/admin',
    'wire://user/not-a-uuid',
    'wire://start-login/extra',
    'wire://start-sso/not-a-code',
    'wire://conversation-join?code=code',
    'wire://conversation-join?code=code&key=key&key=other',
    'wire://conversation-join?code=code&key=key&domain=',
    'wire://user:password@start-login',
    'wire://start-login:80',
    'wire://start-login#unexpected',
    'wire://user/../start-login',
    'wire://user/%2e%2e/start-login',
    'wire://conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd/files/a%2fb',
    'wire://start-login\n',
    `wire://user/${'a'.repeat(1024)}`,
  ]) {
    it(`[security-target][INV-005][SEC-013] refuses unapproved action ${url.slice(0, 90)}`, async () => {
      await protocolHandler.dispatchDeepLink(url);
      assert.ok(sendActionSpy.notCalled, 'invalid links must not dispatch any action');
      assert.strictEqual(protocolHandler.hashLocation, '');
    });
  }

  it('forwards conversation deep links to the WebApp', async () => {
    await protocolHandler['dispatchDeepLink']('wire://conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd');
    assert.ok(
      sendActionSpy.calledWith(
        EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH,
        '/conversation/8cdb44a0-418b-4188-9a53-7c477a7848dd',
      ),
    );
  });

  it('[security-target][SEC-013] leaves the last valid location unchanged after invalid input', async () => {
    await protocolHandler.dispatchDeepLink('wire://user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f');
    sendActionSpy.resetHistory();
    await protocolHandler.dispatchDeepLink('wire://unknown');
    assert.ok(sendActionSpy.notCalled);
    assert.strictEqual(protocolHandler.hashLocation, '/user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f');
  });

  it('[SEC-013] contains asynchronous action delivery failures', async () => {
    restore();
    stub(protocolHandler['windowManager'], 'sendActionAndFocusWindow').rejects(new Error('test delivery failure'));
    await assert.doesNotReject(() => protocolHandler.dispatchDeepLink('wire://start-login'));
  });

  it('forwards user profile deep links to the WebApp', async () => {
    await protocolHandler['dispatchDeepLink']('wire://user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f');
    assert.ok(
      sendActionSpy.calledWith(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, '/user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f'),
    );
  });

  it('forwards SSO logins', async () => {
    await protocolHandler['dispatchDeepLink']('wire://start-sso/wire-13266298-4ac8-44b5-8281-dfb9e95fab5c');
    assert.ok(sendActionSpy.calledWith(EVENT_TYPE.ACCOUNT.SSO_LOGIN, 'wire-13266298-4ac8-44b5-8281-dfb9e95fab5c'));
  });

  it('forwards start login events', async () => {
    await protocolHandler['dispatchDeepLink']('wire://start-login');
    assert.ok(sendActionSpy.calledWith(EVENT_TYPE.ACTION.START_LOGIN));
  });

  it('[characterization][SEC-003][SEC-013][CAP-006] preserves conversation join parameters', async () => {
    await protocolHandler['dispatchDeepLink'](
      'wire://conversation-join?code=invite-code&key=invite-key&domain=wire.test',
    );

    assert.ok(
      sendActionSpy.calledWith(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {
        code: 'invite-code',
        domain: 'wire.test',
        key: 'invite-key',
      }),
    );
  });
});
