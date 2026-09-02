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

import {
  LifecycleWebContentsIdentity,
  RegisteredViewIdentity,
  registerViewIdentity,
  ViewIdentityRegistry,
} from './ViewIdentityRegistry';

export const WEBRTC_INTERNALS_URL = 'chrome://webrtc-internals/';

export const registerDeveloperToolViewIdentity = (
  registry: ViewIdentityRegistry,
  webContents: LifecycleWebContentsIdentity,
): RegisteredViewIdentity =>
  registerViewIdentity(registry, {
    allowedOrigin: new URL(WEBRTC_INTERNALS_URL).origin,
    allowedUrl: WEBRTC_INTERNALS_URL,
    capabilities: [],
    partition: 'default',
    session: webContents.session,
    viewType: 'developer-tool',
    webContents,
  });
