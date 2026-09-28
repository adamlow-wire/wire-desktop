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

import {ProxyPromptActions, ProxyPromptCoordinator} from './ProxyPromptCoordinator';

type OnCreated = (webContentsId: number) => (() => void) | undefined;

export interface RegisterProxyPromptOptions {
  readonly actions: ProxyPromptActions;
  readonly coordinator: ProxyPromptCoordinator;
  fireAndForget(action: () => Promise<void>): void;
  showWindow(onCreated: OnCreated): Promise<unknown>;
}

export const showRegisteredProxyPrompt = async (options: RegisterProxyPromptOptions): Promise<void> => {
  await options.showWindow(webContentsId => {
    let closed = false;
    let submission: Promise<void> | undefined;
    options.coordinator.register(
      webContentsId,
      {
        cancel: () => options.actions.cancel(),
        submit: credentials => {
          submission = (async () => {
            await options.actions.submit(credentials);
          })();
          return submission;
        },
      },
      () => !closed,
    );
    return () => {
      if (closed) {
        return;
      }
      closed = true;
      if (options.coordinator.has(webContentsId)) {
        options.fireAndForget(() => options.coordinator.cancel(webContentsId));
      } else if (submission) {
        // A consumed submission cannot be cancelled until session setup settles.
        // Success already completes the challenge; failure still needs cleanup.
        const pending = submission;
        options.fireAndForget(async () => {
          try {
            await pending;
          } catch {
            await options.actions.cancel();
          }
        });
      }
    };
  });
};
