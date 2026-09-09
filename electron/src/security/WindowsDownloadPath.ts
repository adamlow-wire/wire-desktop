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

import {lstatSync} from 'fs';
import {win32} from 'path';

import {MAX_DOWNLOAD_LOCATION_LENGTH} from './DownloadLocationContract';

const invalidPath = () => new Error('Enforced download path is not a safe home-relative directory.');

export const normalizeWindowsDownloadPath = (value: string): string => {
  if (!value || value.length > MAX_DOWNLOAD_LOCATION_LENGTH || /^[\\/]/.test(value)) {
    throw invalidPath();
  }
  const components = value.split(/[\\/]+/);
  for (const component of components) {
    if (
      !component ||
      component.length > 255 ||
      /[<>:"|?*\u0000-\u001f\u007f]/.test(component) ||
      /[. ]$/.test(component) ||
      /^(con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:[ .]|$)/i.test(component)
    ) {
      throw invalidPath();
    }
  }
  return components.join('\\');
};

type InspectDirectory = (directory: string) => {isDirectory(): boolean; isSymbolicLink(): boolean};

export const resolveWindowsDownloadPath = (
  base: string,
  value: string,
  inspect: InspectDirectory = lstatSync,
): string => {
  const relative = normalizeWindowsDownloadPath(value);
  // The approved base is supplied by main, never the account renderer.
  if (!/^[a-z]:\\/i.test(base) || base.includes('\u0000')) {
    throw invalidPath();
  }
  let directory = win32.normalize(base);
  for (const component of relative.split('\\')) {
    directory = win32.join(directory, component);
    try {
      const entry = inspect(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw invalidPath();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return directory;
};
