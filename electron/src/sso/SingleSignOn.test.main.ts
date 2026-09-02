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

import {BrowserWindow, Event as ElectronEvent, ProtocolRequest, Session, WebContents} from 'electron';
import {Maybe} from 'true-myth';

import * as assert from 'assert';
import {createServer} from 'http';
import {AddressInfo} from 'net';

import {SingleSignOn} from './SingleSignOn';

type ProtocolHandler = (request: ProtocolRequest) => void;

const createProtocolHarness = (alreadyRegistered = false) => {
  let handler: ProtocolHandler | undefined;
  let registeredScheme: string | undefined;
  let unregisterCount = 0;

  const protocol = {
    isProtocolRegistered: () => alreadyRegistered,
    registerStringProtocol: (scheme: string, requestHandler: ProtocolHandler) => {
      registeredScheme = scheme;
      handler = requestHandler;
      return true;
    },
    unregisterProtocol: () => {
      unregisterCount += 1;
      return true;
    },
  };

  const session = {protocol} as unknown as Session;
  return {
    getHandler: () => handler,
    getRegisteredScheme: () => registeredScheme,
    getUnregisterCount: () => unregisterCount,
    session,
  };
};

const request = (url: string) => ({url} as ProtocolRequest);

describe('SingleSignOn', () => {
  afterEach(() => {
    SingleSignOn.loginAuthorizationSecret = undefined;
  });

  describe('generateSecret', () => {
    it('[characterization][DCP-003] generates a secret of a specified size', async () => {
      const size = 24;
      const loginAuthorizationSecret = await SingleSignOn['generateSecret'](size);
      assert.strictEqual(loginAuthorizationSecret.length, size * 2);
      assert.match(loginAuthorizationSecret, /^[a-f0-9]+$/);
    });
  });

  describe('window identity and title', () => {
    it('[characterization][DCP-003] accepts only the dedicated SSO frame name', () => {
      assert.strictEqual(SingleSignOn.isSingleSignOnLoginWindow('WIRE_SSO'), true);
      assert.strictEqual(SingleSignOn.isSingleSignOnLoginWindow('wire_sso'), false);
      assert.strictEqual(SingleSignOn.isSingleSignOnLoginWindow('WIRE_SSO_CHILD'), false);
    });

    it('[characterization][DCP-003] hides approved backend origins and displays other origins', () => {
      assert.strictEqual(SingleSignOn.getWindowTitle('https://prod-nginz-https.wire.com'), '');
      assert.strictEqual(SingleSignOn.getWindowTitle('https://login.example.com'), 'https://login.example.com');
    });
  });

  describe('custom protocol', () => {
    const register = async (finalizeLogin: (type: string) => void = () => {}) => {
      const harness = createProtocolHarness();
      await SingleSignOn['registerProtocol'](harness.session, finalizeLogin);
      const secret = SingleSignOn.loginAuthorizationSecret;
      const handler = harness.getHandler();
      if (!secret || !handler) {
        throw new Error('SSO protocol registration did not create its handler and secret');
      }
      return {handler, harness, secret};
    };

    it('[characterization][DCP-003] registers the dedicated scheme with a fresh 192-bit secret', async () => {
      const {harness, secret} = await register();

      assert.strictEqual(harness.getRegisteredScheme(), 'wire-sso');
      assert.strictEqual(secret.length, 48);
      assert.match(secret, /^[a-f0-9]+$/);
    });

    it('[characterization][DCP-003] forwards a valid response to finalization', async () => {
      const finalized: string[] = [];
      const {handler, secret} = await register(type => finalized.push(type));

      handler(request(`wire-sso://response?secret=${secret}&type=AUTH_SUCCESS`));

      assert.deepStrictEqual(finalized, ['AUTH_SUCCESS']);
    });

    for (const invalidRequest of [
      {
        name: 'protocol',
        url: (secret: string) => `https://response?secret=${secret}&type=AUTH_SUCCESS`,
      },
      {
        name: 'host',
        url: (secret: string) => `wire-sso://attacker.example?secret=${secret}&type=AUTH_SUCCESS`,
      },
      {
        name: 'secret',
        url: () => 'wire-sso://response?secret=wrong&type=AUTH_SUCCESS',
      },
      {
        name: 'missing response type',
        url: (secret: string) => `wire-sso://response?secret=${secret}`,
      },
      {
        name: 'oversized response type',
        url: (secret: string) => `wire-sso://response?secret=${secret}&type=${'A'.repeat(256)}`,
      },
    ]) {
      it(`[characterization][DCP-003] rejects an invalid ${invalidRequest.name}`, async () => {
        const finalized: string[] = [];
        const {handler, secret} = await register(type => finalized.push(type));

        handler(request(invalidRequest.url(secret)));

        assert.deepStrictEqual(finalized, []);
      });
    }

    it('[characterization][DCP-003] rejects a response after its authorization secret is cleared', async () => {
      const finalized: string[] = [];
      const {handler, secret} = await register(type => finalized.push(type));
      SingleSignOn.loginAuthorizationSecret = undefined;

      handler(request(`wire-sso://response?secret=${secret}&type=AUTH_SUCCESS`));

      assert.deepStrictEqual(finalized, []);
    });

    it('[characterization][DCP-003] dispatches a non-success response without requiring an SSO session', async () => {
      const scripts: string[] = [];
      const sender = {
        executeJavaScript: async (script: string) => {
          scripts.push(script);
        },
        session: {} as Session,
      } as unknown as WebContents;
      const singleSignOn = new SingleSignOn(
        {} as BrowserWindow,
        sender,
        Maybe.nothing<string>(),
        'https://app.wire.com',
        {},
      );

      await singleSignOn['finalizeLogin']('AUTH_ERROR_COOKIE');

      assert.strictEqual(scripts.length, 1);
      assert.match(scripts[0], /data: \{type: 'AUTH_ERROR_COOKIE'\}/);
    });

    // eslint-disable-next-line jest/no-disabled-tests -- CAP-002 owns this known legacy security failure.
    it.skip('[security-target][INV-005][CAP-002] consumes the authorization secret after one response', async () => {
      const finalized: string[] = [];
      const {handler, secret} = await register(type => finalized.push(type));
      const response = request(`wire-sso://response?secret=${secret}&type=AUTH_SUCCESS`);

      handler(response);
      handler(response);

      assert.deepStrictEqual(finalized, ['AUTH_SUCCESS']);
    });

    // eslint-disable-next-line jest/no-disabled-tests -- CAP-002 owns this known legacy security failure.
    it.skip('[security-target][INV-005][CAP-002] rejects response types outside the explicit allowlist', async () => {
      const finalized: string[] = [];
      const {handler, secret} = await register(type => finalized.push(type));

      handler(request(`wire-sso://response?secret=${secret}&type=ATTACKER_CONTROLLED`));

      assert.deepStrictEqual(finalized, []);
    });
  });

  describe('cookie transfer', () => {
    it('[characterization][DCP-003] copies named SSO cookies with domains and flushes the target store', async () => {
      const setCookies: Electron.CookiesSetDetails[] = [];
      let requestedName: string | undefined;
      let flushCount = 0;
      const source = {
        cookies: {
          get: async ({name}: Electron.CookiesGetFilter) => {
            requestedName = name;
            return [
              {name: 'zuid', value: 'accepted', domain: '.wire.com', path: '/'},
              {name: 'zuid', value: 'ignored-without-domain', path: '/'},
            ];
          },
        },
      } as unknown as Session;
      const target = {
        cookies: {
          flushStore: async () => {
            flushCount += 1;
          },
          set: async (cookie: Electron.CookiesSetDetails) => {
            setCookies.push(cookie);
          },
        },
      } as unknown as Session;

      await SingleSignOn['copyCookies'](source, target, new URL('https://app.wire.com/login'));

      assert.strictEqual(requestedName, 'zuid');
      assert.deepStrictEqual(setCookies, [
        {url: 'https://app.wire.com/login', name: 'zuid', value: 'accepted', domain: '.wire.com', path: '/'},
      ]);
      assert.strictEqual(flushCount, 1);
    });

    // eslint-disable-next-line jest/no-disabled-tests -- CAP-002 owns this known legacy security failure.
    it.skip('[security-target][INV-004][CAP-002] rejects cookies outside the intended account origin', async () => {
      const copied: Electron.CookiesSetDetails[] = [];
      const source = {
        cookies: {
          get: async () => [{name: 'zuid', value: 'hostile', domain: '.attacker.example', path: '/'}],
        },
      } as unknown as Session;
      const target = {
        cookies: {
          flushStore: async () => {},
          set: async (cookie: Electron.CookiesSetDetails) => copied.push(cookie),
        },
      } as unknown as Session;

      await SingleSignOn['copyCookies'](source, target, new URL('https://app.wire.com'));

      assert.deepStrictEqual(copied, []);
    });
  });

  describe('login finalization errors', () => {
    const createFinalizationHarness = (sourceSession?: Session) => {
      const scripts: string[] = [];
      const sender = {
        executeJavaScript: async (script: string) => {
          scripts.push(script);
        },
        session: {cookies: {}} as Session,
      } as unknown as WebContents;
      const singleSignOn = new SingleSignOn(
        {} as BrowserWindow,
        sender,
        Maybe.nothing<string>(),
        'https://app.wire.com',
        {},
      );
      singleSignOn['session'] = sourceSession;
      return {scripts, singleSignOn};
    };

    it('[characterization][DCP-003] reports a missing ephemeral session instead of completing login', async () => {
      const {scripts, singleSignOn} = createFinalizationHarness();

      await singleSignOn['finalizeLogin']('AUTH_SUCCESS');

      assert.strictEqual(scripts.length, 1);
      assert.match(scripts[0], /data: \{type: 'AUTH_ERROR_SESS_NOT_AVAILABLE'\}/);
    });

    it('[characterization][DCP-003] reports a cookie transfer failure instead of completing login', async () => {
      const sourceSession = {
        cookies: {
          get: async () => {
            throw new Error('controlled cookie read failure');
          },
        },
      } as unknown as Session;
      const {scripts, singleSignOn} = createFinalizationHarness(sourceSession);

      await singleSignOn['finalizeLogin']('AUTH_SUCCESS');

      assert.strictEqual(scripts.length, 1);
      assert.match(scripts[0], /data: \{type: 'AUTH_ERROR_COOKIE'\}/);
    });
  });

  describe('window and session cleanup', () => {
    it('[characterization][DCP-003] clears the ephemeral session and unregisters the protocol on close or cancel', async () => {
      const windowListeners = new Map<string, () => Promise<void>>();
      let clearCount = 0;
      let closeCount = 0;
      const harness = createProtocolHarness();
      const ephemeralSession = {
        ...harness.session,
        clearStorageData: async () => {
          clearCount += 1;
        },
        protocol: harness.session.protocol,
      } as unknown as Session;
      const sender = {session: {} as Session} as WebContents;
      const ssoWindow = {
        on: () => ssoWindow,
        once: (event: string, listener: () => Promise<void>) => {
          windowListeners.set(event, listener);
          return ssoWindow;
        },
        setTitle: () => {},
        webContents: {
          on: () => ssoWindow.webContents,
          setWindowOpenHandler: () => {},
        },
      } as unknown as BrowserWindow;
      const windowOptions = {webPreferences: {preload: '/legacy/preload.js'}};
      const singleSignOn = new SingleSignOn(
        ssoWindow,
        sender,
        Maybe.nothing<string>(),
        'https://app.wire.com',
        windowOptions,
      );
      singleSignOn['session'] = ephemeralSession;
      singleSignOn.onClose = () => {
        closeCount += 1;
      };
      singleSignOn['setupBrowserWindow']();

      const closed = windowListeners.get('closed');
      assert.ok(closed);
      await closed();

      assert.strictEqual(clearCount, 1);
      assert.strictEqual(harness.getUnregisterCount(), 1);
      assert.strictEqual(closeCount, 1);
      assert.strictEqual(windowOptions.webPreferences.preload, undefined);
      assert.strictEqual(singleSignOn['session'], undefined);
      assert.strictEqual(singleSignOn['ssoWindow'], undefined);
    });

    it('[characterization][DCP-003] blocks navigation with an oversized origin', () => {
      let navigationHandler: ((event: ElectronEvent, url: string) => void) | undefined;
      let title = '';
      const sender = {session: {} as Session} as WebContents;
      const ssoWindow = {
        on: () => ssoWindow,
        once: () => ssoWindow,
        setTitle: (newTitle: string) => {
          title = newTitle;
        },
        webContents: {
          on: (event: string, listener: (event: ElectronEvent, url: string) => void) => {
            if (event === 'will-navigate') {
              navigationHandler = listener;
            }
            return ssoWindow.webContents;
          },
          setWindowOpenHandler: () => {},
        },
      } as unknown as BrowserWindow;
      const singleSignOn = new SingleSignOn(ssoWindow, sender, Maybe.nothing<string>(), 'https://app.wire.com', {});
      singleSignOn['setupBrowserWindow']();
      let preventCount = 0;
      const event = {
        preventDefault: () => {
          preventCount += 1;
        },
      } as ElectronEvent;
      const oversizedOrigin = `https://${Array.from({length: 5}, () => 'a'.repeat(60)).join('.')}`;

      assert.ok(navigationHandler);
      navigationHandler(event, oversizedOrigin);

      assert.strictEqual(preventCount, 1);
      assert.strictEqual(title, oversizedOrigin);
    });

    it('[characterization][DCP-003] completes a deterministic local SSO flow with permissions denied', async () => {
      let receivedUserAgent: string | undefined;
      const server = createServer((request, response) => {
        receivedUserAgent = request.headers['user-agent'];
        response.setHeader('Content-Type', 'text/html');
        response.setHeader('Set-Cookie', 'zuid=fixture-value; Path=/; SameSite=Lax');
        response.end('<!doctype html><title>Controlled SSO fixture</title>');
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const {port} = server.address() as AddressInfo;
      const fixtureUrl = `http://127.0.0.1:${port}/login`;
      const senderWindow = new BrowserWindow({
        show: false,
        webPreferences: {partition: `sso-target-${Date.now()}`},
      });
      const ssoWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'sso',
          sandbox: true,
        },
      });
      const singleSignOn = new SingleSignOn(ssoWindow, senderWindow.webContents, Maybe.nothing<string>(), fixtureUrl, {
        webPreferences: {partition: 'sso'},
      });

      try {
        await senderWindow.loadURL(
          "data:text/html,<script>window.ssoResponses=[];window.addEventListener('message',event=>window.ssoResponses.push(event.data.type))</script>",
        );
        await singleSignOn.init();

        assert.strictEqual(
          receivedUserAgent,
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
        );
        const sourceCookies = await ssoWindow.webContents.session.cookies.get({name: 'zuid'});
        assert.strictEqual(
          sourceCookies.some(cookie => cookie.value === 'fixture-value'),
          true,
        );

        await singleSignOn['finalizeLogin']('AUTH_SUCCESS');

        const targetCookies = await senderWindow.webContents.session.cookies.get({name: 'zuid', url: fixtureUrl});
        assert.strictEqual(
          targetCookies.some(cookie => cookie.value === 'fixture-value'),
          true,
        );
        const responses = await senderWindow.webContents.executeJavaScript('window.ssoResponses');
        assert.deepStrictEqual(responses, ['AUTH_SUCCESS']);

        const permissionResult = await ssoWindow.webContents.executeJavaScript(
          "navigator.mediaDevices.getUserMedia({audio:true}).then(()=> 'granted',()=> 'denied')",
        );
        assert.strictEqual(permissionResult, 'denied');
      } finally {
        if (!ssoWindow.isDestroyed()) {
          const ephemeralSession = ssoWindow.webContents.session;
          const closed = new Promise<void>(resolve => {
            singleSignOn.onClose = resolve;
          });
          ssoWindow.destroy();
          await closed;
          assert.strictEqual(ephemeralSession.protocol.isProtocolRegistered('wire-sso'), false);
        }
        if (!senderWindow.isDestroyed()) {
          senderWindow.destroy();
        }
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      }
    });
  });
});
