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

const EXTERNAL_URL_MAX_LENGTH = 2048;

export const parseExternalUrl = (value: unknown, httpsOnly = false): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > EXTERNAL_URL_MAX_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f\\]/.test(value)
  ) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const allowedProtocols = httpsOnly ? ['https:'] : ['ftp:', 'http:', 'https:', 'mailto:'];
  if (!allowedProtocols.includes(url.protocol) || url.username !== '' || url.password !== '') {
    return undefined;
  }

  if (url.protocol === 'mailto:') {
    return url.pathname.length > 0 && !/%0[ad]/i.test(value) ? url.href : undefined;
  }

  if (!/^(?:https?|ftp):\/\//i.test(value)) {
    return undefined;
  }

  return url.hostname.length > 0 ? url.href : undefined;
};
