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

import {contextBridge, ipcRenderer} from 'electron';

// Sandboxed preloads cannot load adjacent CommonJS modules. Keep this bridge deliberately
// self-contained and let the integration contract test detect drift from the main contract.
const CONTRACT_VERSION = 1 as const;
const RUNTIME_INFO_CHANNEL = 'wire-secure-shell:runtime-info:v1';

const secureShellBridge = Object.freeze({
  getRuntimeInfo: (): Promise<{accountId: string; contractVersion: typeof CONTRACT_VERSION}> =>
    ipcRenderer.invoke(RUNTIME_INFO_CHANNEL, {contractVersion: CONTRACT_VERSION}),
});

contextBridge.exposeInMainWorld('wireDesktopProof', secureShellBridge);
