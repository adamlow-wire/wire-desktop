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

export const SECURE_SHELL_SCHEME = 'wire-app';
export const SECURE_SHELL_ORIGIN = `${SECURE_SHELL_SCHEME}://shell`;
export const SECURE_SHELL_RUNTIME_INFO_CHANNEL = 'wire-secure-shell:runtime-info:v1';
export const SECURE_SHELL_CONTRACT_VERSION = 1 as const;
export const SECURE_SHELL_RUNTIME_INFO_CAPABILITY = 'runtime-info' as const;
