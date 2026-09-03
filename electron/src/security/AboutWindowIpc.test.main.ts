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
  ABOUT_LOCALE_READ_CAPABILITY,
  ABOUT_LOCALE_READ_CHANNEL,
  bindAboutWindowIpc,
  MAX_ABOUT_LOCALE_LABELS,
  MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_WEBAPP_VERSION_LENGTH,
  MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE,
  reportWebappVersions,
  requestAboutLocaleValues,
  WEBAPP_VERSIONS_REPORT_CAPABILITY,
  WEBAPP_VERSIONS_REPORT_CHANNEL,
  WebappVersions,
} from './AboutWindowIpc';
import {SenderIdentity, ViewIdentityRegistry, ViewType} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (
  registry: ViewIdentityRegistry,
  viewType: ViewType,
  capabilities: readonly string[],
  id: number,
): SenderIdentity => {
  const isAbout = viewType === 'about';
  const url = isAbout ? 'file:///opt/wire/about.html' : 'https://app.wire.test/account';
  const frame = {url};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    ...(isAbout ? {allowedUrl: url} : {accountId: 'account-a'}),
    allowedOrigin: new URL(url).origin,
    capabilities,
    partition: isAbout ? 'about-window' : 'persist:account-a',
    session,
    viewType,
    webContents,
  });
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

const localeResponse = {
  aboutReleases: 'Releases',
  aboutReleasesUrl: 'https://example.test/releases',
  aboutUpdatesUrl: 'https://example.test/updates',
};

describe('About window IPC contracts', () => {
  it('[security-target][INV-002][INV-003][SEC-003] invokes only fixed channels and exact requests', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];
    const ipc = {
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        return args[0] === ABOUT_LOCALE_READ_CHANNEL ? localeResponse : undefined;
      },
    };
    const logger = {error: (...args: unknown[]) => errors.push(args)};

    assert.deepStrictEqual(await requestAboutLocaleValues(ipc, ['aboutReleases'], logger), localeResponse);
    await reportWebappVersions(ipc, {webappVersion: 'webapp-1', webappAVSVersion: 'avs-1'}, logger);

    assert.deepStrictEqual(calls, [
      [ABOUT_LOCALE_READ_CHANNEL, {labels: ['aboutReleases']}],
      [WEBAPP_VERSIONS_REPORT_CHANNEL, {webappVersion: 'webapp-1', webappAVSVersion: 'avs-1'}],
    ]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003] contains rejected and malformed renderer responses', async () => {
    const controlledFailure = new Error('controlled locale failure');
    const errors: unknown[][] = [];
    const logger = {error: (...args: unknown[]) => errors.push(args)};

    assert.strictEqual(
      await requestAboutLocaleValues({invoke: async () => ({...localeResponse, unexpected: 'value'})}, [], logger),
      undefined,
    );
    await reportWebappVersions({invoke: async () => 'unexpected'}, {webappVersion: 'v1'}, logger);
    await reportWebappVersions({invoke: async () => Promise.reject(controlledFailure)}, {webappVersion: 'v1'}, logger);

    assert.strictEqual(errors.length, 3);
    assert.match(String(errors[0][1]), /response payload/);
    assert.match(String(errors[1][1]), /response payload/);
    assert.deepStrictEqual(errors[2], ['Failed to report webapp versions.', controlledFailure]);
  });

  it('[characterization][security-target][INV-003][SEC-003] preserves locale and version values', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const aboutEvent = createSender(registry, 'about', [ABOUT_LOCALE_READ_CAPABILITY], 101);
    const accountEvent = createSender(registry, 'account', [WEBAPP_VERSIONS_REPORT_CAPABILITY], 102);
    const reported: WebappVersions[] = [];
    const dispose = bindAboutWindowIpc(createIpc(handlers), registry, {
      readLocaleValues: labels => ({...localeResponse, requested: labels.join(',')}),
      reportWebappVersions: versions => void reported.push(versions),
    });

    assert.deepStrictEqual(await handlers.get(ABOUT_LOCALE_READ_CHANNEL)?.(aboutEvent, {labels: ['requested']}), {
      ...localeResponse,
      requested: 'requested',
    });
    assert.strictEqual(
      await handlers.get(WEBAPP_VERSIONS_REPORT_CHANNEL)?.(accountEvent, {
        webappVersion: 'webapp-1',
        webappAVSVersion: 'avs-1',
      }),
      undefined,
    );
    assert.deepStrictEqual(reported, [{webappVersion: 'webapp-1', webappAVSVersion: 'avs-1'}]);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects wrong views and malformed values before side effects', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const aboutEvent = createSender(
      registry,
      'about',
      [ABOUT_LOCALE_READ_CAPABILITY, WEBAPP_VERSIONS_REPORT_CAPABILITY],
      101,
    );
    const accountEvent = createSender(
      registry,
      'account',
      [ABOUT_LOCALE_READ_CAPABILITY, WEBAPP_VERSIONS_REPORT_CAPABILITY],
      102,
    );
    let sideEffects = 0;
    bindAboutWindowIpc(createIpc(handlers), registry, {
      readLocaleValues: () => {
        sideEffects += 1;
        return localeResponse;
      },
      reportWebappVersions: () => void (sideEffects += 1),
    });
    const locale = handlers.get(ABOUT_LOCALE_READ_CHANNEL);
    const versions = handlers.get(WEBAPP_VERSIONS_REPORT_CHANNEL);
    assert.ok(locale);
    assert.ok(versions);

    await assert.rejects(() => locale(accountEvent, {labels: []}), /view type/);
    await assert.rejects(() => versions(aboutEvent, {webappVersion: 'v1'}), /view type/);
    for (const request of [
      null,
      {labels: ['duplicate', 'duplicate']},
      {labels: Array.from({length: MAX_ABOUT_LOCALE_LABELS + 1}, (_, index) => `label${index}`)},
      {labels: ['../secret']},
      {labels: [], extra: true},
    ]) {
      await assert.rejects(() => locale(aboutEvent, request), /payload/);
    }
    for (const request of [
      null,
      {},
      {webappVersion: ''},
      {webappVersion: 'x'.repeat(MAX_WEBAPP_VERSION_LENGTH + 1)},
      {webappVersion: 'v1', webappAVSVersion: ''},
      {webappVersion: 'v1', extra: true},
    ]) {
      await assert.rejects(() => versions(accountEvent, request), /payload/);
    }
    assert.strictEqual(sideEffects, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects malformed locale results', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry, 'about', [ABOUT_LOCALE_READ_CAPABILITY], 101);
    bindAboutWindowIpc(createIpc(handlers), registry, {
      readLocaleValues: () => ({aboutReleasesUrl: 'https://example.test/releases'}),
      reportWebappVersions: () => {},
    });
    const handler = handlers.get(ABOUT_LOCALE_READ_CHANNEL);
    assert.ok(handler);

    await assert.rejects(() => handler(event, {labels: []}), /response payload/);
  });

  for (const [channel, viewType, capability, maximum] of [
    [ABOUT_LOCALE_READ_CHANNEL, 'about', ABOUT_LOCALE_READ_CAPABILITY, MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE],
    [
      WEBAPP_VERSIONS_REPORT_CHANNEL,
      'account',
      WEBAPP_VERSIONS_REPORT_CAPABILITY,
      MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE,
    ],
  ] as const) {
    it(`[security-target][INV-003][INV-010][SEC-003] rate-limits ${channel}`, async () => {
      const handlers = new Map<string, BoundHandler>();
      const registry = new ViewIdentityRegistry();
      const event = createSender(registry, viewType, [capability], 101);
      let sideEffects = 0;
      bindAboutWindowIpc(createIpc(handlers), registry, {
        readLocaleValues: () => {
          sideEffects += 1;
          return {aboutReleasesUrl: 'releases', aboutUpdatesUrl: 'updates'};
        },
        reportWebappVersions: () => void (sideEffects += 1),
      });
      const handler = handlers.get(channel);
      assert.ok(handler);
      const request = channel === ABOUT_LOCALE_READ_CHANNEL ? {labels: []} : {webappVersion: 'webapp-version'};

      for (let count = 0; count < maximum; count += 1) {
        await handler(event, request);
      }
      await assert.rejects(() => handler(event, request), /rate limit/);
      assert.strictEqual(sideEffects, maximum);
    });
  }
});
