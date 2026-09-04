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

const LOCALE_ARGUMENT = '--wire-desktop-locale=';
const USER_DATA_ARGUMENT = '--wire-desktop-user-data=';

export interface RendererRuntimeValues {
  readonly locale: string;
  readonly userDataPath: string;
}

const encodeArgument = (prefix: string, value: string): string => `${prefix}${encodeURIComponent(value)}`;

const readArgument = (argv: readonly string[], prefix: string): string | undefined => {
  const argument = argv.find(value => value.startsWith(prefix));
  if (!argument) {
    return undefined;
  }
  try {
    return decodeURIComponent(argument.slice(prefix.length));
  } catch {
    return undefined;
  }
};

export const createRendererRuntimeArguments = (values: RendererRuntimeValues): string[] => [
  encodeArgument(LOCALE_ARGUMENT, values.locale),
  encodeArgument(USER_DATA_ARGUMENT, values.userDataPath),
];

export const readRendererLocale = (argv: readonly string[] = process.argv): string | undefined =>
  readArgument(argv, LOCALE_ARGUMENT);

export const readRendererUserDataPath = (argv: readonly string[] = process.argv): string | undefined =>
  readArgument(argv, USER_DATA_ARGUMENT);
