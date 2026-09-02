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

import {App} from 'electron';

import {SecureShellControllerOptions} from './SecureShellController';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

interface SecureShellControllerLifecycle {
  dispose(): void;
  show(): void;
  start(): Promise<void>;
}

interface SecureShellLogger {
  error(message: string, error: unknown): void;
}

export interface SecureShellBootstrapOptions {
  readonly accountPreload: string;
  readonly app: App;
  readonly getAccountUrl: () => string | undefined;
  readonly logger: SecureShellLogger;
}

export interface SecureShellBootstrapDependencies {
  readonly bindIpc: (registry: ViewIdentityRegistry) => () => void;
  readonly createController: (
    options: SecureShellControllerOptions,
    registry: ViewIdentityRegistry,
  ) => SecureShellControllerLifecycle;
  readonly installProtocol: () => () => void;
}

export const startSecureShellProof = async (
  options: SecureShellBootstrapOptions,
  dependencies: SecureShellBootstrapDependencies,
): Promise<void> => {
  const registry = new ViewIdentityRegistry();
  let controller: SecureShellControllerLifecycle | undefined;
  let disposeIpc: (() => void) | undefined;
  let disposeProtocol: (() => void) | undefined;

  options.app.on('window-all-closed', () => options.app.quit());
  options.app.on('activate', () => controller?.show());
  options.app.once('before-quit', () => {
    controller?.dispose();
    disposeIpc?.();
    disposeProtocol?.();
  });

  try {
    await options.app.whenReady();
    const accountUrl = options.getAccountUrl();
    if (!accountUrl) {
      throw new Error('Secure shell proof requires a configured webapp URL.');
    }

    disposeProtocol = dependencies.installProtocol();
    disposeIpc = dependencies.bindIpc(registry);
    controller = dependencies.createController(
      {
        accountId: 'secure-shell-proof-account',
        accountPreload: options.accountPreload,
        accountUrl,
      },
      registry,
    );
    await controller.start();
  } catch (error) {
    options.logger.error('Secure shell proof failed closed.', error);
    controller?.dispose();
    disposeIpc?.();
    disposeProtocol?.();
    options.app.quit();
  }
};

export type {SecureShellControllerLifecycle};
