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

import {_electron as electron, expect, Page} from '@playwright/test';

import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {quitApp} from './quitApp';

export type App = Awaited<ReturnType<typeof createApp>>;

export const createApp = async (options: {
  env?: string;
  lang?: string;
  dataDir: string;
  mediaConsent?: 'allow' | 'deny';
  traceDirectory?: string;
}) => {
  if (!options.env) {
    throw new Error(`Can't create app without environment, make sure the env var "WEBAPP_URL" is set`);
  }

  const app = await electron.launch({
    chromiumSandbox: true,
    env: {...process.env, WIRE_E2E_MEDIA_CONSENT: options.mediaConsent ?? 'allow'},
    args: [
      '-r',
      path.resolve(__dirname, '../utils/nativeConsent.cjs'),
      // Chromium launch args
      `--user-data-dir=${options.dataDir}`,
      '--mute-audio', // Mute all audio output from the test browser because e.g. the ringtone of a call can be annoying during testing
      '--use-fake-device-for-media-stream', // Never expose real devices, including in permission-denial tests.
      '.',
      // Wire specific cli flags to set during launch
      `--env=${options.env}`,
      `--lang=${options.lang ?? 'en'}`,
    ],
  });

  // Forward all logs from the electron apps main thread to the terminal
  app.on('console', async msg => {
    const args = (await Promise.allSettled(msg.args().map(arg => arg.jsonValue())))
      .filter(result => result.status === 'fulfilled')
      .map(arg => arg.value);

    // eslint-disable-next-line no-console
    console.log(...args);
  });

  let wrapper: Page | undefined;
  let page: Page | undefined;
  let selectedId: string | undefined;
  const nativeClose = app.close.bind(app);
  let tracing = false;
  let traceStopped: Promise<void> | undefined;
  const stopTrace = (): Promise<void> => {
    if (!tracing) {
      return Promise.resolve();
    }
    return (traceStopped ??= app.context().tracing.stop({
      path: path.join(options.traceDirectory!, `app-${randomUUID()}.zip`),
    }));
  };
  const close = async (): Promise<void> => {
    try {
      await stopTrace();
    } finally {
      await nativeClose();
    }
  };
  try {
    if (options.traceDirectory) {
      await app.context().tracing.start({screenshots: true, snapshots: true});
      tracing = true;
    }
    // A fresh profile first opens a temporary migration reader, not the product shell.
    await expect
      .poll(() => {
        wrapper = app.windows().find(candidate => {
          if (candidate.isClosed()) {
            return false;
          }
          const url = new URL(candidate.url());
          return ['file:', 'wire-app:'].includes(url.protocol) && url.searchParams.has('env');
        });
        return Boolean(wrapper);
      })
      .toBe(true);
    await expect
      .poll(async () => {
        selectedId = await wrapper!
          .evaluate(async () => {
            const bridge = (
              window as unknown as {
                wireAccounts?: {read(): Promise<Array<{id: string; visible: boolean}>>};
              }
            ).wireAccounts;
            return (await bridge?.read())?.find(account => account.visible)?.id;
          })
          .catch(() => undefined);
        return selectedId;
      })
      .toBeTruthy();
    await expect
      .poll(
        () => {
          page = app
            .windows()
            .find(candidate => !candidate.isClosed() && new URL(candidate.url()).searchParams.get('id') === selectedId);
          return Boolean(page);
        },
        // Document startup includes a network response, unlike a short UI assertion.
        // Keep the exact selected-account match and a finite startup deadline.
        {timeout: 30_000},
      )
      .toBe(true);
  } catch (error) {
    // Native state distinguishes a pending request, modal dialog and automation
    // attachment failure. Never include URLs, account IDs or dialog contents.
    let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const diagnostic = await Promise.race([
        app.evaluate(
          ({BrowserWindow, webContents}, expected) => ({
            windows: BrowserWindow.getAllWindows().map(window => ({
              visible: window.isVisible(),
              minimized: window.isMinimized(),
              focused: window.isFocused(),
            })),
            contents: webContents
              .getAllWebContents()
              .filter(contents => !contents.isDestroyed())
              .map(contents => {
                const url = new URL(contents.getURL() || 'about:blank');
                return {
                  type: contents.getType(),
                  protocol: url.protocol,
                  expectedOrigin: url.origin === expected.origin,
                  selectedAccount: url.searchParams.get('id') === expected.id,
                  loading: contents.isLoading(),
                  loadingMainFrame: contents.isLoadingMainFrame(),
                  crashed: contents.isCrashed(),
                  workers: Object.keys(contents.session.serviceWorkers.getAllRunning()).length,
                };
              }),
            pendingOtherDialogs: (globalThis as unknown as {wireE2EConsent?: {pendingOtherDialogs: number}})
              .wireE2EConsent?.pendingOtherDialogs,
          }),
          {origin: new URL(options.env).origin, id: selectedId},
        ),
        new Promise(resolve => {
          diagnosticTimer = setTimeout(() => resolve({unavailable: true}), 5_000);
        }),
      ]);
      // eslint-disable-next-line no-console
      console.error('Electron fixture startup state', diagnostic);
    } catch {
      // eslint-disable-next-line no-console
      console.error('Electron fixture startup state unavailable');
    } finally {
      clearTimeout(diagnosticTimer);
    }
    await close();
    throw error;
  }

  return Object.assign(app, {
    close,
    /* The playwright page for the main electron window wrapping the webapp */
    wrapper: wrapper!,
    /* The playwright page for the currently shown webapp */
    page: page!,
    /**
     * Utility function to re-open the application re-using the existing storage state
     * **Important:** the existing app won't be updated by this, instead the variable needs to be re-assigned
     * @param {Function} quit Optional native quit operation, invoked after saving the current trace.
     * @returns {App} app
     */
    reopen: async (quit?: () => Promise<unknown>) => {
      // Persist this instance's trace before a native Quit can destroy its context.
      await stopTrace();
      if (quit) {
        await quitApp(app, quit);
      } else {
        await nativeClose();
      }

      // During the re-launch the old instance of the app is closed. However the fixture is still pointing to it, so we set its close function to now close the relaunched instance.
      // This way it's ensured that even after relaunch(es) the app will always be cleaned up.
      const relaunchedApp = await createApp(options);
      app.close = () => relaunchedApp.close();

      return relaunchedApp;
    },
  });
};
