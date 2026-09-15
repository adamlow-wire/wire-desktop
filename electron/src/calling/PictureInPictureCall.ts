/*
 * Wire
 * Copyright (C) 2024 Wire Swiss GmbH
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

import path from 'node:path';

import {DISPLAY_CAPTURE_CAPABILITY} from './display/DisplayCaptureContract';

import {
  LifecycleWebContentsIdentity,
  RegisteredViewIdentity,
  registerViewIdentity,
  ViewIdentityRegistry,
} from '../security/ViewIdentityRegistry';
import {getNewWindowOptions} from '../window/WindowUtil';

const PICTURE_IN_PICTURE_CALL_FRAME_NAME = 'WIRE_PICTURE_IN_PICTURE_CALL';

export const isPictureInPictureCallWindow = (frameName: string): boolean => {
  return frameName === PICTURE_IN_PICTURE_CALL_FRAME_NAME;
};

export const getPictureInPictureCallWindowOptions = (): Electron.BrowserWindowConstructorOptions => {
  const options = getNewWindowOptions({
    autoHideMenuBar: true,
    width: 1026,
    height: 829,
    resizable: true,
    fullscreenable: true,
    maximizable: true,
    alwaysOnTop: false,
    minimizable: true,
  });
  return {
    ...options,
    webPreferences: {
      ...options.webPreferences,
      preload: path.resolve(__dirname, '../../dist/preload/preload-display-pip.js'),
      backgroundThrottling: false,
    },
  };
};

export const registerPictureInPictureCallIdentity = ({
  accountId,
  allowedUrl,
  partition,
  registry,
  webContents,
}: {
  readonly accountId?: string;
  readonly allowedUrl: string;
  readonly partition: string;
  readonly registry: ViewIdentityRegistry;
  readonly webContents: LifecycleWebContentsIdentity;
}): RegisteredViewIdentity => {
  const allowedOrigin = new URL(allowedUrl).origin;
  return registerViewIdentity(registry, {
    accountId,
    allowedOrigin,
    ...(allowedUrl === 'about:blank' ? {allowedUrl} : {}),
    capabilities: [DISPLAY_CAPTURE_CAPABILITY],
    partition,
    session: webContents.session,
    viewType: 'picture-in-picture',
    webContents,
  });
};

export const bindPictureInPictureCallIdentity = ({
  allowedUrl,
  destroy,
  frameName,
  logRejection,
  partition,
  registry,
  resolveAccountId,
  webContents,
}: {
  readonly allowedUrl: string;
  readonly destroy: () => void;
  readonly frameName: string;
  readonly logRejection: (error: unknown) => void;
  readonly partition: string;
  readonly registry: ViewIdentityRegistry;
  readonly resolveAccountId: () => string | undefined;
  readonly webContents: LifecycleWebContentsIdentity;
}): boolean => {
  if (!isPictureInPictureCallWindow(frameName)) {
    return true;
  }

  try {
    registerPictureInPictureCallIdentity({
      accountId: resolveAccountId(),
      allowedUrl,
      partition,
      registry,
      webContents,
    });
    return true;
  } catch (error) {
    destroy();
    logRejection(error);
    return false;
  }
};
