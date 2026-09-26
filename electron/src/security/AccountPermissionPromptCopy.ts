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

import type {i18nLanguageIdentifier} from '../locale/languages';

import type {AccountPermissionScope} from './AccountPermissionPolicy';

type Translate = (key: i18nLanguageIdentifier) => string;

const scopeLabels = {
  audio: 'permissionMicrophone',
  video: 'permissionCamera',
  notifications: 'permissionNotifications',
} as const;

export function createAccountPermissionPromptCopy(
  origin: string,
  scopes: readonly AccountPermissionScope[],
  translate: Translate,
): {title: string; detail: string} {
  return {
    title: translate('permissionPromptTitle'),
    detail: `${origin}\n\n${scopes.map(scope => translate(scopeLabels[scope])).join('\n')}`,
  };
}
