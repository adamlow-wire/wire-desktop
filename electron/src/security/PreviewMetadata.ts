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

import {Parser} from 'htmlparser2';
import type {Data, ImageVideoMetadata} from 'open-graph';

const scalarFields = new Set(['title', 'description', 'site_name', 'type', 'url', 'determiner', 'locale']);
const imageFields = new Set(['url', 'secure_url', 'type', 'width', 'height', 'alt']);
const FIELD_LIMIT = 8192;

export const parsePreviewMetadata = (html: string): Data => {
  if (Buffer.byteLength(html, 'utf8') > 1_000_000) {
    throw new Error('Preview HTML is too large.');
  }
  const fields = new Map<string, string | string[]>();
  const image = new Map<string, string | string[]>();
  let fallbackImage: ImageVideoMetadata | undefined;
  let title = '';
  let inTitle = false;
  let namespace = 'og';
  let tags = 0;
  let metaTags = 0;
  const bounded = (value: string): string => {
    if (value.length > FIELD_LIMIT) {
      throw new Error('Preview metadata field is too large.');
    }
    return value;
  };
  const append = (target: Map<string, string | string[]>, key: string, value: string) => {
    bounded(value);
    const previous = target.get(key);
    target.set(key, previous === undefined ? value : [...(Array.isArray(previous) ? previous : [previous]), value]);
  };
  const parser = new Parser({
    onopentag(name, attributes) {
      if (++tags > 10_000) {
        throw new Error('Preview HTML has too many tags.');
      }
      if (name === 'html') {
        for (const [key, value] of Object.entries(attributes)) {
          if (key.startsWith('xmlns:') && value.toLowerCase() === 'http://opengraphprotocol.org/schema/') {
            namespace = key.slice(6);
          }
        }
      }
      if (name === 'title') {
        inTitle = true;
      }
      if (name === 'img' && !fallbackImage) {
        fallbackImage = {};
        for (const [source, target] of [
          ['src', 'url'],
          ['width', 'width'],
          ['height', 'height'],
        ]) {
          if (attributes[source] !== undefined) {
            fallbackImage[target] = bounded(attributes[source]);
          }
        }
      }
      if (name !== 'meta') {
        return;
      }
      if (++metaTags > 128) {
        throw new Error('Preview HTML has too many metadata fields.');
      }
      const property = attributes.property;
      const content = attributes.content;
      if (!property?.startsWith(`${namespace}:`) || content === undefined) {
        return;
      }
      const field = property.slice(namespace.length + 1);
      if (scalarFields.has(field)) {
        append(fields, field, content);
      } else {
        const imageField = field === 'image' ? 'url' : field.startsWith('image:') ? field.slice(6) : '';
        if (imageFields.has(imageField)) {
          append(image, imageField, content);
        }
      }
    },
    ontext(text) {
      if (inTitle) {
        title = bounded(title + text);
      }
    },
    onclosetag(name) {
      if (name === 'title') {
        inTitle = false;
      }
    },
  });
  parser.end(html);
  const result: Data = {title, ...Object.fromEntries(fields)};
  if (image.size || fallbackImage) {
    result.image = image.size ? Object.fromEntries(image) : fallbackImage;
  }
  return result;
};
