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

import {BrowserWindow, clipboard, ContextMenuParams, Menu, MenuItemConstructorOptions, WebContents} from 'electron';

import * as locale from '../locale';
import {CONTEXT_MENU_IMAGE_ACTION_CHANNEL, ContextMenuImageAction} from '../preload/menu/ContextMenuImageAction';
import {selectContextMenuAction} from '../preload/menu/contextMenuPolicy';

interface ContextMenuContents {
  copy(): void;
  cut(): void;
  executeJavaScript(script: string): Promise<unknown>;
  on(event: 'context-menu', listener: (event: Electron.Event, params: ContextMenuParams) => void): this;
  paste(): void;
  replaceMisspelling(suggestion: string): void;
  selectAll(): void;
  send(channel: string, action: ContextMenuImageAction): void;
}

export interface ContextMenuDependencies {
  readonly buildMenu: (template: MenuItemConstructorOptions[]) => Pick<Menu, 'popup'>;
  readonly copyText: (text: string) => void;
  readonly getText: (label: locale.i18nLanguageIdentifier) => string;
}

const defaultDependencies: ContextMenuDependencies = {
  buildMenu: template => Menu.buildFromTemplate(template),
  copyText: text => clipboard.writeText(text),
  getText: label => locale.getText(label),
};

const popup = (
  template: MenuItemConstructorOptions[],
  window: BrowserWindow,
  dependencies: ContextMenuDependencies,
): void => {
  dependencies.buildMenu(template).popup({window});
};

const copyTemplate = (text: string, dependencies: ContextMenuDependencies): MenuItemConstructorOptions[] => [
  {
    click: () => dependencies.copyText(text),
    label: dependencies.getText('menuCopy'),
  },
];

const editableTemplate = (
  params: ContextMenuParams,
  contents: ContextMenuContents,
  dependencies: ContextMenuDependencies,
): MenuItemConstructorOptions[] => {
  const template: MenuItemConstructorOptions[] = [
    {click: () => contents.cut(), enabled: params.editFlags.canCut, label: dependencies.getText('menuCut')},
    {click: () => contents.copy(), enabled: params.editFlags.canCopy, label: dependencies.getText('menuCopy')},
    {click: () => contents.paste(), enabled: params.editFlags.canPaste, label: dependencies.getText('menuPaste')},
    {type: 'separator'},
    {
      click: () => contents.selectAll(),
      enabled: params.editFlags.canSelectAll,
      label: dependencies.getText('menuSelectAll'),
    },
  ];

  if (params.dictionarySuggestions.length > 0) {
    template.push({type: 'separator'});
    for (const suggestion of params.dictionarySuggestions) {
      template.push({click: () => contents.replaceMisspelling(suggestion), label: suggestion});
    }
  }
  return template;
};

const imageTemplate = (
  sourceUrl: string,
  contents: ContextMenuContents,
  dependencies: ContextMenuDependencies,
): MenuItemConstructorOptions[] => [
  {
    click: () => contents.send(CONTEXT_MENU_IMAGE_ACTION_CHANNEL, {kind: 'save', sourceUrl}),
    label: dependencies.getText('menuSavePictureAs'),
  },
  {
    click: () => contents.send(CONTEXT_MENU_IMAGE_ACTION_CHANNEL, {kind: 'copy', sourceUrl}),
    label: dependencies.getText('menuCopyPicture'),
  },
];

const readFallbackText = async (contents: ContextMenuContents, params: ContextMenuParams): Promise<string> => {
  const script = `(() => {
    let element = document.elementFromPoint(${JSON.stringify(params.x)}, ${JSON.stringify(params.y)});
    while (element && element !== document && !element.classList.contains('text')) element = element.parentNode;
    return element ? (element.innerText || '').trim() : '';
  })()`;
  const value = await contents.executeJavaScript(script);
  return typeof value === 'string' ? value : '';
};

export const showAccountContextMenu = async (
  contents: ContextMenuContents,
  window: BrowserWindow,
  params: ContextMenuParams,
  dependencies: ContextMenuDependencies = defaultDependencies,
): Promise<void> => {
  const action = selectContextMenuAction({
    canCopy: params.editFlags.canCopy,
    canSelectAll: params.editFlags.canSelectAll,
    isEditable: params.isEditable,
    linkURL: params.linkURL,
    mediaType: params.mediaType,
    selectionText: params.selectionText,
  });

  if (action.kind === 'editable') {
    popup(editableTemplate(params, contents, dependencies), window, dependencies);
  } else if (action.kind === 'image') {
    popup(imageTemplate(params.srcURL, contents, dependencies), window, dependencies);
  } else if (action.kind === 'copy') {
    popup(copyTemplate(action.text, dependencies), window, dependencies);
  } else if (action.kind === 'select-all-fallback') {
    const text = params.selectionText || (await readFallbackText(contents, params));
    if (text) {
      popup(copyTemplate(text, dependencies), window, dependencies);
    }
  }
};

export const attachAccountContextMenu = (
  contents: WebContents,
  window: BrowserWindow,
  dependencies: ContextMenuDependencies = defaultDependencies,
): void => {
  contents.on('context-menu', (_event, params) => {
    void showAccountContextMenu(contents, window, params, dependencies);
  });
};
