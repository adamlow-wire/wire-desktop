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

import {parse as parseContentType} from 'content-type';
import {decode as iconvDecode} from 'iconv-lite';
import type {Data as OpenGraphResult} from 'open-graph';

import * as path from 'path';

import {getLogger} from '../logging/getLogger';
import {parsePreviewMetadata} from '../security/PreviewMetadata';
import {fetchPublicResource, PublicResource} from '../security/PublicResourceFetch';
import {config} from '../settings/config';

const logger = getLogger(path.basename(__filename));
const HTML_SIZE_LIMIT = 1_000_000;
const IMAGE_SIZE_LIMIT = 5_000_000;

const decodeHtml = (resource: PublicResource): string => {
  let contentType;
  try {
    contentType = parseContentType(resource.headers['content-type'] ?? '');
  } catch {
    throw new Error('Could not parse content type for preview.');
  }
  if (contentType.type !== 'text/html') {
    throw new Error('Unhandled format for open graph generation.');
  }
  const charset = contentType.parameters.charset;
  if (charset) {
    try {
      return iconvDecode(resource.body, charset);
    } catch {
      logger.warn('Unsupported preview charset; using UTF-8.');
    }
  }
  return resource.body.toString('utf8');
};

export const getOpenGraphDataAsync = async (
  value: string,
  fetchResource: typeof fetchPublicResource = fetchPublicResource,
): Promise<OpenGraphResult> => {
  const hostname = new URL(value).hostname;
  const userAgent =
    hostname === 'twitter.com' || hostname.endsWith('.twitter.com') ? 'Twitterbot/1.0' : config.userAgent;
  const resource = await fetchResource(value, {maxBytes: HTML_SIZE_LIMIT, userAgent});
  const metadata = parsePreviewMetadata(decodeHtml(resource));
  if (!metadata.description && !metadata.image && !metadata.type && !metadata.url) {
    throw new Error('No openGraph data found');
  }
  if (Array.isArray(metadata.image)) {
    metadata.image = metadata.image[0];
  }
  if (typeof metadata.image === 'object' && metadata.image.url) {
    const imageUrl = Array.isArray(metadata.image.url) ? metadata.image.url[0] : metadata.image.url;
    try {
      const image = await fetchResource(new URL(imageUrl, resource.url).href, {maxBytes: IMAGE_SIZE_LIMIT, userAgent});
      const contentType = parseContentType(image.headers['content-type'] ?? '');
      if (!contentType.type.startsWith('image/')) {
        throw new Error('Unhandled format for open graph image.');
      }
      metadata.image.data = `data:${contentType.type};base64,${image.body.toString('base64')}`;
      return metadata;
    } catch {
      logger.warn('Preview image unavailable or rejected by network policy.');
    }
  }
  delete metadata.image;
  return metadata;
};
