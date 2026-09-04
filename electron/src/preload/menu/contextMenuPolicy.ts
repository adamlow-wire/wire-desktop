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

export interface ContextMenuPolicyInput {
  readonly canCopy: boolean;
  readonly canSelectAll: boolean;
  readonly isEditable: boolean;
  readonly linkURL: string;
  readonly mediaType: string;
  readonly selectionText: string;
}

export type ContextMenuAction =
  | {readonly kind: 'copy'; readonly text: string}
  | {readonly kind: 'editable'}
  | {readonly kind: 'image'}
  | {readonly kind: 'select-all-fallback'}
  | {readonly kind: 'none'};

export const selectContextMenuAction = (input: ContextMenuPolicyInput): ContextMenuAction => {
  if (input.isEditable) {
    return {kind: 'editable'};
  }

  if (input.mediaType === 'image') {
    return {kind: 'image'};
  }

  if (input.linkURL) {
    return {kind: 'copy', text: input.linkURL.replace(/^mailto:/, '')};
  }

  if (input.selectionText || input.canCopy) {
    return {kind: 'copy', text: input.selectionText};
  }

  if (input.canSelectAll) {
    return {kind: 'select-all-fallback'};
  }

  return {kind: 'none'};
};
