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

import type {Data as OpenGraphResult} from 'open-graph';

import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {
  MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE,
  MAX_OPEN_GRAPH_URL_LENGTH,
  OPEN_GRAPH_FETCH_CAPABILITY,
  OPEN_GRAPH_FETCH_CHANNEL,
  OpenGraphFetchRequest,
} from './OpenGraphContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE,
  MAX_OPEN_GRAPH_URL_LENGTH,
  OPEN_GRAPH_FETCH_CAPABILITY,
  OPEN_GRAPH_FETCH_CHANNEL,
} from './OpenGraphContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: OpenGraphFetchRequest): Promise<unknown>;
}

type OpenGraphBoundary = (url: string) => Promise<OpenGraphResult>;

const ALLOWED_REQUEST_KEYS = new Set(['url']);

const isOpenGraphFetchRequest = (value: unknown): value is OpenGraphFetchRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<OpenGraphFetchRequest>;
  const keys = Object.keys(value);
  return (
    keys.length === ALLOWED_REQUEST_KEYS.size &&
    keys.every(key => ALLOWED_REQUEST_KEYS.has(key)) &&
    typeof request.url === 'string' &&
    request.url.length > 0 &&
    request.url.length <= MAX_OPEN_GRAPH_URL_LENGTH
  );
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string');

const isMetadata = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every(
    entry => typeof entry === 'undefined' || typeof entry === 'string' || isStringArray(entry),
  );

export const isOpenGraphResult = (value: unknown): value is OpenGraphResult =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every(
    entry => typeof entry === 'undefined' || typeof entry === 'string' || isStringArray(entry) || isMetadata(entry),
  );

const openGraphContract: AuthorizedIpcContract<OpenGraphFetchRequest, OpenGraphResult> = Object.freeze({
  capability: OPEN_GRAPH_FETCH_CAPABILITY,
  channel: OPEN_GRAPH_FETCH_CHANNEL,
  failureMode: 'reject',
  isRequest: isOpenGraphFetchRequest,
  isResponse: isOpenGraphResult,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const requestOpenGraphData = async (ipc: IpcRendererInvoker, url: string): Promise<OpenGraphResult> => {
  const response = await ipc.invoke(OPEN_GRAPH_FETCH_CHANNEL, {url});
  if (!isOpenGraphResult(response)) {
    throw new Error('Open Graph response payload is invalid.');
  }
  return response;
};

export const bindOpenGraphIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  fetchOpenGraph: OpenGraphBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, openGraphContract, (_identity, request) => fetchOpenGraph(request.url));
