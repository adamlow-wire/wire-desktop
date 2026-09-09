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

import {app, BrowserWindow, ipcMain, session, WebContents} from 'electron';
import {spy, restore, stub} from 'sinon';

import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';
import path from 'path';

import {Availability} from '@wireapp/protocol-messaging';

import {AccountController, AccountControllerOptions} from './AccountController';
import {parseLegacyAccounts} from './AccountProfile';
import {AccountState} from './AccountState';
import {AccountViews} from './AccountViews';

import {EVENT_TYPE} from '../lib/eventType';
import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
import {snapshotRendererEnvironment} from '../runtime/rendererEnvironment';
import {createRendererRuntimeArguments} from '../runtime/rendererRuntimeArguments';
import {ACCOUNT_CONTROL_CAPABILITY} from '../security/AccountControlContract';
import {bindAccountControlIpc} from '../security/AccountControlIpc';
import {ACCOUNT_EVENT_CAPABILITY} from '../security/AccountEventContract';
import {bindAccountEventIpc} from '../security/AccountEventIpc';
import {MANAGED_CONFIG_CHANNEL} from '../security/ManagedConfigContract';
import {registerApplicationShellIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {WRAPPER_RELOAD_CAPABILITY} from '../security/WrapperReloadContract';

describe('production account controller integration', () => {
  let server: Server;
  let origin: string;
  let window: BrowserWindow;
  let state: AccountState;
  let views: AccountViews;
  let registry: ViewIdentityRegistry;
  let controller: AccountController;
  let options: AccountControllerOptions;
  let disposeControl: () => void;
  let disposeEvents: () => void;
  let records: ReturnType<typeof parseLegacyAccounts>;
  const preload = path.join(process.cwd(), 'electron/test/fixtures/account-controller-preload.js');
  const send = (contents: WebContents, method: string, argument?: unknown) =>
    contents.executeJavaScript(
      `window.accountFixture.${method}(${argument === undefined ? '' : JSON.stringify(argument)})`,
    );
  const identity = (contents: WebContents) =>
    registry.authorize({sender: contents, senderFrame: contents.mainFrame}, ACCOUNT_EVENT_CAPABILITY);

  beforeEach(async () => {
    server = createServer((_request, response) =>
      response.end('<!doctype html><title>Account controller fixture</title>'),
    );
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    records = parseLegacyAccounts(
      JSON.stringify({
        accounts: [
          {id: randomUUID(), sessionID: randomUUID(), userID: 'first', visible: true},
          {id: randomUUID(), sessionID: randomUUID(), userID: 'second'},
        ],
      }),
      3,
    );
    state = new AccountState(records, 3, () => undefined);
    registry = new ViewIdentityRegistry();
    window = new BrowserWindow({
      show: false,
      webPreferences: {preload, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false},
    });
    registerApplicationShellIdentity(registry, window.webContents, `${origin}/`, [ACCOUNT_CONTROL_CAPABILITY]);
    await window.loadURL(origin);
    views = new AccountViews({
      window,
      registry,
      preload,
      additionalArguments: [],
      capabilities: [ACCOUNT_EVENT_CAPABILITY, WRAPPER_RELOAD_CAPABILITY],
      configure: async () => undefined,
      lost: () => undefined,
    });
    options = {
      state,
      views,
      registry,
      destination: account => account.webappUrl ?? origin,
      session: account =>
        account.sessionID ? session.fromPartition(`persist:${account.sessionID}`) : session.defaultSession,
      clearData: async (account, targetSession) => {
        assert.equal(views.has(account.id), false);
        await targetSession.clearStorageData();
        await targetSession.clearCache();
      },
      approveEnvironment: async () => {
        throw new Error('Destination not approved');
      },
      changed: () => undefined,
      badge: () => undefined,
      loaded: () => undefined,
      menu: async () => undefined,
    };
    controller = new AccountController(options);
    disposeControl = bindAccountControlIpc(ipcMain, registry, controller);
    disposeEvents = bindAccountEventIpc(ipcMain, registry, controller.receive);
    await controller.start();
  });

  afterEach(async () => {
    restore();
    disposeControl?.();
    disposeEvents?.();
    await views?.dispose();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    for (const account of records ?? []) {
      await options.session(account).clearStorageData();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('[regression][CAP-001] queues menu commands for their original account until that account is ready', async () => {
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    const firstSend = spy(first, 'send');
    const secondSend = spy(second, 'send');
    await controller.menuAction(EVENT_TYPE.CONVERSATION.SEARCH);
    await controller.select(records[1].id);
    await controller.receive(identity(second), {type: 'loaded'});
    assert.equal(firstSend.callCount, 0);
    assert.equal(secondSend.callCount, 0);
    await controller.receive(identity(first), {type: 'loaded'});
    assert.deepEqual(firstSend.args, [[EVENT_TYPE.CONVERSATION.SEARCH]]);
    await controller.receive(identity(first), {type: 'loaded'});
    assert.equal(firstSend.callCount, 1);
    await controller.menuAction(EVENT_TYPE.PREFERENCES.SHOW);
    assert.deepEqual(secondSend.args, [[EVENT_TYPE.PREFERENCES.SHOW]]);
    await assert.rejects(controller.menuAction('arbitrary-channel'), /Unknown desktop menu/);
    assert.equal(secondSend.callCount, 1);
  });

  it('[regression][CAP-001] applies each native edit shortcut only to the selected account', async () => {
    const methods = ['copy', 'cut', 'paste', 'redo', 'selectAll', 'undo'] as const;
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    const firstEdits = methods.map(method => stub(first, method));
    const secondEdits = methods.map(method => stub(second, method));
    for (const [index, action] of Object.values(EVENT_TYPE.EDIT).entries()) {
      await controller.desktopAction(action, []);
      firstEdits.forEach((edit, editIndex) => assert.equal(edit.callCount, editIndex <= index ? 1 : 0));
    }
    firstEdits.forEach(edit => assert.equal(edit.callCount, 1));
    secondEdits.forEach(edit => assert.equal(edit.callCount, 0));
    await controller.desktopAction(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, [1]);
    assert.equal(state.get(records[1].id).visible, true);
    await controller.desktopAction(EVENT_TYPE.EDIT.COPY, []);
    assert.equal(firstEdits[0].callCount, 1);
    assert.equal(secondEdits[0].callCount, 1);
  });

  it('[security-target][CAP-001] rejects unknown desktop actions and invalid shortcut arguments', async () => {
    const copy = stub(views.get(records[0].id), 'copy');
    for (const args of [[-1], [2], [0.5], ['1'], [], [1, 0]]) {
      await assert.rejects(controller.desktopAction(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, args));
    }
    await assert.rejects(controller.desktopAction(EVENT_TYPE.EDIT.COPY, ['extra']));
    await assert.rejects(controller.desktopAction(EVENT_TYPE.UI.SYSTEM_MENU, [42]));
    await assert.rejects(controller.desktopAction('arbitrary-channel', []));
    assert.equal(state.get(records[0].id).visible, true);
    assert.equal(copy.callCount, 0);
  });

  it('[security-target][CAP-001] bounds pending menus and discards them when the account reloads', async () => {
    for (let index = 0; index < 32; index++) {
      await controller.menuAction(EVENT_TYPE.CONVERSATION.SEARCH);
    }
    await assert.rejects(controller.menuAction(EVENT_TYPE.CONVERSATION.SEARCH), /queue is full/);
    await controller.reload(records[0].id);
    const replacement = views.get(records[0].id);
    const sent = spy(replacement, 'send');
    await controller.receive(identity(replacement), {type: 'loaded'});
    assert.equal(sent.callCount, 0);
    await controller.menuAction(EVENT_TYPE.CONVERSATION.SEARCH);
    assert.deepEqual(sent.args, [[EVENT_TYPE.CONVERSATION.SEARCH]]);
  });

  it('[regression][CAP-001] routes version requests to the original account once ready', async () => {
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    const firstSend = spy(first, 'send');
    const secondSend = spy(second, 'send');
    await controller.desktopAction(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION, []);
    await controller.select(records[1].id);
    await controller.receive(identity(second), {type: 'loaded'});
    assert.equal(secondSend.callCount, 0);
    await controller.receive(identity(first), {type: 'loaded'});
    assert.deepEqual(firstSend.args, [[EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION]]);
    await assert.rejects(controller.desktopAction(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION, ['extra']));
    assert.equal(secondSend.callCount, 0);
  });

  it('[regression][CAP-001] reloads every native account while preserving selection and sessions', async () => {
    await controller.select(records[1].id);
    const previous = records.map(account => views.get(account.id));
    const sessions = previous.map(contents => contents.session);
    for (let index = 0; index < sessions.length; index++) {
      await sessions[index].cookies.set({url: origin, name: 'reload-owner', value: String(index)});
    }
    await controller.reloadAll(identity(previous[0]));
    assert.equal(state.get(records[1].id).visible, true);
    for (let index = 0; index < records.length; index++) {
      const replacement = views.get(records[index].id);
      assert.equal(previous[index].isDestroyed(), true);
      assert.equal(replacement.session, sessions[index]);
      assert.equal(
        (await replacement.session.cookies.get({url: origin, name: 'reload-owner'}))[0].value,
        String(index),
      );
    }
  });

  it('[security-target][CAP-001] rechecks queued reload authority before destroying any account', async () => {
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    const pending = controller.reloadAll(identity(first));
    registry.unregister(first.id);
    await assert.rejects(pending, /authorized/);
    assert.equal(views.get(records[0].id), first);
    assert.equal(views.get(records[1].id), second);
    assert.equal(first.isDestroyed(), false);
    assert.equal(second.isDestroyed(), false);
  });

  it('[regression][CAP-001] reloads healthy accounts even when another account cannot restart', async () => {
    const second = views.get(records[1].id);
    options.destination = account => {
      if (account.id === records[0].id) {
        throw new Error('Unavailable destination');
      }
      return origin;
    };
    await assert.rejects(controller.reloadAll(), /Some accounts failed/);
    assert.equal(views.has(records[0].id), false);
    assert.equal(second.isDestroyed(), true);
    assert.equal(views.has(records[1].id), true);
    assert.equal(controller.snapshots()[0].loadError, 'Account loading failed.');
    assert.equal(state.get(records[0].id).visible, true);
  });

  it('[migration][CAP-001] connects real shell controls to native view selection, unfinished-login reuse and cancellation', async () => {
    const first = records[0].id;
    const second = records[1].id;
    await send(window.webContents, 'select', second);
    assert.equal(state.get(second).visible, true);
    assert.equal(state.get(first).visible, false);
    await send(window.webContents, 'add');
    const added = state.snapshots().find(account => account.canCancel)!;
    records.push(state.get(added.id));
    assert.equal(views.has(added.id), true);
    await send(window.webContents, 'add');
    assert.equal(state.snapshots().length, 3);
    await send(window.webContents, 'remove', added.id);
    assert.equal(views.has(added.id), false);
    assert.equal(state.snapshots().length, 2);
    assert.equal(state.get(second).visible, true);
  });

  it('[regression][CAP-001] keeps guest updates flowing while the native account menu is open', async () => {
    let closeMenu!: () => void;
    let opened!: () => void;
    const opening = new Promise<void>(resolve => {
      opened = resolve;
    });
    const first = views.get(records[0].id);
    options.menu = async account => {
      assert.equal(account.id, records[0].id);
      opened();
      await new Promise<void>(resolve => {
        closeMenu = resolve;
      });
    };
    const menu = controller.contextMenu(records[0].id);
    await opening;
    try {
      await controller.receive(identity(first), {type: 'metadata', data: {name: 'Updated while menu is open'}});
      assert.equal(state.get(records[0].id).name, 'Updated while menu is open');
      assert.equal(state.get(records[1].id).name, undefined);
    } finally {
      closeMenu();
      await menu;
    }
  });

  it('[migration][CAP-001] reloads only the target view, preserving its session and the selected account', async () => {
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    const firstSession = first.session;
    await firstSession.cookies.set({url: origin, name: 'retained', value: 'first'});
    await controller.select(records[1].id);
    await controller.reload(records[0].id);
    assert.equal(first.isDestroyed(), true);
    assert.equal(registry.has(first.id), false);
    assert.equal(views.get(records[0].id).session, firstSession);
    assert.equal(views.get(records[1].id), second);
    assert.equal(state.get(records[1].id).visible, true);
    assert.equal((await firstSession.cookies.get({url: origin}))[0].value, 'first');
    assert.equal(controller.snapshots().find(account => account.id === records[0].id)!.loadError, undefined);
  });

  it('[regression][CAP-001] publishes a recoverable per-account load failure without losing other accounts', async () => {
    const firstId = records[0].id;
    const second = views.get(records[1].id);
    const destination = options.destination;
    options.destination = account => {
      if (account.id === firstId) {
        throw new Error('Unavailable destination');
      }
      return destination(account);
    };
    const published: ReturnType<typeof controller.snapshots>[] = [];
    options.changed = accounts => published.push(accounts);
    await assert.rejects(controller.reload(firstId), /Unavailable destination/);
    assert.equal(views.has(firstId), false);
    assert.equal(views.get(records[1].id), second);
    assert.equal(state.snapshots().length, 2);
    assert.equal(published.at(-1)!.find(account => account.id === firstId)!.loadError, 'Account loading failed.');
    assert.equal(published.at(-1)!.find(account => account.id === firstId)!.isLoading, false);
    await controller.select(records[1].id);
    options.destination = destination;
    await controller.reload(firstId);
    assert.equal(views.has(firstId), true);
    assert.equal(controller.snapshots().find(account => account.id === firstId)!.loadError, undefined);
    assert.equal(state.get(records[1].id).visible, true);
  });

  it('[security-target][CAP-001] binds guest metadata and joins to the real sender and denies shell commands from accounts', async () => {
    const first = views.get(records[0].id);
    const second = views.get(records[1].id);
    await send(first, 'metadata', {name: 'First updated', userID: 'first', webappUrl: `${origin}/`});
    assert.equal(state.get(records[0].id).name, 'First updated');
    assert.equal(state.get(records[1].id).name, undefined);
    await assert.rejects(send(first, 'metadata', {name: 'Hostile', id: records[1].id}), /payload/);
    await assert.rejects(send(first, 'remove', records[1].id), /authorized/);
    await send(first, 'join', {code: 'code', key: 'key', domain: null});
    assert.deepEqual(await send(first, 'readJoins'), []);
    await send(first, 'loaded');
    assert.deepEqual(await send(first, 'readJoins'), [{code: 'code', key: 'key', domain: null}]);
    assert.deepEqual(await send(second, 'readJoins'), []);
    assert.equal(state.get(records[0].id).conversationJoinData, undefined);
    await send(first, 'loaded');
    assert.equal((await send(first, 'readJoins')).length, 1);
  });

  it('[security-target][CAP-001] revokes and closes the exact target before clearing only its cookies', async () => {
    const first = views.get(records[0].id);
    const firstIdentity = identity(first);
    const firstSession = first.session;
    const secondSession = views.get(records[1].id).session;
    await firstSession.cookies.set({url: origin, name: 'retained', value: 'first'});
    await secondSession.cookies.set({url: origin, name: 'retained', value: 'second'});
    await controller.receive(firstIdentity, {type: 'signed-out', clearData: true});
    assert.equal(first.isDestroyed(), true);
    assert.equal(registry.has(first.id), false);
    assert.deepEqual(await firstSession.cookies.get({url: origin}), []);
    assert.equal((await secondSession.cookies.get({url: origin}))[0].value, 'second');
    assert.equal(state.snapshots().length, 1);
    assert.equal(state.get(records[1].id).visible, true);
  });

  it('[migration][CAP-001] keeps storage and view when logout does not request clearing', async () => {
    const first = views.get(records[0].id);
    await first.session.cookies.set({url: origin, name: 'retained', value: 'first'});
    await send(first, 'signedOut', false);
    assert.equal(state.get(records[0].id).userID, undefined);
    assert.equal(views.get(records[0].id), first);
    assert.equal((await first.session.cookies.get({url: origin}))[0].value, 'first');
    assert.equal(state.get(records[1].id).userID, 'second');
  });

  it('[security-target][CAP-001] rejects queued guest authority revoked before execution and continues later work', async () => {
    const first = views.get(records[0].id);
    const owner = identity(first);
    const pending = controller.receive(owner, {type: 'metadata', data: {name: 'Revoked'}});
    registry.unregister(first.id);
    await assert.rejects(pending, /authorized/);
    assert.equal(state.get(records[0].id).name, undefined);
    await controller.select(records[1].id);
    assert.equal(state.get(records[1].id).visible, true);
  });

  it('[security-target][CAP-001] denies destination changes through both unapproved navigation and metadata', async () => {
    const first = views.get(records[0].id);
    const before = state.get(records[0].id);
    await assert.rejects(send(first, 'environment', 'file:///etc/passwd'), /Invalid account destination/);
    await assert.rejects(send(first, 'environment', 'https://unapproved.wire.test/'), /not approved/);
    await assert.rejects(send(first, 'metadata', {webappUrl: 'https://unapproved.wire.test/'}), /Metadata cannot/);
    assert.deepEqual(state.get(records[0].id), before);
    assert.equal(views.get(records[0].id), first);
  });

  it('[security-target][CAP-001] rechecks authority after asynchronous destination approval', async () => {
    const first = views.get(records[0].id);
    const owner = identity(first);
    options.approveEnvironment = async () => {
      registry.unregister(first.id);
      return `${origin}/approved`;
    };
    await assert.rejects(controller.receive(owner, {type: 'environment', url: `${origin}/candidate`}), /authorized/);
    assert.equal(state.get(records[0].id).webappUrl, undefined);
    assert.equal(views.get(records[0].id), first);
  });

  it('[migration][CAP-001] approved environment changes replace only the owning view and preserve its partition', async () => {
    const first = views.get(records[0].id);
    const firstSession = first.session;
    const second = views.get(records[1].id);
    options.approveEnvironment = async () => `${origin}/approved`;
    await controller.receive(identity(first), {type: 'environment', url: `${origin}/candidate`});
    const replacement = views.get(records[0].id);
    assert.notEqual(replacement.id, first.id);
    assert.equal(first.isDestroyed(), true);
    assert.equal(replacement.session, firstSession);
    assert.equal(new URL(replacement.getURL()).pathname, '/approved');
    assert.equal(state.get(records[0].id).webappUrl, `${origin}/approved`);
    assert.equal(views.get(records[1].id), second);
  });

  it('[security-target][CAP-001] preserves the account record when exact-session deletion fails', async () => {
    const first = views.get(records[0].id);
    const clearData = options.clearData;
    options.clearData = async () => {
      throw new Error('Storage deletion failed');
    };
    await assert.rejects(
      controller.receive(identity(first), {type: 'signed-out', clearData: true}),
      /Storage deletion failed/,
    );
    assert.equal(first.isDestroyed(), true);
    assert.equal(state.snapshots().length, 2);
    assert.equal(state.get(records[0].id).userID, 'first');
    assert.equal(views.has(records[1].id), true);
    options.clearData = clearData;
    await controller.remove(records[0].id);
    assert.equal(state.snapshots().length, 1);
    assert.equal(state.get(records[1].id).visible, true);
  });

  it('[migration][CAP-001] updates aggregate badges and busy suppression when a notification activates its owner', async () => {
    const badges: Array<[number, boolean]> = [];
    options.badge = (count, ignoreFlash) => badges.push([count, ignoreFlash]);
    const first = identity(views.get(records[0].id));
    const second = identity(views.get(records[1].id));
    await controller.receive(first, {type: 'metadata', data: {availability: Availability.Type.BUSY}});
    await controller.receive(first, {type: 'unread', count: 3});
    await controller.receive(second, {type: 'unread', count: 5});
    await controller.receive(second, {type: 'activate'});
    assert.deepEqual(badges, [
      [3, true],
      [8, false],
      [3, false],
    ]);
    assert.equal(state.get(records[1].id).visible, true);
    assert.equal(state.get(records[1].id).badgeCount, 0);
  });

  it('[security-target][CAP-001] rejects a replaced registration and revoked queued shell commands', async () => {
    const first = views.get(records[0].id);
    const owner = identity(first);
    const pending = controller.receive(owner, {type: 'metadata', data: {name: 'Old authority'}});
    registry.unregister(first.id);
    registry.register(owner);
    await assert.rejects(pending, /stale authority/);
    const shell = registry.authorize(
      {sender: window.webContents, senderFrame: window.webContents.mainFrame},
      ACCOUNT_CONTROL_CAPABILITY,
    );
    const addition = controller.add(shell);
    registry.unregister(window.webContents.id);
    await assert.rejects(addition, /authorized/);
    assert.equal(state.snapshots().length, 2);
    assert.equal(state.get(records[0].id).name, undefined);
  });

  it('[security-target][CAP-001] rejects an invalid approval result before replacing a view or profile', async () => {
    const first = views.get(records[0].id);
    options.approveEnvironment = async () => 'file:///unapproved';
    await assert.rejects(controller.receive(identity(first), {type: 'environment', url: origin}), /Invalid approved/);
    assert.equal(state.get(records[0].id).webappUrl, undefined);
    assert.equal(views.get(records[0].id), first);
  });

  it('[compatibility][security-target][CAP-001] connects the bundled production webapp bridge to main-owned state without a webview host', async () => {
    await views.dispose();
    disposeControl();
    disposeEvents();
    views = new AccountViews({
      window,
      registry,
      preload: path.join(process.cwd(), 'electron/dist/preload/preload-account.js'),
      additionalArguments: createRendererRuntimeArguments({
        locale: 'en-US',
        userDataPath: app.getPath('userData'),
        environment: snapshotRendererEnvironment(EnvironmentUtil),
        applockOverride: true,
      }),
      capabilities: [ACCOUNT_EVENT_CAPABILITY],
      configure: async () => undefined,
      lost: () => undefined,
    });
    options.views = views;
    controller = new AccountController(options);
    disposeControl = bindAccountControlIpc(ipcMain, registry, controller);
    disposeEvents = bindAccountEventIpc(ipcMain, registry, controller.receive);
    let managedRequests = 0;
    const managedConfig = (event: Electron.IpcMainEvent) => {
      managedRequests++;
      event.returnValue = {};
    };
    ipcMain.on(MANAGED_CONFIG_CHANNEL, managedConfig);
    try {
      await controller.start();
      assert.equal(
        managedRequests,
        0,
        'native account startup must not send synchronous IPC before navigation commits',
      );
      const first = views.get(records[0].id);
      const second = views.get(records[1].id);
      assert.deepEqual(await first.executeJavaScript('window.desktopAppConfig.managedConfig'), {applockOverride: true});
      const changed = new Promise<void>(resolve => {
        options.changed = () => resolve();
      });
      await first.executeJavaScript(
        "window.wireDesktopBridge.events.teamInfo({name: 'Native bridge', userID: 'first'})",
      );
      await changed;
      assert.equal(state.get(records[0].id).name, 'Native bridge');
      assert.equal(state.get(records[1].id).name, undefined);
      assert.deepEqual(
        await first.executeJavaScript(`({
        require: typeof window.require, process: typeof window.process,
        immutable: Object.isFrozen(window.wireDesktopBridge.events),
        genericInvoke: typeof window.wireDesktopBridge.events.invoke
      })`),
        {require: 'undefined', process: 'undefined', immutable: true, genericInvoke: 'undefined'},
      );
      await first.executeJavaScript(
        "window.joins = []; window.addEventListener('wire.webapp.conversation.join', event => window.joins.push(event.detail))",
      );
      await controller.receive(identity(first), {type: 'join', code: 'code', key: 'key', domain: null});
      const loaded = new Promise<void>(resolve => {
        options.changed = () => resolve();
      });
      await first.executeJavaScript('window.wireDesktopBridge.events.loaded()');
      await loaded;
      assert.deepEqual(await first.executeJavaScript('window.joins'), [{code: 'code', key: 'key', domain: null}]);
      assert.equal(state.get(records[1].id).lifecycle, undefined);
      assert.equal(views.get(records[1].id), second);
    } finally {
      ipcMain.removeListener(MANAGED_CONFIG_CHANNEL, managedConfig);
    }
  });
});
