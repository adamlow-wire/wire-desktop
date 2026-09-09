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

import {ClientRequest, IncomingHttpHeaders, IncomingMessage, RequestOptions, request as httpRequest} from 'http';
import {request as httpsRequest} from 'https';
import {LookupFunction} from 'net';
import {createBrotliDecompress, createGunzip, createInflate} from 'zlib';

import {ResolveHost, resolveHost, resolvePublicTarget} from './PublicNetworkPolicy';

export interface PublicResource {
  readonly body: Buffer;
  readonly headers: IncomingHttpHeaders;
  readonly url: URL;
}

interface FetchLimits {
  readonly maxBytes: number;
  readonly userAgent: string;
  readonly timeoutMs?: number;
}

type PreviewRequest = (
  url: URL,
  options: RequestOptions,
  receive: (response: IncomingMessage) => void,
) => ClientRequest;
const requestPublic: PreviewRequest = (url, options, receive) =>
  (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, receive);

const readBody = async (response: IncomingMessage, limit: number): Promise<Buffer> => {
  const encoding = response.headers['content-encoding'];
  const decoder =
    encoding === 'gzip'
      ? createGunzip()
      : encoding === 'deflate'
      ? createInflate()
      : encoding === 'br'
      ? createBrotliDecompress()
      : undefined;
  if (encoding && encoding !== 'identity' && !decoder) {
    response.destroy();
    throw new Error('Unsupported preview content encoding.');
  }
  const stream = decoder ?? response;
  let wireBytes = 0;
  let decodedBytes = 0;
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => {
    wireBytes += chunk.length;
    if (wireBytes > limit) {
      response.destroy(new Error('Preview response is too large.'));
    }
  });
  if (decoder) {
    response.on('error', error => decoder.destroy(error));
    response.pipe(decoder);
  }
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      decodedBytes += buffer.length;
      if (decodedBytes > limit) {
        throw new Error('Preview response is too large.');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, decodedBytes);
  } finally {
    response.destroy();
    decoder?.destroy();
  }
};

export const fetchPublicResource = async (
  value: string,
  limits: FetchLimits,
  resolve: ResolveHost = resolveHost,
  requestPublicResource: PreviewRequest = requestPublic,
): Promise<PublicResource> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Preview request timed out.'));
    }, limits.timeoutMs ?? 10_000);
  });
  const run = async (): Promise<PublicResource> => {
    let next = value;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const {url, addresses} = await resolvePublicTarget(next, resolve);
      if (controller.signal.aborted) {
        throw new Error('Preview request timed out.');
      }
      const pinnedLookup: LookupFunction = (_hostname, options, callback) =>
        callback(null, options.all ? addresses : addresses[0].address, addresses[0].family);
      const response = await new Promise<IncomingMessage>((resolveResponse, reject) => {
        const request = requestPublicResource(
          url,
          {
            agent: false,
            family: addresses[0].family,
            lookup: pinnedLookup,
            maxHeaderSize: 16_384,
            method: 'GET',
            signal: controller.signal,
            headers: {'User-Agent': limits.userAgent, 'Accept-Encoding': 'gzip, deflate, br'},
          },
          resolveResponse,
        );
        request.once('error', reject);
        request.end();
      });
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        const location = response.headers.location;
        if (redirects === 5 || !location || location.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(location)) {
          throw new Error('Preview redirect is not permitted.');
        }
        const target = new URL(location, url);
        if (url.protocol === 'https:' && target.protocol !== 'https:') {
          throw new Error('Preview redirect is not permitted.');
        }
        next = target.href;
        continue;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        throw new Error('Preview request returned an unsuccessful status.');
      }
      return {body: await readBody(response, limits.maxBytes), headers: response.headers, url};
    }
    throw new Error('Preview redirect is not permitted.');
  };
  try {
    return await Promise.race([run(), expired]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Preview request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer!);
  }
};
