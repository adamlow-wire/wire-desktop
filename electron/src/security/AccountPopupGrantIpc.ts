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

import type {HandlerDetails} from 'electron';

import {randomBytes} from 'crypto';

import {
  ACCOUNT_POPUP_GRANT_CAPABILITY,
  ACCOUNT_POPUP_GRANT_CHANNEL,
  ACCOUNT_POPUP_GRANT_FEATURE,
  ACCOUNT_POPUP_GRANT_FRAME_PREFIX,
  AccountPopupGrantRequest,
} from './AccountPopupGrantContract';
import {AuthorizedIpcContract, bindAuthorizedSyncIpc} from './AuthorizedIpc';
import {selectAccountPopup} from './NavigationPolicy';
import {
  AuthorizedViewIdentity,
  SenderIdentity,
  ViewIdentityRegistry,
  WebContentsIdentity,
} from './ViewIdentityRegistry';

interface SyncSenderIdentity extends SenderIdentity {
  returnValue?: unknown;
}

interface SyncIpcBinding {
  on(channel: string, listener: (event: SyncSenderIdentity, request: unknown) => void): void;
  removeListener(channel: string, listener: (event: SyncSenderIdentity, request: unknown) => void): void;
}

interface Grant {
  identity: AuthorizedViewIdentity;
  destination: string;
  frameName: string;
  expiresAt: number;
}

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_LIFETIME_MS = 5_000;
const MAX_PENDING_GRANTS = 16;
const MAX_FEATURES_LENGTH = 4_096;

const isRequest = (value: unknown): value is AccountPopupGrantRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  const request = value as Partial<AccountPopupGrantRequest>;
  return (
    keys.length === 2 &&
    keys.includes('url') &&
    keys.includes('frameName') &&
    typeof request.url === 'string' &&
    request.url.length <= 8_192 &&
    typeof request.frameName === 'string' &&
    request.frameName.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(request.frameName)
  );
};

const contract: AuthorizedIpcContract<AccountPopupGrantRequest, string> = Object.freeze({
  capability: ACCOUNT_POPUP_GRANT_CAPABILITY,
  channel: ACCOUNT_POPUP_GRANT_CHANNEL,
  failureMode: 'reject',
  isRequest,
  isResponse: (value: unknown): value is string => typeof value === 'string' && TOKEN_PATTERN.test(value),
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: 120, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

const readToken = (features: string): string | undefined => {
  if (features.length > MAX_FEATURES_LENGTH) {
    return undefined;
  }
  const markers = features
    .split(',')
    .map(feature => feature.trim())
    .filter(feature => feature.startsWith(`${ACCOUNT_POPUP_GRANT_FEATURE}=`));
  if (markers.length !== 1) {
    return undefined;
  }
  const token = markers[0].slice(ACCOUNT_POPUP_GRANT_FEATURE.length + 1);
  return TOKEN_PATTERN.test(token) ? token : undefined;
};

export interface AccountPopupGrants {
  consume(webContents: WebContentsIdentity, details: Pick<HandlerDetails, 'features' | 'frameName' | 'url'>): boolean;
  dispose(): void;
}

export const bindAccountPopupGrantIpc = (
  ipc: SyncIpcBinding,
  registry: ViewIdentityRegistry,
  now: () => number = Date.now,
): AccountPopupGrants => {
  const pending = new WeakMap<WebContentsIdentity, Map<string, Grant>>();
  const dispose = bindAuthorizedSyncIpc(ipc, registry, contract, (identity, request) => {
    // The sync request only mints a short-lived one-use grant. It never opens a window.
    const decision = selectAccountPopup({
      accountOrigin: identity.allowedOrigin,
      frameName: request.frameName,
      referrerUrl: '',
      sourceUrl: identity.mainFrame.url,
      trustedMainFrameGrant: true,
      url: request.url,
    });
    if (decision === 'deny') {
      throw new Error('Account popup destination is not allowed.');
    }
    const grants = pending.get(identity.webContents) ?? new Map<string, Grant>();
    for (const [token, grant] of grants) {
      if (grant.expiresAt <= now() || grant.identity !== identity) {
        grants.delete(token);
      }
    }
    if (grants.size >= MAX_PENDING_GRANTS) {
      throw new Error('Account popup grant capacity exceeded.');
    }
    const token = randomBytes(16).toString('hex');
    grants.set(token, {
      destination: request.url === '' ? '' : new URL(request.url, identity.mainFrame.url).href,
      expiresAt: now() + TOKEN_LIFETIME_MS,
      frameName: request.frameName,
      identity,
    });
    pending.set(identity.webContents, grants);
    return token;
  });

  return Object.freeze({
    consume: (
      webContents: WebContentsIdentity,
      details: Pick<HandlerDetails, 'features' | 'frameName' | 'url'>,
    ): boolean => {
      const featureToken = readToken(details.features);
      const frameToken = details.frameName.startsWith(ACCOUNT_POPUP_GRANT_FRAME_PREFIX)
        ? details.frameName.slice(ACCOUNT_POPUP_GRANT_FRAME_PREFIX.length)
        : undefined;
      if (
        frameToken &&
        (!TOKEN_PATTERN.test(frameToken) || details.features.includes(`${ACCOUNT_POPUP_GRANT_FEATURE}=`))
      ) {
        return false;
      }
      const token = featureToken ?? frameToken;
      const expectedFrameName = frameToken ? '_blank' : details.frameName;
      const grants = pending.get(webContents);
      if (!token || !grants) {
        return false;
      }
      const grant = grants.get(token);
      grants.delete(token);
      if (!grant || grant.expiresAt <= now() || grant.frameName !== expectedFrameName) {
        return false;
      }
      try {
        const current = registry.authorize(
          {sender: webContents, senderFrame: webContents.mainFrame},
          ACCOUNT_POPUP_GRANT_CAPABILITY,
        );
        return (
          current === grant.identity &&
          (grant.destination === ''
            ? details.url === '' || details.url === 'about:blank'
            : details.url === grant.destination)
        );
      } catch {
        return false;
      }
    },
    dispose,
  });
};
