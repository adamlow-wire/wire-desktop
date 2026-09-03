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

export const ABOUT_LOCALE_READ_CHANNEL = 'wire-desktop:about:locale-read:v1';
export const ABOUT_LOCALE_READ_CAPABILITY = 'about:locale-read';
export const WEBAPP_VERSIONS_REPORT_CHANNEL = 'wire-desktop:webapp-versions:report:v1';
export const WEBAPP_VERSIONS_REPORT_CAPABILITY = 'webapp-versions:report';
export const MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE = 5;
export const MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE = 30;
export const MAX_ABOUT_LOCALE_LABELS = 32;
export const MAX_ABOUT_LOCALE_LABEL_LENGTH = 64;
export const MAX_ABOUT_LOCALE_VALUE_LENGTH = 2_048;
export const MAX_WEBAPP_VERSION_LENGTH = 256;

export interface AboutLocaleRequest {
  readonly labels: readonly string[];
}

export type AboutLocaleResponse = Readonly<Record<string, string>>;

export interface WebappVersions {
  readonly webappVersion: string;
  readonly webappAVSVersion?: string;
}
