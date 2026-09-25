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

import {ipcRenderer} from 'electron';

import {CONTEXT_MENU_IMAGE_ACTION_CHANNEL, ContextMenuImageAction} from './ContextMenuImageAction';

import {MAX_SAVE_PICTURE_BYTES, SAVE_PICTURE_CHANNEL} from '../../security/SavePictureContract';
import {config} from '../../settings/config';

const savePicture = async (url: RequestInfo, timestamp?: string): Promise<void> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
    },
  });
  if (!response.body) {
    throw new Error('Image response has no body.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      if (value.byteLength > MAX_SAVE_PICTURE_BYTES - totalBytes) {
        await reader.cancel();
        throw new Error('Image exceeds save limit.');
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await ipcRenderer.invoke(SAVE_PICTURE_CHANNEL, {bytes, timestamp});
};

ipcRenderer.on(CONTEXT_MENU_IMAGE_ACTION_CHANNEL, (_event, action: ContextMenuImageAction) => {
  if (action.kind === 'save') {
    void savePicture(action.sourceUrl).catch(() => console.error('Could not save picture.'));
  }
});
