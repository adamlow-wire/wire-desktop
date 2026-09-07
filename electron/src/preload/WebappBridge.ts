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

import type {Data as OpenGraphResult} from 'open-graph';

import type {DesktopAppConfig} from '../lib/desktopAppConfig';
import type * as EnvironmentUtil from '../runtime/EnvironmentUtil';

export const WEBAPP_BRIDGE_VERSION = 1;

export interface WebappBridgeDependencies {
  decrypt(encrypted: Uint8Array): Promise<string>;
  encrypt(value: string): Promise<Uint8Array>;
  environment: typeof EnvironmentUtil;
  getDesktopSources(options: Electron.SourcesOptions): Promise<Electron.DesktopCapturerSource[]>;
  getOpenGraphData(url: string): Promise<OpenGraphResult>;
  desktopAppConfig: DesktopAppConfig;
}

export interface WebappBridge {
  readonly version: typeof WEBAPP_BRIDGE_VERSION;
  readonly desktopAppConfig: DesktopAppConfig;
  readonly desktopCapturer: {
    getDesktopSources(options: Electron.SourcesOptions): Promise<Electron.DesktopCapturerSource[]>;
  };
  readonly environment: typeof EnvironmentUtil;
  readonly openGraphAsync: (url: string) => Promise<OpenGraphResult>;
  readonly systemCrypto: {
    decrypt(encrypted: Uint8Array): Promise<string>;
    encrypt(value: string): Promise<Uint8Array>;
    readonly version: 1;
  };
}

type BridgeExposer = Pick<Electron.ContextBridge, 'exposeInMainWorld'>;

export const createWebappBridge = (dependencies: WebappBridgeDependencies): Readonly<WebappBridge> =>
  Object.freeze({
    desktopAppConfig: Object.freeze(dependencies.desktopAppConfig),
    desktopCapturer: Object.freeze({getDesktopSources: dependencies.getDesktopSources}),
    environment: Object.freeze(dependencies.environment),
    openGraphAsync: dependencies.getOpenGraphData,
    systemCrypto: Object.freeze({decrypt: dependencies.decrypt, encrypt: dependencies.encrypt, version: 1 as const}),
    version: WEBAPP_BRIDGE_VERSION,
  });

export const exposeWebappBridge = (contextBridge: BridgeExposer, bridge: Readonly<WebappBridge>): void => {
  contextBridge.exposeInMainWorld('wireDesktopBridge', bridge);

  // Compatibility names consumed by released Wire webapps. New integrations should
  // feature-detect wireDesktopBridge.version and use its namespaced capabilities.
  contextBridge.exposeInMainWorld('desktopAppConfig', bridge.desktopAppConfig);
  contextBridge.exposeInMainWorld('desktopCapturer', bridge.desktopCapturer);
  contextBridge.exposeInMainWorld('environment', bridge.environment);
  contextBridge.exposeInMainWorld('openGraphAsync', bridge.openGraphAsync);
  contextBridge.exposeInMainWorld('systemCrypto', bridge.systemCrypto);
};
