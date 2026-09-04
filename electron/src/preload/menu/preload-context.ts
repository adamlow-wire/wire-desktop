/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

import {clipboard, ipcRenderer, nativeImage} from 'electron';

import {CONTEXT_MENU_IMAGE_ACTION_CHANNEL, ContextMenuImageAction} from './ContextMenuImageAction';

import {SAVE_PICTURE_CHANNEL} from '../../security/SavePictureContract';
import {config} from '../../settings/config';

const savePicture = async (url: RequestInfo, timestamp?: string): Promise<void> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
    },
  });
  const bytes = await response.arrayBuffer();
  await ipcRenderer.invoke(SAVE_PICTURE_CHANNEL, {bytes: new Uint8Array(bytes), timestamp});
};

const copyPicture = async (url: RequestInfo): Promise<void> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
    },
  });
  const bytes = await response.arrayBuffer();
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  clipboard.writeImage(image);
};

ipcRenderer.on(CONTEXT_MENU_IMAGE_ACTION_CHANNEL, (_event, action: ContextMenuImageAction) => {
  if (action.kind === 'save') {
    void savePicture(action.sourceUrl);
  } else if (action.kind === 'copy') {
    void copyPicture(action.sourceUrl);
  }
});
