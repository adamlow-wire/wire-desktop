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

export const ACCOUNT_PERMISSION_PROMPT_URL = 'wire-app://shell/html/account-permission.html';
export const ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL = 'wire-desktop:permission-prompt:model:v1';
export const ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL = 'wire-desktop:permission-prompt:ready:v1';
export const ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL = 'wire-desktop:permission-prompt:decision:v1';

export interface AccountPermissionPromptModel {
  readonly brand: string;
  readonly title: string;
  readonly origin: string;
  readonly originLabel: string;
  readonly allow: string;
  readonly cancel: string;
  readonly scopes: readonly {readonly label: string; readonly reason: string}[];
}

const bounded = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value);

export const isAccountPermissionPromptModel = (value: unknown): value is AccountPermissionPromptModel => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const model = value as Partial<AccountPermissionPromptModel>;
  return (
    Object.keys(value).length === 7 &&
    bounded(model.brand, 96) &&
    bounded(model.title, 256) &&
    bounded(model.origin, 2048) &&
    bounded(model.originLabel, 128) &&
    bounded(model.allow, 128) &&
    bounded(model.cancel, 128) &&
    Array.isArray(model.scopes) &&
    model.scopes.length >= 1 &&
    model.scopes.length <= 3 &&
    model.scopes.every(
      scope =>
        scope &&
        typeof scope === 'object' &&
        Object.keys(scope).length === 2 &&
        bounded(scope.label, 128) &&
        bounded(scope.reason, 512),
    )
  );
};

export const isOwnedPermissionPromptSender = (
  event: {sender: unknown; senderFrame: unknown},
  contents: {mainFrame: unknown; session: unknown; getURL(): string},
  targetSession: unknown,
): boolean => {
  try {
    return (
      event.sender === contents &&
      event.senderFrame !== null &&
      event.senderFrame === contents.mainFrame &&
      contents.session === targetSession &&
      contents.getURL() === ACCOUNT_PERMISSION_PROMPT_URL
    );
  } catch {
    return false;
  }
};
