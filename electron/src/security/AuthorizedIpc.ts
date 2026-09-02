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

import {AuthorizedViewIdentity, SenderIdentity, ViewIdentityRegistry, ViewType} from './ViewIdentityRegistry';

export interface AuthorizedIpcContract<Request, Response> {
  readonly capability: string;
  readonly channel: string;
  readonly failureMode: 'reject';
  readonly isRequest: (value: unknown) => value is Request;
  readonly isResponse: (value: unknown) => value is Response;
  readonly originPolicy: 'registered-view-origin';
  readonly rateLimit: 'not-required' | Readonly<{maxRequests: number; windowMs: number}>;
  readonly viewTypes: readonly ViewType[];
}

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface RequestRateLimiter {
  consume(webContentsId: number): void;
}

type AuthorizedIpcHandler<Request, Response> = (
  identity: AuthorizedViewIdentity,
  request: Request,
) => Response | Promise<Response>;

const validateContractPolicy = <Request, Response>(contract: AuthorizedIpcContract<Request, Response>): void => {
  const rateLimit = contract.rateLimit;
  const hasValidRateLimit =
    rateLimit === 'not-required' ||
    (Number.isSafeInteger(rateLimit.maxRequests) &&
      rateLimit.maxRequests > 0 &&
      Number.isSafeInteger(rateLimit.windowMs) &&
      rateLimit.windowMs > 0);
  if (
    contract.failureMode !== 'reject' ||
    contract.originPolicy !== 'registered-view-origin' ||
    !hasValidRateLimit
  ) {
    throw new Error('IPC contract policy is invalid.');
  }
};

const createRequestRateLimiter = (
  rateLimit: AuthorizedIpcContract<unknown, unknown>['rateLimit'],
  now: () => number,
): RequestRateLimiter | undefined => {
  if (rateLimit === 'not-required') {
    return undefined;
  }
  const states = new Map<number, {count: number; resetAt: number}>();
  return {
    consume: webContentsId => {
      const timestamp = now();
      const state = states.get(webContentsId);
      if (!state || timestamp >= state.resetAt) {
        states.set(webContentsId, {count: 1, resetAt: timestamp + rateLimit.windowMs});
        return;
      }
      if (state.count >= rateLimit.maxRequests) {
        throw new Error('IPC request rate limit exceeded.');
      }
      state.count += 1;
    },
  };
};

export const executeAuthorizedIpc = async <Request, Response>(
  registry: ViewIdentityRegistry,
  contract: AuthorizedIpcContract<Request, Response>,
  event: SenderIdentity,
  request: unknown,
  handler: AuthorizedIpcHandler<Request, Response>,
  rateLimiter?: RequestRateLimiter,
): Promise<Response> => {
  validateContractPolicy(contract);
  const identity = registry.authorize(event, contract.capability);

  if (!contract.viewTypes.includes(identity.viewType)) {
    throw new Error('IPC sender view type is not authorized.');
  }
  if (contract.rateLimit !== 'not-required') {
    if (!rateLimiter) {
      throw new Error('IPC contract requires a bound rate limiter.');
    }
    rateLimiter.consume(identity.webContents.id);
  }
  if (!contract.isRequest(request)) {
    throw new Error('IPC request payload is invalid.');
  }

  const response = await handler(identity, request);
  if (!contract.isResponse(response)) {
    throw new Error('IPC response payload is invalid.');
  }
  return response;
};

export const bindAuthorizedIpc = <Request, Response>(
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  contract: AuthorizedIpcContract<Request, Response>,
  handler: AuthorizedIpcHandler<Request, Response>,
  now: () => number = Date.now,
): (() => void) => {
  validateContractPolicy(contract);
  const rateLimiter = createRequestRateLimiter(contract.rateLimit, now);
  ipc.handle(contract.channel, (event, request) =>
    executeAuthorizedIpc(registry, contract, event, request, handler, rateLimiter),
  );
  return () => ipc.removeHandler(contract.channel);
};
