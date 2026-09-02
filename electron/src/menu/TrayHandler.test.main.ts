/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import {BrowserWindow, Tray} from 'electron';
import {match, spy, assert as sinonAssert} from 'sinon';

import * as assert from 'assert';
import * as path from 'path';

import {resolveTrayIconNames, TrayHandler, TrayHandlerRuntime} from './TrayHandler';

import {config} from '../settings/config';

const fixturesDir = path.join(__dirname, '../../test/fixtures');
const TrayMock = new Tray(path.join(fixturesDir, 'tray.png'));

const createRuntime = (
  overrides: Partial<TrayHandlerRuntime> = {},
): TrayHandlerRuntime & {
  bounceDockIcon: ReturnType<typeof spy>;
  quit: ReturnType<typeof spy>;
  setBadgeCount: ReturnType<typeof spy>;
  showPrimaryWindow: ReturnType<typeof spy>;
} => ({
  bounceDockIcon: spy(),
  isGnomeX11: false,
  isLinux: false,
  isMacOS: false,
  quit: spy(),
  setBadgeCount: spy(),
  showPrimaryWindow: spy(),
  ...overrides,
});

describe('TrayHandler', () => {
  describe('platform icon policy', () => {
    it('selects the default, GNOME X11, and high-resolution Linux icon variants', () => {
      assert.deepStrictEqual(resolveTrayIconNames({isGnomeX11: false, isLinux: false}), {
        tray: 'tray.png',
        trayWithBadge: 'tray.badge.png',
      });
      assert.deepStrictEqual(resolveTrayIconNames({isGnomeX11: true, isLinux: true}), {
        tray: 'tray.gnome.png',
        trayWithBadge: 'tray.badge.gnome.png',
      });
      assert.deepStrictEqual(resolveTrayIconNames({isGnomeX11: false, isLinux: true}), {
        tray: 'tray@3x.png',
        trayWithBadge: 'tray.badge@3x.png',
      });
    });
  });

  describe('initTray', () => {
    it('creates native images for all tray icons and sets a default tray icon', () => {
      const tray = new TrayHandler();
      tray.initTray(TrayMock);

      assert.strictEqual(Object.keys(tray['icons']!).length, 3);
      assert.strictEqual(tray['icons']!.badge.constructor.name, 'NativeImage');
      assert.strictEqual(tray['icons']!.tray.constructor.name, 'NativeImage');
      assert.strictEqual(tray['icons']!.trayWithBadge.constructor.name, 'NativeImage');
      sinonAssert.match(tray['trayIcon']!, match.defined);
    });

    it('sets the tooltip and routes tray click, open, and quit menu actions', () => {
      const trayIcon = new Tray(path.join(fixturesDir, 'tray.png'));
      const setContextMenuSpy = spy(trayIcon, 'setContextMenu');
      const setToolTipSpy = spy(trayIcon, 'setToolTip');
      const runtime = createRuntime();

      try {
        const tray = new TrayHandler(runtime);
        tray.initTray(trayIcon);

        sinonAssert.calledOnceWithExactly(setToolTipSpy, config.name);
        const contextMenu = setContextMenuSpy.firstCall.firstArg;
        assert.strictEqual(contextMenu.items.length, 2);

        trayIcon.emit('click', {} as Electron.Event, {} as Electron.Rectangle, {} as Electron.Point);
        contextMenu.items[0].click?.();
        sinonAssert.calledTwice(runtime.showPrimaryWindow);

        contextMenu.items[1].click?.();
        sinonAssert.calledOnce(runtime.quit);
      } finally {
        setContextMenuSpy.restore();
        setToolTipSpy.restore();
        trayIcon.destroy();
      }
    });
  });

  describe('showUnreadCount', () => {
    describe('without tray icon initialization', () => {
      it('updates the badge counter and stops flashing the app frame when app is in focus while receiving new messages', async () => {
        const tray = new TrayHandler();
        tray.initTray(TrayMock);

        const appWindow = new BrowserWindow();
        const flashFrameSpy = spy(appWindow, 'flashFrame');

        await appWindow.loadURL('about:blank');
        assert.strictEqual(appWindow.isFocused(), true);
        assert.ok(flashFrameSpy.notCalled);
        tray.showUnreadCount(appWindow, 1);

        assert.ok(flashFrameSpy.firstCall.calledWith(false));
        assert.strictEqual(tray['lastUnreadCount'], 1);

        flashFrameSpy.restore();
      });

      it('updates tray, overlay, and application badges only when the unread count changes', async () => {
        const runtime = createRuntime();
        const tray = new TrayHandler(runtime);
        const setImageSpy = spy(TrayMock, 'setImage');
        tray.initTray(TrayMock);
        setImageSpy.resetHistory();

        const appWindow = new BrowserWindow({show: false});
        const setOverlayIconSpy = spy(appWindow, 'setOverlayIcon');
        await appWindow.loadURL('about:blank');

        tray.showUnreadCount(appWindow, 3, true);
        sinonAssert.calledOnceWithExactly(setImageSpy, tray['icons']!.trayWithBadge);
        sinonAssert.calledOnceWithExactly(setOverlayIconSpy, tray['icons']!.badge, match.string);
        sinonAssert.calledOnceWithExactly(runtime.setBadgeCount, 3);

        setImageSpy.resetHistory();
        setOverlayIconSpy.resetHistory();
        runtime.setBadgeCount.resetHistory();
        tray.showUnreadCount(appWindow, 3, true);
        sinonAssert.notCalled(setImageSpy);
        sinonAssert.notCalled(setOverlayIconSpy);
        sinonAssert.notCalled(runtime.setBadgeCount);

        tray.showUnreadCount(appWindow, 0, true);
        sinonAssert.calledOnceWithExactly(setImageSpy, tray['icons']!.tray);
        sinonAssert.calledOnceWithExactly(setOverlayIconSpy, null, match.string);
        sinonAssert.calledOnceWithExactly(runtime.setBadgeCount, 0);
        assert.strictEqual(tray['lastUnreadCount'], 0);

        setImageSpy.restore();
        setOverlayIconSpy.restore();
      });
    });

    describe('with tray icon initialization', () => {
      it('updates the badge counter and stops flashing the app frame when app is in focus while receiving new messages', async () => {
        const tray = new TrayHandler();
        tray.initTray(TrayMock);

        const appWindow = new BrowserWindow();
        const flashFrameSpy = spy(appWindow, 'flashFrame');

        await appWindow.loadFile(path.join(fixturesDir, 'badge.html'));
        assert.strictEqual(appWindow.isFocused(), true);
        assert.ok(flashFrameSpy.notCalled);
        tray.showUnreadCount(appWindow, 10);
        assert.ok(flashFrameSpy.firstCall.calledWith(false));
        assert.strictEqual(tray['lastUnreadCount'], 10);
        flashFrameSpy.restore();
      });

      it('flashes the app frame on non-macOS when an unfocused window receives more unread messages', async () => {
        const runtime = createRuntime({isMacOS: false});
        const tray = new TrayHandler(runtime);
        tray.initTray(TrayMock);

        const appWindow = new BrowserWindow({show: false, useContentSize: true});
        const flashFrameSpy = spy(appWindow, 'flashFrame');

        await appWindow.loadURL('about:blank');
        assert.strictEqual(appWindow.isFocused(), false);
        tray.showUnreadCount(appWindow, 2);
        assert.ok(flashFrameSpy.firstCall.calledWith(true));
        sinonAssert.notCalled(runtime.bounceDockIcon);
        flashFrameSpy.restore();
      });

      it('bounces the dock instead of flashing the app frame on macOS', async () => {
        const runtime = createRuntime({isMacOS: true});
        const tray = new TrayHandler(runtime);
        tray.initTray(TrayMock);

        const appWindow = new BrowserWindow({show: false, useContentSize: true});
        const flashFrameSpy = spy(appWindow, 'flashFrame');

        await appWindow.loadURL('about:blank');
        assert.strictEqual(appWindow.isFocused(), false);
        tray.showUnreadCount(appWindow, 2);
        sinonAssert.calledOnceWithExactly(runtime.bounceDockIcon, 'informational');
        sinonAssert.notCalled(flashFrameSpy);
        flashFrameSpy.restore();
      });

      it('does change the flash state if the window has already been flashed', async () => {
        const tray = new TrayHandler();
        tray.initTray(TrayMock);
        tray['lastUnreadCount'] = 5;

        const appWindow = new BrowserWindow({
          show: false,
          useContentSize: true,
        });

        const flashFrameSpy = spy(appWindow, 'flashFrame');

        await appWindow.loadURL('about:blank');
        assert.strictEqual(appWindow.isFocused(), false);
        tray.showUnreadCount(appWindow, 2);
        assert.ok(flashFrameSpy.notCalled);
        flashFrameSpy.restore();
      });
    });
  });
});
