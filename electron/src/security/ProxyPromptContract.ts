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

export const PROXY_PROMPT_LOCALE_READ_CHANNEL = 'wire-desktop:proxy-prompt:locale-read:v1';
export const PROXY_PROMPT_SUBMIT_CHANNEL = 'wire-desktop:proxy-prompt:submit:v1';
export const PROXY_PROMPT_CANCEL_CHANNEL = 'wire-desktop:proxy-prompt:cancel:v1';
export const PROXY_PROMPT_LOCALE_READ_CAPABILITY = 'proxy-prompt:locale-read';
export const PROXY_PROMPT_SUBMIT_CAPABILITY = 'proxy-prompt:submit';
export const PROXY_PROMPT_CANCEL_CAPABILITY = 'proxy-prompt:cancel';
export const MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE = 5;
export const MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE = 5;
export const MAX_PROXY_PROMPT_LOCALE_LABELS = 32;
export const MAX_PROXY_PROMPT_LOCALE_LABEL_LENGTH = 64;
export const MAX_PROXY_PROMPT_LOCALE_VALUE_LENGTH = 2_048;
export const MAX_PROXY_PROMPT_USERNAME_LENGTH = 1_024;
export const MAX_PROXY_PROMPT_PASSWORD_LENGTH = 4_096;

export interface ProxyPromptLocaleRequest {
  readonly labels: readonly string[];
}

export type ProxyPromptLocaleResponse = Readonly<Record<string, string>>;

export interface ProxyPromptCredentials {
  readonly password: string;
  readonly username: string;
}
