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

import {parseNetworkNavigation} from './NavigationPolicy';
import {AuthorizedViewIdentity, ViewIdentityRegistry, WebContentsIdentity} from './ViewIdentityRegistry';

export const ACCOUNT_PERMISSION_CAPABILITY = 'account:permission';
export type AccountPermissionScope = 'audio' | 'video' | 'notifications';
export interface AccountPermissionDetails {
  isMainFrame?: boolean;
  requestingUrl?: string;
  securityOrigin?: string;
  mediaTypes?: readonly unknown[];
  mediaType?: unknown;
}
export interface AccountPermissionConsent {
  canPrompt(identity: AuthorizedViewIdentity): boolean;
  ask(
    identity: AuthorizedViewIdentity,
    scopes: readonly AccountPermissionScope[],
    signal: AbortSignal,
  ): Promise<boolean>;
}

export class AccountPermissionPolicy {
  private readonly grants = new Set<AccountPermissionScope>();
  private generation = 0;
  private pending?: AbortController;

  constructor(
    private readonly registry: ViewIdentityRegistry,
    private readonly owner: AuthorizedViewIdentity,
    private readonly consent: AccountPermissionConsent,
  ) {}

  async request(
    sender: WebContentsIdentity | null,
    permission: string,
    details: AccountPermissionDetails,
  ): Promise<boolean> {
    if (!this.authorized(sender, details) || !this.sameOrigin(details.requestingUrl)) {
      return false;
    }
    const scopes = this.scopes(permission, details.mediaTypes);
    if (!scopes) {
      return false;
    }
    const missing = scopes.filter(scope => !this.grants.has(scope));
    if (missing.length === 0) {
      return true;
    }
    if (this.pending || !this.consent.canPrompt(this.owner)) {
      return false;
    }
    const generation = this.generation;
    const consent = new AbortController();
    this.pending = consent;
    try {
      const accepted = await this.consent.ask(this.owner, Object.freeze(missing), consent.signal);
      if (
        accepted !== true ||
        generation !== this.generation ||
        !this.authorized(sender, details) ||
        !this.consent.canPrompt(this.owner)
      ) {
        return false;
      }
      missing.forEach(scope => this.grants.add(scope));
      return true;
    } finally {
      this.pending = undefined;
    }
  }

  check(
    sender: WebContentsIdentity | null,
    permission: string,
    origin: string,
    details: AccountPermissionDetails,
  ): boolean {
    if (!this.authorized(sender, details) || !this.sameOrigin(origin)) {
      return false;
    }
    const scopes = this.scopes(permission, [details.mediaType]);
    return !!scopes && scopes.every(scope => this.grants.has(scope));
  }

  revoke(): void {
    this.generation++;
    this.grants.clear();
    this.pending?.abort();
  }

  private sameOrigin(value: string | undefined): boolean {
    return typeof value === 'string' && parseNetworkNavigation(value)?.origin === this.owner.allowedOrigin;
  }

  private authorized(sender: WebContentsIdentity | null, details: AccountPermissionDetails): boolean {
    if (
      !sender ||
      !details ||
      details.isMainFrame !== true ||
      this.owner.viewType !== 'account' ||
      (details.requestingUrl !== undefined && !this.sameOrigin(details.requestingUrl)) ||
      (details.securityOrigin !== undefined && !this.sameOrigin(details.securityOrigin))
    ) {
      return false;
    }
    try {
      return (
        this.registry.authorize({sender, senderFrame: sender.mainFrame}, ACCOUNT_PERMISSION_CAPABILITY) === this.owner
      );
    } catch {
      return false;
    }
  }

  private scopes(permission: string, mediaTypes: readonly unknown[] | undefined): AccountPermissionScope[] | undefined {
    if (permission === 'notifications') {
      return ['notifications'];
    }
    if (
      permission !== 'media' ||
      !Array.isArray(mediaTypes) ||
      mediaTypes.length < 1 ||
      mediaTypes.length > 2 ||
      new Set(mediaTypes).size !== mediaTypes.length ||
      !mediaTypes.every(type => type === 'audio' || type === 'video')
    ) {
      return undefined;
    }
    return [...mediaTypes] as AccountPermissionScope[];
  }
}
