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

import {strict as assert} from 'assert';

import {
  bindProxyPromptIpc,
  cancelProxyPrompt,
  createProxyPromptBoundary,
  MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_LOCALE_LABELS,
  MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_PASSWORD_LENGTH,
  MAX_PROXY_PROMPT_USERNAME_LENGTH,
  PROXY_PROMPT_CANCEL_CAPABILITY,
  PROXY_PROMPT_CANCEL_CHANNEL,
  PROXY_PROMPT_LOCALE_READ_CAPABILITY,
  PROXY_PROMPT_LOCALE_READ_CHANNEL,
  PROXY_PROMPT_SUBMIT_CAPABILITY,
  PROXY_PROMPT_SUBMIT_CHANNEL,
  ProxyPromptCredentials,
  requestProxyPromptLocaleValues,
  submitProxyPrompt,
} from './ProxyPromptIpc';
import {SenderIdentity, ViewIdentityRegistry, ViewType} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (
  registry: ViewIdentityRegistry,
  viewType: ViewType,
  capabilities: readonly string[],
  id: number,
): SenderIdentity => {
  const isPrompt = viewType === 'proxy-prompt';
  const url = isPrompt ? 'file:///opt/wire/proxy-prompt.html' : 'https://app.wire.test/account';
  const frame = {url};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    ...(isPrompt ? {} : {accountId: 'account-a'}),
    allowedOrigin: new URL(url).origin,
    allowedUrl: isPrompt ? url : undefined,
    capabilities,
    partition: isPrompt ? 'proxy-prompt-window' : 'persist:account-a',
    session,
    viewType,
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => handlers.set(channel, handler),
  removeHandler: (channel: string) => void handlers.delete(channel),
});

const localeResponse = {proxyPromptTitle: 'Proxy authentication', proxyPromptUsername: 'Username'};

describe('proxy prompt IPC contracts', () => {
  it('[security-target][INV-002][INV-003][SEC-003] invokes only fixed channels and exact requests', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];
    const ipc = {
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        return args[0] === PROXY_PROMPT_LOCALE_READ_CHANNEL ? localeResponse : undefined;
      },
    };
    const logger = {error: (...args: unknown[]) => errors.push(args)};

    assert.deepStrictEqual(
      await requestProxyPromptLocaleValues(ipc, ['proxyPromptTitle', 'proxyPromptUsername'], logger),
      localeResponse,
    );
    assert.strictEqual(await submitProxyPrompt(ipc, {password: 'secret', username: 'proxy-user'}, logger), true);
    assert.strictEqual(await cancelProxyPrompt(ipc, logger), true);

    assert.deepStrictEqual(calls, [
      [PROXY_PROMPT_LOCALE_READ_CHANNEL, {labels: ['proxyPromptTitle', 'proxyPromptUsername']}],
      [PROXY_PROMPT_SUBMIT_CHANNEL, {password: 'secret', username: 'proxy-user'}],
      [PROXY_PROMPT_CANCEL_CHANNEL, undefined],
    ]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003] contains rejected and malformed renderer responses', async () => {
    const errors: unknown[][] = [];
    const logger = {error: (...args: unknown[]) => errors.push(args)};
    assert.strictEqual(
      await requestProxyPromptLocaleValues(
        {invoke: async () => ({...localeResponse, unexpected: 'value'})},
        ['proxyPromptTitle', 'proxyPromptUsername'],
        logger,
      ),
      undefined,
    );
    assert.strictEqual(
      await submitProxyPrompt({invoke: async () => 'unexpected'}, {password: '', username: ''}, logger),
      false,
    );
    assert.strictEqual(
      await cancelProxyPrompt({invoke: async () => Promise.reject(new Error('denied'))}, logger),
      false,
    );
    assert.strictEqual(errors.length, 3);
  });

  it('[characterization][security-target][INV-003][SEC-003][CAP-005] preserves locale, credential, and cancel effects', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(
      registry,
      'proxy-prompt',
      [PROXY_PROMPT_LOCALE_READ_CAPABILITY, PROXY_PROMPT_SUBMIT_CAPABILITY, PROXY_PROMPT_CANCEL_CAPABILITY],
      101,
    );
    const submissions: Array<{credentials: ProxyPromptCredentials; webContentsId: number}> = [];
    const cancellations: number[] = [];
    const dispose = bindProxyPromptIpc(createIpc(handlers), registry, {
      cancel: id => void cancellations.push(id),
      readLocaleValues: labels =>
        Object.fromEntries(labels.map(label => [label, localeResponse[label as keyof typeof localeResponse]])),
      submit: (id, credentials) => void submissions.push({credentials, webContentsId: id}),
    });

    assert.deepStrictEqual(
      await handlers.get(PROXY_PROMPT_LOCALE_READ_CHANNEL)?.(event, {labels: ['proxyPromptTitle']}),
      {proxyPromptTitle: 'Proxy authentication'},
    );
    assert.strictEqual(
      await handlers.get(PROXY_PROMPT_SUBMIT_CHANNEL)?.(event, {password: 'secret', username: 'proxy-user'}),
      undefined,
    );
    assert.strictEqual(await handlers.get(PROXY_PROMPT_CANCEL_CHANNEL)?.(event, undefined), undefined);
    assert.deepStrictEqual(submissions, [
      {credentials: {password: 'secret', username: 'proxy-user'}, webContentsId: 101},
    ]);
    assert.deepStrictEqual(cancellations, [101]);
    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[characterization][security-target][INV-003][SEC-003] maps the coordinator and locale boundaries exactly', async () => {
    const calls: unknown[][] = [];
    const boundary = createProxyPromptBoundary(
      {
        cancel: async id => void calls.push(['cancel', id]),
        submit: async (id, credentials) => void calls.push(['submit', id, credentials]),
      },
      label => `translated:${label}`,
    );

    assert.deepStrictEqual(boundary.readLocaleValues(['proxyPromptTitle']), {
      proxyPromptTitle: 'translated:proxyPromptTitle',
    });
    await boundary.submit(101, {password: 'secret', username: 'proxy-user'});
    await boundary.cancel(101);
    assert.deepStrictEqual(calls, [
      ['submit', 101, {password: 'secret', username: 'proxy-user'}],
      ['cancel', 101],
    ]);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects wrong views and malformed values before side effects', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const capabilities = [
      PROXY_PROMPT_LOCALE_READ_CAPABILITY,
      PROXY_PROMPT_SUBMIT_CAPABILITY,
      PROXY_PROMPT_CANCEL_CAPABILITY,
    ];
    const prompt = createSender(registry, 'proxy-prompt', capabilities, 101);
    const account = createSender(registry, 'account', capabilities, 102);
    let sideEffects = 0;
    bindProxyPromptIpc(createIpc(handlers), registry, {
      cancel: () => void (sideEffects += 1),
      readLocaleValues: () => {
        sideEffects += 1;
        return {};
      },
      submit: () => void (sideEffects += 1),
    });
    const locale = handlers.get(PROXY_PROMPT_LOCALE_READ_CHANNEL);
    const submit = handlers.get(PROXY_PROMPT_SUBMIT_CHANNEL);
    const cancel = handlers.get(PROXY_PROMPT_CANCEL_CHANNEL);
    assert.ok(locale);
    assert.ok(submit);
    assert.ok(cancel);

    await assert.rejects(() => submit(account, {password: '', username: ''}), /view type/);
    for (const request of [
      null,
      {labels: ['duplicate', 'duplicate']},
      {labels: Array.from({length: MAX_PROXY_PROMPT_LOCALE_LABELS + 1}, (_, index) => `label${index}`)},
      {labels: ['../secret']},
      {labels: [], extra: true},
    ]) {
      await assert.rejects(() => locale(prompt, request), /payload/);
    }
    for (const request of [
      null,
      {},
      {password: '', username: 'x'.repeat(MAX_PROXY_PROMPT_USERNAME_LENGTH + 1)},
      {password: 'x'.repeat(MAX_PROXY_PROMPT_PASSWORD_LENGTH + 1), username: ''},
      {password: '', username: '', extra: true},
    ]) {
      await assert.rejects(() => submit(prompt, request), /payload/);
    }
    await assert.rejects(() => cancel(prompt, {}), /payload/);
    assert.strictEqual(sideEffects, 0);
  });

  for (const [channel, capability, maximum, request] of [
    [
      PROXY_PROMPT_LOCALE_READ_CHANNEL,
      PROXY_PROMPT_LOCALE_READ_CAPABILITY,
      MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE,
      {labels: []},
    ],
    [
      PROXY_PROMPT_SUBMIT_CHANNEL,
      PROXY_PROMPT_SUBMIT_CAPABILITY,
      MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE,
      {password: '', username: ''},
    ],
    [
      PROXY_PROMPT_CANCEL_CHANNEL,
      PROXY_PROMPT_CANCEL_CAPABILITY,
      MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE,
      undefined,
    ],
  ] as const) {
    it(`[security-target][INV-003][INV-010][SEC-003] rate-limits ${channel}`, async () => {
      const handlers = new Map<string, BoundHandler>();
      const registry = new ViewIdentityRegistry();
      const event = createSender(registry, 'proxy-prompt', [capability], 101);
      let sideEffects = 0;
      bindProxyPromptIpc(createIpc(handlers), registry, {
        cancel: () => void (sideEffects += 1),
        readLocaleValues: () => {
          sideEffects += 1;
          return {};
        },
        submit: () => void (sideEffects += 1),
      });
      const handler = handlers.get(channel);
      assert.ok(handler);
      for (let count = 0; count < maximum; count += 1) {
        await handler(event, request);
      }
      await assert.rejects(() => handler(event, request), /rate limit/);
      assert.strictEqual(sideEffects, maximum);
    });
  }
});
