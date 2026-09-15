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

import {BrowserWindow, Cookie, ProtocolRequest, Session, WebContents, session, shell} from 'electron';
import * as logdown from 'logdown';
import {restore, stub} from 'sinon';
import {Maybe} from 'true-myth';

import * as assert from 'assert';

import {SingleSignOn} from './SingleSignOn';

import * as writer from '../logging/desktopLogWriter';
import {ENABLE_LOGGING} from '../logging/getLogger';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {openExternal} from '../window/WindowUtil';

const canary = 'fixture-secret-only';
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const listeners = new Map<string, (...args: any[]) => any>();
  const isolatedSession = {
    clearStorageData: async () => {},
    cookies: {get: async (): Promise<Cookie[]> => []},
    setPermissionRequestHandler: () => {},
    setPermissionCheckHandler: () => {},
    webRequest: {onBeforeSendHeaders: () => {}},
    protocol: {
      isProtocolRegistered: () => false,
      unregisterProtocol: () => true,
      registerStringProtocol: (
        _scheme: string,
        _callback: (request: ProtocolRequest, respond: (response: unknown) => void) => void,
      ) => true,
    },
  };
  const frame = {url: 'https://backend.example.test'};
  const wc = {
    id: 123,
    session: isolatedSession,
    mainFrame: frame,
    isDestroyed: () => false,
    once: () => {},
    on: (name: string, fn: (...args: any[]) => any) => listeners.set(name, fn),
    setWindowOpenHandler: () => {},
  };
  const win = {
    webContents: wc,
    once: (name: string, fn: (...args: any[]) => any) => listeners.set(name, fn),
    on: () => {},
    close: () => {},
    loadURL: async (_url: string) => {},
  };
  const options = {webPreferences: {partition: 'sso-11111111-1111-4111-8111-111111111111'}};
  const sso = new SingleSignOn(
    win as unknown as BrowserWindow,
    {session: {}} as WebContents,
    Maybe.just('11111111-1111-4111-8111-111111111111'),
    frame.url,
    options,
    new ViewIdentityRegistry(),
  );
  return {listeners, session: isolatedSession, win, sso};
}
describe('SingleSignOn diagnostic confidentiality', () => {
  let diagnostics: string[];
  let rawErrors: Error[];
  beforeEach(() => {
    diagnostics = [];
    rawErrors = [];
    for (const method of ['error', 'warn', 'info'] as const) {
      stub(SingleSignOn['logger'], method).callsFake((...args) => {
        diagnostics.push(args.map(String).join(' '));
        rawErrors.push(...args.filter(arg => arg instanceof Error));
      });
    }
    stub(console, 'info').callsFake((...args) => {
      diagnostics.push(args.map(String).join(' '));
      rawErrors.push(...args.filter(arg => arg instanceof Error));
    });
  });
  afterEach(() => restore());
  const safe = (required = true) => {
    if (required) {
      assert.ok(diagnostics.length > 0, 'Failure must retain a useful diagnostic');
    }
    assert.strictEqual(
      diagnostics.some(s => s.includes(canary) || s.length > 120),
      false,
    );
    assert.deepStrictEqual(rawErrors, [], 'Do not forward native errors, causes or parser input properties');
  };
  it('[security-target][CAP-002][INV-010] does not persist authentication-page console content', async () => {
    assert.strictEqual(ENABLE_LOGGING, true, 'This contract must execute with diagnostic logging enabled.');
    const writes: string[] = [];
    stub(writer, 'writeBoundedLogMessage').callsFake(async item => {
      writes.push(item.message);
    });
    const f = fixture();
    f.sso['setupBrowserWindow']();
    await f.listeners.get('console-message')?.({}, 1, canary);
    assert.deepStrictEqual(writes, []);
  });
  it('[security-target][CAP-002][INV-010] replaces failed login URL errors without retaining their cause', async () => {
    const f = fixture();
    stub(session, 'fromPartition').returns(f.session as unknown as Session);
    f.win.loadURL = async (url: string) => {
      assert.ok(url.includes('secret'));
      throw new Error(url + canary);
    };
    await assert.rejects(
      f.sso.init(),
      (error: Error & {cause?: unknown}) =>
        error.message === 'SSO login page could not be loaded.' && error.cause === undefined,
    );
    safe(false);
  });
  it('[security-target][CAP-002][INV-010] keeps native-closed cleanup errors out of diagnostics and does not signal completion', async () => {
    const f = fixture();
    f.sso['session'] = f.session as unknown as Session;
    f.session.clearStorageData = async () => {
      throw new Error(canary);
    };
    let closed = 0;
    f.sso.onClose = () => closed++;
    f.sso['setupBrowserWindow']();
    await f.listeners.get('closed')!();
    assert.strictEqual(closed, 0);
    safe();
  });
  it('[security-target][CAP-002][INV-010] keeps explicit-close cleanup errors out of diagnostics', async () => {
    const f = fixture();
    f.sso['session'] = f.session as unknown as Session;
    f.session.clearStorageData = async () => {
      throw new Error(canary);
    };
    f.sso.close();
    await settle();
    safe();
  });
  it('[security-target][CAP-002][INV-010] keeps rejected protocol finalization errors out of diagnostics', async () => {
    const f = fixture();
    let handler: ((request: ProtocolRequest, callback: (response: unknown) => void) => void) | undefined;
    f.session.protocol.registerStringProtocol = (
      _scheme: string,
      callback: (request: ProtocolRequest, respond: (response: unknown) => void) => void,
    ) => {
      handler = callback;
      return true;
    };
    const callback = await SingleSignOn['registerProtocol'](f.session as unknown as Session, () =>
      Promise.reject(new Error(canary)),
    );
    assert.ok(handler);
    handler(
      {
        method: 'GET',
        url: `${SingleSignOn['SSO_PROTOCOL']}://response?secret=${callback.secret}&type=AUTH_SUCCESS`,
      } as ProtocolRequest,
      () => {},
    );
    await settle();
    safe();
  });
  it('[security-target][CAP-002][INV-010] keeps URL parser errors out of diagnostics and denies the protocol request', async () => {
    const f = fixture();
    let handler: ((request: ProtocolRequest, callback: (response: unknown) => void) => void) | undefined;
    let response: unknown;
    f.session.protocol.registerStringProtocol = (
      _scheme: string,
      callback: (request: ProtocolRequest, respond: (response: unknown) => void) => void,
    ) => {
      handler = callback;
      return true;
    };
    await SingleSignOn['registerProtocol'](f.session as unknown as Session, () => assert.fail('must not finalize'));
    assert.ok(handler);
    handler(
      {method: 'GET', url: `${SingleSignOn['SSO_PROTOCOL']}://[${canary}`} as ProtocolRequest,
      value => (response = value),
    );
    assert.deepStrictEqual(response, {error: -10});
    safe();
  });
  it('[security-target][CAP-002][INV-010] reports cookie failure without logging the native error', async () => {
    const f = fixture();
    f.sso['session'] = f.session as unknown as Session;
    f.session.cookies = {
      get: async () => {
        throw new Error(canary);
      },
    };
    const responses: string[] = [];
    f.sso['dispatchResponse'] = async type => {
      responses.push(type);
    };
    await f.sso['finalizeLogin']('AUTH_SUCCESS');
    assert.deepStrictEqual(responses, ['AUTH_ERROR_COOKIE']);
    safe();
  });
});

describe('WindowUtil external-opening diagnostic confidentiality', () => {
  for (const synchronous of [false, true]) {
    it(`[security-target][CAP-002][INV-010] suppresses sensitive native ${
      synchronous ? 'throws' : 'rejections'
    }`, async () => {
      const messages: string[] = [];
      const originalTransports = logdown.transports.splice(0);
      logdown.transports.push((record: logdown.TransportOptions) => {
        messages.push([record.msg, ...record.args].map(String).join(' '));
      });
      const consoleError = stub(console, 'error');
      const opener = stub(shell, 'openExternal').callsFake(() => {
        const error = new Error(`https://identity.example.test/?code=${canary}`);
        if (synchronous) {
          throw error;
        }
        return Promise.reject(error);
      });
      try {
        await openExternal('https://identity.example.test/?code=synthetic', true);
        assert.strictEqual(opener.callCount, 1);
        assert.ok(messages.length > 0, 'Native failure must retain a diagnostic.');
        assert.ok(messages.every(message => !message.includes(canary) && message.length < 200));
      } finally {
        opener.restore();
        consoleError.restore();
        logdown.transports.splice(0, logdown.transports.length, ...originalTransports);
      }
    });
  }
});
