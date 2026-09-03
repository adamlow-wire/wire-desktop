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

import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {
  BADGE_COUNT_CAPABILITY,
  BADGE_COUNT_CHANNEL,
  BadgeCountRequest,
  MAX_BADGE_UPDATES_PER_MINUTE,
} from './BadgeCountContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {BADGE_COUNT_CAPABILITY, BADGE_COUNT_CHANNEL, MAX_BADGE_UPDATES_PER_MINUTE} from './BadgeCountContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: BadgeCountRequest): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

type BadgeCountBoundary = (count: number, ignoreFlash: boolean) => void;

const ALLOWED_REQUEST_KEYS = new Set(['count', 'ignoreFlash']);

const isBadgeCountRequest = (value: unknown): value is BadgeCountRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<BadgeCountRequest>;
  const keys = Object.keys(value);
  return (
    keys.length === ALLOWED_REQUEST_KEYS.size &&
    keys.every(key => ALLOWED_REQUEST_KEYS.has(key)) &&
    Number.isSafeInteger(request.count) &&
    request.count! >= 0 &&
    typeof request.ignoreFlash === 'boolean'
  );
};

const badgeCountContract: AuthorizedIpcContract<BadgeCountRequest, void> = Object.freeze({
  capability: BADGE_COUNT_CAPABILITY,
  channel: BADGE_COUNT_CHANNEL,
  failureMode: 'reject',
  isRequest: isBadgeCountRequest,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_BADGE_UPDATES_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['application-shell'] as const),
});

export const requestBadgeCountUpdate = async (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  count: number,
  ignoreFlash: boolean,
): Promise<void> => {
  try {
    await ipc.invoke(BADGE_COUNT_CHANNEL, {count, ignoreFlash});
  } catch (error) {
    logger.error('Failed to update the application badge count.', error);
  }
};

export const bindBadgeCountIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  updateBadgeCount: BadgeCountBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, badgeCountContract, (_identity, request) =>
    updateBadgeCount(request.count, request.ignoreFlash),
  );
