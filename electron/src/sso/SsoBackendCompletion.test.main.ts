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

import {BrowserWindow, session} from 'electron';
import {Maybe} from 'true-myth';

import * as assert from 'assert';
import {createServer} from 'http';
import {AddressInfo} from 'net';

import {SingleSignOn} from './SingleSignOn';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('SingleSignOn backend verdict compatibility [CAP-002][DCP-003]', function () {
  this.timeout(10_000);

  for (const native of [false, true]) {
    for (const outcome of ['AUTH_SUCCESS', 'AUTH_ERROR']) {
      it(`[${native ? 'security-target' : 'characterization'}] delivers ${outcome} through ${
        native ? 'isolated native' : 'legacy opener'
      } completion`, async () => {
        const server = createServer((request, response) => {
          const url = new URL(request.url!, 'http://fixture');
          response.setHeader('Content-Type', 'text/html');
          if (url.pathname === '/account') {
            response.end(`<!doctype html><script>
              window.responses=[];
              addEventListener('message', event => window.responses.push({origin:event.origin,...event.data}));
            </script>`);
          } else if (url.pathname === '/verdict') {
            if (outcome === 'AUTH_SUCCESS') {
              response.setHeader('Set-Cookie', 'zuid=backend-verdict; Path=/; SameSite=Lax');
            }
            const redirect = url.searchParams.get(outcome === 'AUTH_SUCCESS' ? 'success_redirect' : 'error_redirect');
            if (redirect) {
              response.writeHead(303, {
                Location: redirect.replaceAll('$label', 'forbidden').replaceAll('%24label', 'forbidden'),
              });
              response.end();
            } else {
              // Spar's web verdict needs the opener; native verdicts use the supplied redirect URLs.
              response.end(
                `<!doctype html><script>window.opener.postMessage(${JSON.stringify({
                  type: outcome,
                  ...(outcome === 'AUTH_ERROR' ? {payload: {label: 'forbidden'}} : {}),
                })}, '*')</script>`,
              );
            }
          } else {
            response.end(
              '<!doctype html><button onclick="location.href=\'/verdict\'+location.search">Complete SSO</button>',
            );
          }
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const parent = new BrowserWindow({
          show: false,
          webPreferences: {
            partition: `account-${Date.now()}`,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        const otherAccount = session.fromPartition(`other-account-${Date.now()}`);
        await otherAccount.cookies.set({url: origin, name: 'zuid', value: 'other-account'});
        let child: BrowserWindow | undefined;
        let sso: SingleSignOn | undefined;
        try {
          await parent.loadURL(`${origin}/account`);
          const loginUrl = `${origin}/sso/initiate-login/11111111-1111-4111-8111-111111111111`;
          if (native) {
            sso = SingleSignOn.create(
              parent,
              parent.webContents,
              Maybe.just('account-a'),
              loginUrl,
              new ViewIdentityRegistry(),
            );
            child = sso['ssoWindow'];
            await sso.init();
          } else {
            parent.webContents.setWindowOpenHandler(() => ({
              action: 'allow',
              overrideBrowserWindowOptions: {show: false},
            }));
            const created = new Promise<BrowserWindow>(resolve =>
              parent.webContents.once('did-create-window', resolve),
            );
            await parent.webContents.executeJavaScript(
              `window.open(${JSON.stringify(loginUrl)}, 'WIRE_SSO'); undefined`,
            );
            child = await created;
            if (child.webContents.isLoading()) {
              await new Promise<void>(resolve => child!.webContents.once('did-finish-load', () => resolve()));
            }
          }
          assert.ok(child);
          assert.strictEqual(await child.webContents.executeJavaScript('window.opener === null'), native);
          assert.strictEqual(child.webContents.session === parent.webContents.session, !native);
          if (native) {
            const callbackParameters = new URL(child.webContents.getURL()).searchParams;
            for (const name of ['success_redirect', 'error_redirect']) {
              const value = callbackParameters.get(name);
              assert.ok(value);
              assert.ok(value.startsWith('wire-sso://response?'));
              assert.ok(value.length <= 140, 'Spar limits each redirect URL to 140 bytes');
            }
          }
          await child.webContents.executeJavaScript("document.querySelector('button').click(); undefined");
          const responses = await parent.webContents.executeJavaScript(`new Promise(resolve => {
            const deadline=Date.now()+1500;
            const poll=()=>window.responses.length || Date.now()>deadline
              ? resolve(window.responses) : setTimeout(poll,10);
            poll();
          })`);
          assert.deepStrictEqual(responses, [
            {origin, type: outcome, ...(outcome === 'AUTH_ERROR' ? {payload: {label: 'forbidden'}} : {})},
          ]);
          const cookies = await parent.webContents.session.cookies.get({url: origin, name: 'zuid'});
          assert.deepStrictEqual(
            cookies.map(cookie => cookie.value),
            outcome === 'AUTH_SUCCESS' ? ['backend-verdict'] : [],
          );
          assert.deepStrictEqual(
            (await otherAccount.cookies.get({url: origin, name: 'zuid'})).map(cookie => cookie.value),
            ['other-account'],
          );
        } finally {
          if (child && !child.isDestroyed()) {
            const cleaned = sso
              ? new Promise<void>(resolve => {
                  sso!.onClose = resolve;
                })
              : Promise.resolve();
            const ephemeralSession = child.webContents.session;
            child.destroy();
            await cleaned;
            if (native) {
              assert.deepStrictEqual(await ephemeralSession.cookies.get({}), []);
              assert.strictEqual(ephemeralSession.protocol.isProtocolRegistered('wire-sso'), false);
            }
          }
          parent.destroy();
          await new Promise<void>(resolve => server.close(() => resolve()));
        }
      });
    }
  }
});
