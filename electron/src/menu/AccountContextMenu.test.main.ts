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

import {BrowserWindow, ContextMenuParams, MenuItemConstructorOptions} from 'electron';

import * as assert from 'assert';

import {attachAccountContextMenu, ContextMenuDependencies, showAccountContextMenu} from './AccountContextMenu';

const editFlags = (overrides: Partial<ContextMenuParams['editFlags']> = {}): ContextMenuParams['editFlags'] => ({
  canCopy: false,
  canCut: false,
  canDelete: false,
  canEditRichly: false,
  canPaste: false,
  canRedo: false,
  canSelectAll: false,
  canUndo: false,
  ...overrides,
});

const params = (overrides: Partial<ContextMenuParams> = {}): ContextMenuParams =>
  ({
    dictionarySuggestions: [],
    editFlags: editFlags(),
    isEditable: false,
    linkURL: '',
    mediaType: 'none',
    selectionText: '',
    srcURL: '',
    x: 10,
    y: 20,
    ...overrides,
  } as ContextMenuParams);

const setup = () => {
  const menus: MenuItemConstructorOptions[][] = [];
  const copied: string[] = [];
  const calls: string[] = [];
  const sent: unknown[] = [];
  let fallback: unknown = '';
  const contents = {
    copy: () => calls.push('copy'),
    cut: () => calls.push('cut'),
    executeJavaScript: async () => fallback,
    on: () => contents,
    paste: () => calls.push('paste'),
    replaceMisspelling: (suggestion: string) => calls.push(`replace:${suggestion}`),
    selectAll: () => calls.push('select-all'),
    send: (channel: string, action: unknown) => sent.push({action, channel}),
  };
  const dependencies: ContextMenuDependencies = {
    buildMenu: template => {
      menus.push(template);
      return {popup: () => undefined};
    },
    copyText: text => copied.push(text),
    getText: label => label,
  };
  return {
    calls,
    copied,
    dependencies,
    menus,
    sent,
    setFallback: (value: unknown) => {
      fallback = value;
    },
    show: (input: ContextMenuParams) => showAccountContextMenu(contents, {} as BrowserWindow, input, dependencies),
  };
};

const click = (item: MenuItemConstructorOptions): void => {
  assert.strictEqual(typeof item.click, 'function');
  (item.click as () => void)();
};

describe('account context menu', () => {
  it('runs edit operations on the account web contents and preserves enabled flags and spelling suggestions', async () => {
    const test = setup();
    await test.show(
      params({
        dictionarySuggestions: ['Wire'],
        editFlags: editFlags({canCopy: true, canPaste: true, canSelectAll: true}),
        isEditable: true,
      }),
    );

    assert.deepStrictEqual(
      test.menus[0].map(item => ({enabled: item.enabled, label: item.label, type: item.type})),
      [
        {enabled: false, label: 'menuCut', type: undefined},
        {enabled: true, label: 'menuCopy', type: undefined},
        {enabled: true, label: 'menuPaste', type: undefined},
        {enabled: undefined, label: undefined, type: 'separator'},
        {enabled: true, label: 'menuSelectAll', type: undefined},
        {enabled: undefined, label: undefined, type: 'separator'},
        {enabled: undefined, label: 'Wire', type: undefined},
      ],
    );
    click(test.menus[0][0]);
    click(test.menus[0][1]);
    click(test.menus[0][2]);
    click(test.menus[0][4]);
    click(test.menus[0][6]);
    assert.deepStrictEqual(test.calls, ['cut', 'copy', 'paste', 'select-all', 'replace:Wire']);
  });

  it('keeps image fetching in the account preload', async () => {
    const test = setup();
    await test.show(params({mediaType: 'image', srcURL: 'https://wire.example/picture.png'}));

    click(test.menus[0][0]);
    click(test.menus[0][1]);
    assert.deepStrictEqual(test.sent, [
      {
        action: {kind: 'save', sourceUrl: 'https://wire.example/picture.png'},
        channel: 'wire-desktop:context-menu-image-action',
      },
      {
        action: {kind: 'copy', sourceUrl: 'https://wire.example/picture.png'},
        channel: 'wire-desktop:context-menu-image-action',
      },
    ]);
  });

  it('copies links directly and preserves the DOM text fallback', async () => {
    const test = setup();
    await test.show(params({linkURL: 'mailto:person@wire.com'}));
    click(test.menus[0][0]);
    test.setFallback('surrounding message');
    await test.show(params({editFlags: editFlags({canSelectAll: true})}));
    click(test.menus[1][0]);

    assert.deepStrictEqual(test.copied, ['person@wire.com', 'surrounding message']);
  });

  it('does not show a menu for empty fallback content or unrelated context', async () => {
    const test = setup();
    await test.show(params({editFlags: editFlags({canSelectAll: true})}));
    await test.show(params());
    assert.deepStrictEqual(test.menus, []);
  });

  it('attaches the policy to Electron context-menu events', async () => {
    const test = setup();
    let listener: ((event: Electron.Event, input: ContextMenuParams) => void) | undefined;
    const contents = {
      copy: () => undefined,
      cut: () => undefined,
      executeJavaScript: async () => '',
      on: (_event: string, value: typeof listener) => {
        listener = value;
        return contents;
      },
      paste: () => undefined,
      replaceMisspelling: () => undefined,
      selectAll: () => undefined,
      send: () => undefined,
    };

    attachAccountContextMenu(contents as unknown as Electron.WebContents, {} as BrowserWindow, test.dependencies);
    assert.ok(listener);
    listener({} as Electron.Event, params({selectionText: 'selected text'}));
    await Promise.resolve();
    click(test.menus[0][0]);

    assert.deepStrictEqual(test.copied, ['selected text']);
  });
});
