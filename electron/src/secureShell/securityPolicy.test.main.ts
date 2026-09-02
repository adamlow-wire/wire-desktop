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

import {SECURE_SHELL_CONTRACT_VERSION, SECURE_SHELL_RUNTIME_INFO_CAPABILITY} from './constants';
import {authorizeRuntimeInfoRequest} from './ipc';
import {
  createSecureAccountPartition,
  isAllowedAccountNavigation,
  isRuntimeInfoRequest,
  parseSecureAccountUrl,
} from './policy';
import {CONTENT_SECURITY_POLICY, createSecureShellResponse} from './protocol';

import {
  LifecycleWebContentsIdentity,
  registerViewIdentity,
  SenderIdentity,
  ViewIdentityRegistry,
} from '../security/ViewIdentityRegistry';

const createSender = (id: number, url = 'https://app.wire.test/account', session = {}) => {
  const frame = {url};
  let destroyed = false;
  const webContents = {
    id,
    mainFrame: frame,
    session,
    isDestroyed: () => destroyed,
  };
  return {
    destroy: () => {
      destroyed = true;
    },
    event: {sender: webContents, senderFrame: frame} as SenderIdentity,
    frame,
    webContents,
  };
};

describe('secure shell policy', () => {
  it('[security-target][INV-005][ARC-002] accepts only the exact account origin', () => {
    assert.strictEqual(isAllowedAccountNavigation('https://app.wire.test/path', 'https://app.wire.test'), true);
    assert.strictEqual(isAllowedAccountNavigation('https://app.wire.test.evil/path', 'https://app.wire.test'), false);
    assert.strictEqual(isAllowedAccountNavigation('javascript:alert(1)', 'https://app.wire.test'), false);
    assert.strictEqual(isAllowedAccountNavigation('not a URL', 'https://app.wire.test'), false);
  });

  it('[security-target][INV-005][ARC-002] rejects unsafe account URL configuration', () => {
    assert.strictEqual(parseSecureAccountUrl('https://app.wire.test/path').origin, 'https://app.wire.test');
    assert.throws(() => parseSecureAccountUrl('http://app.wire.test'));
    assert.throws(() => parseSecureAccountUrl('file:///tmp/wire.html'));
    assert.throws(() => parseSecureAccountUrl('https://user:secret@app.wire.test'));
  });

  it('[security-target][INV-003][ARC-002] validates the complete fixed IPC payload', () => {
    assert.strictEqual(isRuntimeInfoRequest({contractVersion: SECURE_SHELL_CONTRACT_VERSION}), true);
    assert.strictEqual(isRuntimeInfoRequest({contractVersion: 2}), false);
    assert.strictEqual(isRuntimeInfoRequest({contractVersion: 1, channel: 'arbitrary'}), false);
    assert.strictEqual(isRuntimeInfoRequest(null), false);
  });

  it('[security-target][INV-004][ARC-002] derives stable non-identifying isolated partitions', () => {
    const first = createSecureAccountPartition('account-a');
    assert.strictEqual(first, createSecureAccountPartition('account-a'));
    assert.notStrictEqual(first, createSecureAccountPartition('account-b'));
    assert.match(first, /^persist:wire-secure-[a-f0-9]{64}$/);
    assert.doesNotMatch(first, /account-a/);
  });

  it('[security-target][INV-008][ARC-002] uses a deny-by-default production CSP', () => {
    assert.match(CONTENT_SECURITY_POLICY, /default-src 'none'/);
    assert.match(CONTENT_SECURITY_POLICY, /script-src 'none'/);
    assert.match(CONTENT_SECURITY_POLICY, /connect-src 'none'/);
    assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|unsafe-inline/);
  });

  it('[security-target][INV-005][INV-008][ARC-002] serves only the fixed local shell resources', async () => {
    for (const path of ['/', '/index.html']) {
      const response = createSecureShellResponse(`wire-app://shell${path}`);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
      assert.match(await response.text(), /Wire secure shell proof/);
    }

    assert.strictEqual(createSecureShellResponse('wire-app://shell/missing').status, 404);
    assert.strictEqual(createSecureShellResponse('wire-app://attacker/index.html').status, 404);
    assert.strictEqual(createSecureShellResponse('wire-app://user:secret@shell/index.html').status, 404);
    assert.strictEqual(createSecureShellResponse('wire-app://shell:444/index.html').status, 404);
  });
});

describe('secure shell view authority', () => {
  it('[security-target][INV-003][SEC-002] revokes registered view authority on owner disposal and process loss', () => {
    for (const eventName of ['destroyed', 'render-process-gone'] as const) {
      const registry = new ViewIdentityRegistry();
      const listeners = new Map<string, () => void>();
      const session = {};
      const webContents: LifecycleWebContentsIdentity = {
        id: eventName === 'destroyed' ? 33 : 34,
        isDestroyed: () => false,
        mainFrame: {url: 'https://app.wire.test/account'},
        once(event, listener) {
          listeners.set(event, listener);
          return this;
        },
        session,
      };
      const registered = registerViewIdentity(registry, {
        accountId: 'account-a',
        allowedOrigin: 'https://app.wire.test',
        capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
        partition: 'persist:wire-secure-a',
        session,
        viewType: 'account',
        webContents,
      });

      assert.strictEqual(registry.has(webContents.id), true);
      assert.strictEqual(Object.isFrozen(registered), true);
      listeners.get(eventName)?.();
      assert.strictEqual(registry.has(webContents.id), false);

      registered.revoke();
      assert.strictEqual(registry.has(webContents.id), false);
    }
  });

  it('[security-target][INV-003][INV-004][SEC-002] binds immutable view type and exact session identity', () => {
    const registry = new ViewIdentityRegistry();
    const session = {};
    const registered = createSender(38, 'https://app.wire.test/account', session);
    const registration = {
      accountId: 'account-a',
      allowedOrigin: 'https://app.wire.test',
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: 'persist:wire-secure-a',
      session,
      viewType: 'account' as const,
      webContents: registered.webContents,
    };
    const identity = registry.register(registration);

    assert.strictEqual(identity.viewType, 'account');
    assert.strictEqual(identity.session, session);

    registered.webContents.session = {};
    assert.throws(() => registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY));

    const mismatched = createSender(37);
    assert.throws(() => registry.register({...registration, session: {}, webContents: mismatched.webContents}));
    const missingAccount = createSender(36);
    assert.throws(() =>
      registry.register({
        ...registration,
        accountId: undefined,
        session: missingAccount.webContents.session,
        webContents: missingAccount.webContents,
      }),
    );
    const ssoWithAccount = createSender(35);
    assert.throws(() =>
      registry.register({
        ...registration,
        session: ssoWithAccount.webContents.session,
        viewType: 'sso',
        webContents: ssoWithAccount.webContents,
      }),
    );
  });

  it('[security-target][INV-003][SEC-002] rejects destroyed, duplicate, and same-id replacement contents', () => {
    const registry = new ViewIdentityRegistry();
    const registered = createSender(40);
    const capabilities = [SECURE_SHELL_RUNTIME_INFO_CAPABILITY];
    const identity = registry.register({
      accountId: 'account-a',
      allowedOrigin: 'https://app.wire.test',
      capabilities,
      partition: 'persist:wire-secure-a',
      session: registered.webContents.session,
      viewType: 'account',
      webContents: registered.webContents,
    });

    capabilities.length = 0;
    assert.strictEqual(Object.isFrozen(identity), true);
    assert.strictEqual(Object.isFrozen(identity.capabilities), true);
    assert.deepStrictEqual(identity.capabilities, [SECURE_SHELL_RUNTIME_INFO_CAPABILITY]);
    assert.throws(() =>
      registry.register({
        accountId: 'account-b',
        allowedOrigin: 'https://app.wire.test',
        capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
        partition: 'persist:wire-secure-b',
        session: registered.webContents.session,
        viewType: 'account',
        webContents: registered.webContents,
      }),
    );

    const replacement = createSender(40);
    assert.throws(() =>
      registry.authorize(
        {sender: replacement.webContents, senderFrame: registered.frame},
        SECURE_SHELL_RUNTIME_INFO_CAPABILITY,
      ),
    );

    const destroyed = createSender(39);
    destroyed.destroy();
    assert.throws(() =>
      registry.register({
        accountId: 'account-c',
        allowedOrigin: 'https://app.wire.test',
        capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
        partition: 'persist:wire-secure-c',
        session: destroyed.webContents.session,
        viewType: 'account',
        webContents: destroyed.webContents,
      }),
    );
  });

  it('[security-target][INV-003][ARC-002] authorizes only the registered main frame, origin, and capability', () => {
    const registry = new ViewIdentityRegistry();
    const registered = createSender(41);
    registry.register({
      accountId: 'account-a',
      allowedOrigin: 'https://app.wire.test',
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: 'persist:wire-secure-a',
      session: registered.webContents.session,
      viewType: 'account',
      webContents: registered.webContents,
    });

    assert.strictEqual(
      registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY).accountId,
      'account-a',
    );
    assert.throws(() => registry.authorize(createSender(42).event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY));
    assert.throws(() =>
      registry.authorize(
        {...registered.event, senderFrame: {url: 'https://app.wire.test/frame'}},
        SECURE_SHELL_RUNTIME_INFO_CAPABILITY,
      ),
    );
    registered.frame.url = 'https://attacker.invalid/';
    assert.throws(() => registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY));
  });

  it('[security-target][INV-003][SEC-002] binds opaque local content to its exact URL', () => {
    const registry = new ViewIdentityRegistry();
    const aboutUrl = 'file:///opt/wire/electron/html/about.html';
    const registered = createSender(46, aboutUrl);
    registry.register({
      allowedOrigin: 'null',
      allowedUrl: aboutUrl,
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: 'about-window',
      session: registered.webContents.session,
      viewType: 'about',
      webContents: registered.webContents,
    });

    assert.strictEqual(registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY).viewType, 'about');
    registered.frame.url = 'file:///tmp/attacker.html';
    assert.throws(() => registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY));

    const mismatched = createSender(47, aboutUrl);
    assert.throws(() =>
      registry.register({
        allowedOrigin: 'https://app.wire.test',
        allowedUrl: aboutUrl,
        capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
        partition: 'about-window',
        session: mismatched.webContents.session,
        viewType: 'about',
        webContents: mismatched.webContents,
      }),
    );
  });

  it('[security-target][INV-003][INV-010][ARC-002] removes destroyed and explicitly revoked authority', () => {
    const registry = new ViewIdentityRegistry();
    const registered = createSender(43);
    registry.register({
      accountId: 'account-a',
      allowedOrigin: 'https://app.wire.test',
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: 'persist:wire-secure-a',
      session: registered.webContents.session,
      viewType: 'account',
      webContents: registered.webContents,
    });

    registered.destroy();
    assert.throws(() => registry.authorize(registered.event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY));
    registry.unregister(registered.webContents.id);
    assert.strictEqual(registry.has(registered.webContents.id), false);
  });

  it('[security-target][INV-003][ARC-002] authorizes before validating payload and returns an immutable contract', () => {
    const registry = new ViewIdentityRegistry();
    const registered = createSender(44);
    registry.register({
      accountId: 'account-a',
      allowedOrigin: 'https://app.wire.test',
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: 'persist:wire-secure-a',
      session: registered.webContents.session,
      viewType: 'account',
      webContents: registered.webContents,
    });

    const response = authorizeRuntimeInfoRequest(registry, registered.event, {contractVersion: 1});
    assert.deepStrictEqual(response, {accountId: 'account-a', contractVersion: 1});
    assert.strictEqual(Object.isFrozen(response), true);
    assert.throws(() => authorizeRuntimeInfoRequest(registry, registered.event, {contractVersion: 2}));
    assert.throws(() => authorizeRuntimeInfoRequest(registry, createSender(45).event, {contractVersion: 1}));
  });
});
