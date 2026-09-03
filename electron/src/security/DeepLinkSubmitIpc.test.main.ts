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
  bindDeepLinkSubmitIpc,
  DEEP_LINK_SUBMIT_CAPABILITY,
  DEEP_LINK_SUBMIT_CHANNEL,
  MAX_DEEP_LINK_LENGTH,
  MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE,
  requestDeepLinkSubmission,
} from './DeepLinkSubmitIpc';
import {registerApplicationShellIdentity, SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 151): SenderIdentity => {
  const frame = {url: 'file:///opt/wire/electron/renderer/index.html'};
  const session = {};
  const webContents = {
    id,
    isDestroyed: () => false,
    mainFrame: frame,
    once: () => webContents,
    session,
  };
  registerApplicationShellIdentity(registry, webContents, frame.url, [DEEP_LINK_SUBMIT_CAPABILITY]);
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => {
    handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },
});

describe('deep-link submission IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][CAP-006] invokes only the fixed channel with the exact URL', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];
    const url = 'wire://conversation/example';

    await requestDeepLinkSubmission(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      },
      {error: (...args: unknown[]) => errors.push(args)},
      url,
    );

    assert.deepStrictEqual(calls, [[DEEP_LINK_SUBMIT_CHANNEL, {url}]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][CAP-006] reports rejected submissions', async () => {
    const controlledFailure = new Error('controlled deep-link failure');
    const errors: unknown[][] = [];

    await requestDeepLinkSubmission(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
      'wire://conversation/example',
    );

    assert.deepStrictEqual(errors, [['Failed to submit the deep link.', controlledFailure]]);
  });

  it('[characterization][security-target][INV-003][SEC-003][SEC-013][CAP-006] preserves the submitted URL', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const submissions: string[] = [];
    const dispose = bindDeepLinkSubmitIpc(createIpc(handlers), registry, async url => {
      submissions.push(url);
    });
    const handler = handlers.get(DEEP_LINK_SUBMIT_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, {url: 'wire://conversation/example'}), undefined);
    assert.deepStrictEqual(submissions, ['wire://conversation/example']);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][CAP-006] rejects unauthorized and malformed submissions', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let submissionCalls = 0;
    bindDeepLinkSubmitIpc(createIpc(handlers), registry, async () => {
      submissionCalls += 1;
    });
    const handler = handlers.get(DEEP_LINK_SUBMIT_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 152}};
    await assert.rejects(() => handler(unknownEvent, {url: 'wire://conversation/example'}), /not authorized/);
    for (const request of [
      undefined,
      'wire://conversation/example',
      {},
      {url: ''},
      {url: 1},
      {url: 'wire://conversation/example', extra: true},
      {url: 'w'.repeat(MAX_DEEP_LINK_LENGTH + 1)},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(submissionCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][CAP-006] limits submissions per application shell', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let submissionCalls = 0;
    bindDeepLinkSubmitIpc(createIpc(handlers), registry, async () => {
      submissionCalls += 1;
    });
    const handler = handlers.get(DEEP_LINK_SUBMIT_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE; request += 1) {
      await handler(event, {url: `wire://conversation/${request}`});
    }
    await assert.rejects(() => handler(event, {url: 'wire://conversation/blocked'}), /rate limit/);
    assert.strictEqual(submissionCalls, MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE);
  });
});
