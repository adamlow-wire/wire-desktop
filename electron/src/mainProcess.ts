/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

import type {WallClock} from '@enormora/wall-clock/wall-clock';
import {
  app,
  dialog,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  Menu,
  session,
  WebContents,
  desktopCapturer,
  safeStorage,
} from 'electron';
import electronDl from 'electron-dl';
import windowStateKeeper from 'electron-window-state';
import fs from 'fs-extra';
import {getProxySettings} from 'get-proxy-settings';
import logdown from 'logdown';
import minimist from 'minimist';
import {Maybe} from 'true-myth';

import * as path from 'path';
import {URL, pathToFileURL} from 'url';

import {WebAppEvents} from '@wireapp/webapp-events';

import {AccountController} from './accounts/AccountController';
import {deleteNativeAccountLogs} from './accounts/AccountLogCleanup';
import {AccountProfile} from './accounts/AccountProfile';
import {clearAccountSession} from './accounts/AccountSessionCleanup';
import {AccountState} from './accounts/AccountState';
import {AccountViews} from './accounts/AccountViews';
import {readLegacyAccountState} from './accounts/readLegacyAccountState';
import * as ProxyAuth from './auth/ProxyAuth';
import {createProxyPromptActions} from './auth/ProxyPromptActions';
import {ProxyPromptCoordinator} from './auth/ProxyPromptCoordinator';
import {showRegisteredProxyPrompt} from './auth/ProxyPromptRegistration';
import {bindPictureInPictureCallIdentity, isPictureInPictureCallWindow} from './calling/PictureInPictureCall';
import {initializeFirstInstance} from './lib/applicationBootstrap';
import {
  attachTo as attachCertificateVerifyProcManagerTo,
  setCertificateVerifyProc,
} from './lib/CertificateVerifyProcManager';
import {configureEnforcedDownloads} from './lib/configureEnforcedDownloads';
import {CustomProtocolHandler} from './lib/CoreProtocol';
import {downloadImage} from './lib/download';
import {enumerateDesktopSources} from './lib/enumerateDesktopSources';
import {EVENT_TYPE} from './lib/eventType';
import {createFireAndForgetInvoker} from './lib/fireAndForgetInvoker';
import {getOpenGraphDataAsync} from './lib/openGraph';
import {showErrorDialog} from './lib/showDialog';
import {updateDownloadLocation} from './lib/updateDownloadLocation';
import * as locale from './locale';
import {runDesktopLogCleanup, writeBoundedLogMessage} from './logging/desktopLogWriter';
import {ENABLE_LOGGING, getLogger} from './logging/getLogger';
import {scheduleLogCleanup} from './logging/logCleanupScheduler';
import {getLogDirectory, getMainProcessLogPath, getWebViewLogPath} from './logging/logPaths';
import {initializeDesktopLogLifecycle} from './logging/logStartup';
import {getManagedConfig} from './managed/ManagedConfig';
import {attachAccountContextMenu} from './menu/AccountContextMenu';
import {attachAccountWebContentsTheme} from './menu/AccountTheme';
import {createDeveloperMenu, openDevTools} from './menu/developer';
import * as systemMenu from './menu/system';
import {TrayHandler} from './menu/TrayHandler';
import {getConfiguredPortableUserDataPath} from './runtime/configurePortableUserData';
import * as EnvironmentUtil from './runtime/EnvironmentUtil';
import * as lifecycle from './runtime/lifecycle';
import {snapshotRendererEnvironment} from './runtime/rendererEnvironment';
import {createRendererRuntimeArguments} from './runtime/rendererRuntimeArguments';
import {startSecureShellProof} from './secureShell/bootstrap';
import {bindSecureShellIpc} from './secureShell/ipc';
import {installSecureShellProtocol, registerSecureShellSchemePrivileges} from './secureShell/protocol';
import {SecureShellController} from './secureShell/SecureShellController';
import {AboutLocaleResponse, bindAboutWindowIpc} from './security/AboutWindowIpc';
import {ACCOUNT_CONTROL_CAPABILITY, ACCOUNT_SNAPSHOTS_CHANNEL} from './security/AccountControlContract';
import {bindAccountControlIpc} from './security/AccountControlIpc';
import {ACCOUNT_EVENT_CAPABILITY} from './security/AccountEventContract';
import {bindAccountEventIpc} from './security/AccountEventIpc';
import {handleAccountWindowOpen} from './security/AccountWindowPolicy';
import {BADGE_COUNT_CAPABILITY, bindBadgeCountIpc} from './security/BadgeCountIpc';
import {bindDeepLinkSubmitIpc, DEEP_LINK_SUBMIT_CAPABILITY} from './security/DeepLinkSubmitIpc';
import {bindDesktopSourcesIpc} from './security/DesktopSourcesIpc';
import {bindDownloadLocationIpc} from './security/DownloadLocationIpc';
import {ACCOUNT_CAPABILITIES} from './security/LegacyAccountViewIdentity';
import {bindManagedConfigIpc} from './security/ManagedConfigIpc';
import {bindNavigationGuard} from './security/NavigationGuard';
import {isAllowedAccountNavigation} from './security/NavigationPolicy';
import {bindNotificationActivationIpc} from './security/NotificationActivationIpc';
import {bindOpenGraphIpc} from './security/OpenGraphIpc';
import {bindProxyPromptIpc, createProxyPromptBoundary} from './security/ProxyPromptIpc';
import {bindSafeStorageIpc} from './security/SafeStorageIpc';
import {bindSavePictureIpc} from './security/SavePictureIpc';
import {bindSsoAccountLimitIpc, SSO_ACCOUNT_LIMIT_CAPABILITY} from './security/SsoAccountLimitIpc';
import {bindSsoWindowControlIpc} from './security/SsoWindowControlIpc';
import {SsoWindowCoordinator} from './security/SsoWindowCoordinator';
import {registerApplicationShellIdentity, ViewIdentityRegistry} from './security/ViewIdentityRegistry';
import {bindWebAppLoadedIpc} from './security/WebAppLoadedIpc';
import {resolveWindowsDownloadPath} from './security/WindowsDownloadPath';
import {bindWrapperRelaunchIpc} from './security/WrapperRelaunchIpc';
import {bindWrapperReloadIpc} from './security/WrapperReloadIpc';
import {config} from './settings/config';
import {settings} from './settings/ConfigurationPersistence';
import {SettingsType} from './settings/SettingsType';
import {SingleSignOn} from './sso/SingleSignOn';
import {initMacAutoUpdater} from './update/macosAutoUpdater';
import {AboutWindow, acceptWebappVersions} from './window/AboutWindow';
import {ProxyPromptWindow} from './window/ProxyPromptWindow';
import {WindowManager} from './window/WindowManager';
import * as WindowUtil from './window/WindowUtil';

const MAIN_PROCESS_LOGGER_NAME = 'main.js';
const LOG_CLEANUP_INTERVAL_MILLISECONDS = 60 * 60 * 1_000;
const logger = getLogger(MAIN_PROCESS_LOGGER_NAME);
const getRendererRuntimeArguments = (): string[] =>
  createRendererRuntimeArguments({
    locale: locale.getCurrent(),
    userDataPath: app.getPath('userData'),
    environment: snapshotRendererEnvironment(EnvironmentUtil),
    applockOverride: getManagedConfig().applockOverride,
  });
type WallClockModule = {
  readonly createDesktopWallClock: () => WallClock;
};
const wallClockModule = require('./runtime/wallClockLoader.mjs') as WallClockModule;
const wallClock = wallClockModule.createDesktopWallClock();
const mainProcessFireAndForgetInvoker = createFireAndForgetInvoker({
  reportFailure(error: unknown): void {
    logger.error('Failed to execute a main-process background operation.', error);
  },
});
const configuredUserDataPath = getConfiguredPortableUserDataPath();
const viewIdentityRegistry = new ViewIdentityRegistry();
const proxyPromptCoordinator = new ProxyPromptCoordinator();
const developerMenu = createDeveloperMenu(viewIdentityRegistry);

const argv = minimist(process.argv.slice(1));
const secureShellProof = argv['secure-shell-proof'] === true;

if (secureShellProof) {
  registerSecureShellSchemePrivileges();
}

const APP_PATH = path.join(app.getAppPath(), config.electronDirectory);
const INDEX_HTML = path.join(APP_PATH, 'renderer/index.html');
const PRELOAD_JS = path.join(APP_PATH, 'dist/preload/preload-shell.js');
const PRELOAD_RENDERER_JS = path.join(APP_PATH, 'dist/preload/preload-account.js');
const WRAPPER_CSS = path.join(APP_PATH, 'css/wrapper.css');
const ICON = path.join(APP_PATH, 'img/download-dialog/logo@2x.png');

const WINDOW_SIZE = {
  DEFAULT_HEIGHT: 768,
  DEFAULT_WIDTH: 1024,
  MIN_HEIGHT: 512,
  MIN_WIDTH: 398,
};

let proxyInfoArg: URL | undefined;

const customProtocolHandler = new CustomProtocolHandler();

// Config
const fileBasedProxyConfig = settings.restore<string | undefined>(SettingsType.PROXY_SERVER_URL);

const currentLocale = locale.getCurrent();
const startHidden = Boolean(argv[config.ARGUMENT.STARTUP] || argv[config.ARGUMENT.HIDDEN]);
const customDownloadPath = settings.restore<string | undefined>(SettingsType.DOWNLOAD_PATH);
const appHomePath = (downloadPath: string) => resolveWindowsDownloadPath(app.getPath('home'), downloadPath);
const isInternalBuild = (): boolean => config.environment === 'internal';

if (customDownloadPath && !secureShellProof && EnvironmentUtil.platform.IS_WINDOWS) {
  configureEnforcedDownloads(customDownloadPath, {
    resolvePath: appHomePath,
    ensureDirectory: fs.ensureDirSync,
    configure: electronDl,
    blockDownloads: () =>
      app.on('session-created', accountSession => {
        accountSession.on('will-download', event => event.preventDefault());
      }),
    logRejected: () => logger.error('Enforced download directory validation failed; download blocked.'),
    notifyComplete: directory => {
      dialog.showMessageBox({
        type: 'none',
        icon: ICON,
        title: locale.getText('enforcedDownloadComplete'),
        message: locale.getText('enforcedDownloadMessage', {path: directory}),
        buttons: [locale.getText('enforcedDownloadButton')],
      });
    },
  });
}

if (argv[config.ARGUMENT.VERSION]) {
  console.info(config.version);
  app.exit();
}

logger.info(`Initializing ${config.name} v${config.version} ...`);

if (argv[config.ARGUMENT.PROXY_SERVER] || fileBasedProxyConfig) {
  try {
    proxyInfoArg = new URL(argv[config.ARGUMENT.PROXY_SERVER] || fileBasedProxyConfig);
    if (!argv[config.ARGUMENT.PROXY_SERVER] && fileBasedProxyConfig) {
      logger.info(`Using proxy server URL from "init.json": ${fileBasedProxyConfig}`);
      app.commandLine.appendSwitch('proxy-server', fileBasedProxyConfig);
    }
    if (!/^(https?|socks[45]):$/.test(proxyInfoArg.protocol)) {
      throw new Error('Invalid protocol for the proxy server specified.');
    }
    if (proxyInfoArg.origin === 'null') {
      proxyInfoArg = undefined;
      throw new Error('No protocol for the proxy server specified.');
    }
  } catch (error) {
    logger.error(`Could not parse authenticated proxy URL: "${(error as any).message}"`);
  }
}

const iconFileName = `logo.${EnvironmentUtil.platform.IS_WINDOWS ? 'ico' : 'png'}`;
const iconPath = path.join(APP_PATH, 'img', iconFileName);
// This needs to stay global, see
// https://github.com/electron/electron/blob/v4.2.12/docs/faq.md#my-apps-windowtray-disappeared-after-a-few-minutes
let tray: TrayHandler;

let isFullScreen = false;
let isQuitting = false;
let main: BrowserWindow;
let wrapperInit: ElectronWrapperInit;
let accountController: AccountController | undefined;
let accountViews: AccountViews | undefined;

Object.entries(config).forEach(([key, value]) => {
  if (typeof value === 'undefined' || (typeof value === 'number' && isNaN(value))) {
    logger.warn(`Configuration key "${key}" not defined.`);
  }
});

// Squirrel setup
app.setAppUserModelId(config.appUserModelId);

// Disable mDNS IP masking so local/private IPs are exposed (prevents Windows firewall prompt)
app.commandLine.appendSwitch('disable-features', 'webrtc-hide-local-ips-with-mdns');

// Allow both public and private interfaces for WebRTC
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_and_private_interfaces');

// IPC events
const showAccountLimitWarning = async (): Promise<void> => {
  const singular = config.maximumAccounts === 1;
  await dialog.showMessageBox({
    detail: locale.getText(singular ? 'wrapperAddAccountErrorMessageSingular' : 'wrapperAddAccountErrorMessagePlural'),
    message: locale.getText(singular ? 'wrapperAddAccountErrorTitleSingular' : 'wrapperAddAccountErrorTitlePlural'),
    type: 'warning',
  });
};

const bindIpcEvents = (): void => {
  bindAboutWindowIpc(ipcMain, viewIdentityRegistry, {
    readLocaleValues(labels): AboutLocaleResponse {
      const values: Record<string, string> = {};
      for (const label of labels) {
        values[label] = locale.getText(label as locale.i18nLanguageIdentifier);
      }
      values.aboutReleasesUrl = config.aboutReleasesUrl;
      values.aboutUpdatesUrl = config.aboutUpdatesUrl;
      return values;
    },
    reportWebappVersions: acceptWebappVersions,
  });
  bindSavePictureIpc(ipcMain, viewIdentityRegistry, (bytes, timestamp) =>
    downloadImage(bytes, timestamp ? Maybe.just(timestamp) : Maybe.nothing<string>()),
  );
  bindSsoAccountLimitIpc(ipcMain, viewIdentityRegistry, showAccountLimitWarning);
  bindNotificationActivationIpc(ipcMain, viewIdentityRegistry, () => WindowManager.showPrimaryWindow());
  bindWebAppLoadedIpc(ipcMain, viewIdentityRegistry, () => WindowManager.flushActionsQueue());
  bindBadgeCountIpc(ipcMain, viewIdentityRegistry, (count, ignoreFlash) =>
    tray.showUnreadCount(main, count, ignoreFlash),
  );
  bindDeepLinkSubmitIpc(ipcMain, viewIdentityRegistry, url => customProtocolHandler.dispatchDeepLink(url));
  bindProxyPromptIpc(
    ipcMain,
    viewIdentityRegistry,
    createProxyPromptBoundary(proxyPromptCoordinator, label => locale.getText(label as locale.i18nLanguageIdentifier)),
  );

  bindWrapperReloadIpc(ipcMain, viewIdentityRegistry, identity => {
    if (!accountController) {
      throw new Error('Accounts are not initialized.');
    }
    return accountController.reloadAll(identity);
  });
  bindWrapperRelaunchIpc(ipcMain, viewIdentityRegistry, lifecycle.relaunch);

  bindManagedConfigIpc(ipcMain, viewIdentityRegistry, getManagedConfig);

  bindOpenGraphIpc(ipcMain, viewIdentityRegistry, getOpenGraphDataAsync);

  bindDownloadLocationIpc(ipcMain, viewIdentityRegistry, downloadPath => {
    updateDownloadLocation(downloadPath, {
      ensureDirectory: fs.ensureDirSync,
      isWindows: EnvironmentUtil.platform.IS_WINDOWS,
      persist: () => settings.persistToFile(),
      resolvePath: appHomePath,
      save: value => settings.save(SettingsType.DOWNLOAD_PATH, value),
    });
  });
};

const checkConfigV0FullScreen = (mainWindowState: windowStateKeeper.State): void => {
  // if a user still has the old config version 0 and had the window maximized last time
  if (typeof mainWindowState.isMaximized === 'undefined' && isFullScreen === true) {
    main.maximize();
  }
};

const initWindowStateKeeper = (): windowStateKeeper.State => {
  const loadedWindowBounds = settings.restore(SettingsType.WINDOW_BOUNDS, {
    height: WINDOW_SIZE.DEFAULT_HEIGHT,
    width: WINDOW_SIZE.DEFAULT_WIDTH,
  });

  // load version 0 full screen setting
  const showInFullScreen = settings.restore(SettingsType.FULL_SCREEN, 'not-set-in-v0');

  const stateKeeperOptions: windowStateKeeper.Options = {
    defaultHeight: loadedWindowBounds.height,
    defaultWidth: loadedWindowBounds.width,
    path: path.join(app.getPath('userData'), 'config'),
  };

  if (showInFullScreen !== 'not-set-in-v0') {
    stateKeeperOptions.fullScreen = showInFullScreen as boolean;
    stateKeeperOptions.maximize = showInFullScreen as boolean;
    isFullScreen = showInFullScreen as boolean;
  }

  return windowStateKeeper(stateKeeperOptions);
};

function getMainWindowUrl() {
  const baseUrl = EnvironmentUtil.web.getWebappUrl();
  const mainURL = pathToFileURL(INDEX_HTML);
  mainURL.searchParams.set('focus', String(!startHidden));

  if (!baseUrl) {
    // No URL configured in init.json (only applies to Wire Gov builds, which don't fall back to a default).
    mainURL.searchParams.set('noUrlConfigured', 'true');

    return mainURL;
  }

  const webappURL = new URL(baseUrl);
  webappURL.searchParams.set('hl', currentLocale);

  if (ENABLE_LOGGING) {
    webappURL.searchParams.set('enableLogging', '@wireapp/*');
  }

  mainURL.searchParams.set('env', encodeURIComponent(webappURL.href));

  return mainURL;
}

// App Windows
const showMainWindow = async (mainWindowState: windowStateKeeper.State): Promise<void> => {
  const showMenuBar = settings.restore(SettingsType.SHOW_MENU_BAR, true);

  const options: BrowserWindowConstructorOptions = {
    autoHideMenuBar: !showMenuBar,
    backgroundColor: '#f7f8fa',
    height: mainWindowState.height,
    icon: iconPath,
    minHeight: WINDOW_SIZE.MIN_HEIGHT,
    minWidth: WINDOW_SIZE.MIN_WIDTH,
    show: false,
    title: config.name,
    webPreferences: {
      additionalArguments: getRendererRuntimeArguments(),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: PRELOAD_JS,
      sandbox: true,
      nodeIntegrationInWorker: false,
      webviewTag: false,
    },
    width: mainWindowState.width,
    // eslint-disable-next-line id-length
    x: mainWindowState.x,
    // eslint-disable-next-line id-length
    y: mainWindowState.y,
  };

  bindDesktopSourcesIpc(ipcMain, viewIdentityRegistry, options =>
    enumerateDesktopSources(options, value => desktopCapturer.getSources(value)),
  );
  bindSafeStorageIpc(ipcMain, viewIdentityRegistry, safeStorage);

  main = new BrowserWindow(options);
  const mainURL = getMainWindowUrl();
  registerApplicationShellIdentity(viewIdentityRegistry, main.webContents, mainURL.href, [
    ACCOUNT_CONTROL_CAPABILITY,
    BADGE_COUNT_CAPABILITY,
    DEEP_LINK_SUBMIT_CAPABILITY,
    SSO_ACCOUNT_LIMIT_CAPABILITY,
  ]);

  const profile = new AccountProfile(path.join(app.getPath('userData'), 'accounts.v1.json'), config.maximumAccounts);
  const initial =
    profile.read() ??
    profile.importLegacy(
      (await readLegacyAccountState(INDEX_HTML, session.defaultSession)) ?? JSON.stringify({accounts: []}),
    );
  const accountState = new AccountState(initial, config.maximumAccounts, records => profile.write(records));
  const nativeViews = new AccountViews({
    window: main,
    registry: viewIdentityRegistry,
    preload: PRELOAD_RENDERER_JS,
    additionalArguments: getRendererRuntimeArguments(),
    capabilities: [...ACCOUNT_CAPABILITIES, ACCOUNT_EVENT_CAPABILITY],
    configure: (contents, account, url) => wrapperInit.configureAccountContents(contents, account, url),
    lost: id => mainProcessFireAndForgetInvoker.fireAndForget(() => accountController!.reload(id)),
  });
  accountViews = nativeViews;
  const controller = new AccountController({
    accountLimit: showAccountLimitWarning,
    state: accountState,
    views: nativeViews,
    registry: viewIdentityRegistry,
    destination: account => {
      const url = new URL(account.webappUrl || decodeURIComponent(mainURL.searchParams.get('env') || ''));
      url.searchParams.set('hl', currentLocale);
      if (account.ssoCode && account.isAdding) {
        url.pathname = '/auth';
        url.hash = `#sso/${account.ssoCode}`;
      }
      return url.href;
    },
    session: account =>
      account.sessionID ? session.fromPartition(`persist:${account.sessionID}`) : session.defaultSession,
    clearData: async (account, targetSession) => {
      await clearAccountSession(targetSession);
      await deleteNativeAccountLogs(account.id, getLogDirectory());
    },
    approveEnvironment: async (_account, candidate) => {
      const result = await dialog.showMessageBox(main, {
        type: 'question',
        buttons: ['Cancel', 'Continue'],
        defaultId: 0,
        cancelId: 0,
        message: 'Change this account’s server?',
        detail: new URL(candidate).origin,
      });
      if (result.response !== 1) {
        throw new Error('Account destination was not approved.');
      }
      return candidate;
    },
    changed: accounts => {
      if (!main.isDestroyed()) {
        main.webContents.send(ACCOUNT_SNAPSHOTS_CHANNEL, accounts);
      }
    },
    badge: (count, ignoreFlash) => tray.showUnreadCount(main, count, ignoreFlash),
    loaded: () => WindowManager.flushActionsQueue(),
    menu: account =>
      new Promise<void>(resolve => {
        const menu = Menu.buildFromTemplate([
          ...(account.lifecycle === EVENT_TYPE.LIFECYCLE.SIGNED_IN
            ? [
                {
                  id: 'account-logout',
                  label: locale.getText('wrapperLogOut'),
                  click: () => mainProcessFireAndForgetInvoker.fireAndForget(() => controller.logout(account.id)),
                },
              ]
            : []),
          {
            id: 'account-remove',
            label: locale.getText('wrapperRemoveAccount'),
            click: () => mainProcessFireAndForgetInvoker.fireAndForget(() => controller.remove(account.id)),
          },
        ]);
        menu.popup({window: main, x: 39, y: account.accountIndex * 56 + 28, callback: resolve});
      }),
  });
  accountController = controller;
  const disposeActions = WindowManager.bindNativeActions(main.id, (channel, args) =>
    mainProcessFireAndForgetInvoker.fireAndForget(() => controller.desktopAction(channel, args)),
  );
  const disposeControl = bindAccountControlIpc(ipcMain, viewIdentityRegistry, controller);
  const disposeEvents = bindAccountEventIpc(ipcMain, viewIdentityRegistry, controller.receive);
  main.once('closed', () => {
    disposeActions();
    disposeControl();
    disposeEvents();
  });

  main.setMenuBarVisibility(showMenuBar);

  mainWindowState.manage(main);
  attachCertificateVerifyProcManagerTo(main);
  checkConfigV0FullScreen(mainWindowState);

  if (typeof argv[config.ARGUMENT.DEVTOOLS] !== 'undefined') {
    openDevTools(argv[config.ARGUMENT.DEVTOOLS]).catch(() =>
      logger.warn(`Could not open DevTools with index "${argv[config.ARGUMENT.DEVTOOLS]}". Does the account exist?`),
    );
  }

  if (!startHidden) {
    if (!WindowUtil.isInView(main)) {
      main.center();
    }

    WindowManager.setPrimaryWindowId(main.id);
    setTimeout(() => main.show(), 800);
  }

  bindNavigationGuard(main.webContents, () => false);

  // Handle the new window event in the main Browser Window
  main.webContents.setWindowOpenHandler(details => {
    return {action: 'deny'};
  });

  main.on('focus', () => {
    systemMenu.registerGlobalShortcuts();
    main.flashFrame(false);
  });

  main.on('blur', () => systemMenu.unregisterGlobalShortcuts());

  main.on('page-title-updated', () => tray.showUnreadCount(main));

  main.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      logger.log('Closing window...');

      if (main.isFullScreen()) {
        logger.log('Fullscreen detected, leaving full screen before hiding...');
        main.once('leave-full-screen', () => main.hide());
        main.setFullScreen(false);
      } else {
        main.hide();
      }
      systemMenu.unregisterGlobalShortcuts();
    }
  });

  main.webContents.on('render-process-gone', async (_event, details) => {
    logger.error('WebContents crashed. Will reload the window.');
    logger.error(JSON.stringify(details));
    try {
      main.reload();
    } catch (error) {
      showErrorDialog(`Could not reload the window: ${(error as any).message}`);
      logger.error('Could not reload the window:', error);
    }
  });

  app.on('child-process-gone', (event, details) => {
    logger.error('child process gone');
    logger.error(event);
    logger.error(details);
  });

  main.webContents.setZoomFactor(1);

  await main.loadURL(mainURL.href);
  const wrapperCSSContent = await fs.readFile(WRAPPER_CSS, 'utf8');
  await main.webContents.insertCSS(wrapperCSSContent);
  await controller.start();
  WindowManager.flushActionsQueue();
};

// App Events
const handleAppEvents = (): void => {
  app.on('window-all-closed', async () => {
    if (!EnvironmentUtil.platform.IS_MAC_OS) {
      await lifecycle.quit();
    }
  });

  app.on('activate', () => {
    if (main) {
      main.show();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('login', async (event, webContents, _responseDetails, authInfo, callback) => {
    if (authInfo.isProxy) {
      event.preventDefault();
      const {host, port} = authInfo;

      const systemProxy = await getProxySettings();
      const systemProxySettings = systemProxy && (systemProxy.http || systemProxy.https);
      if (systemProxySettings) {
        const {
          credentials: {username, password},
          protocol,
        } = systemProxySettings;
        proxyInfoArg = ProxyAuth.generateProxyURL({host, port}, {password, protocol, username});
        logger.log('Found system proxy settings, applying settings on the main window...');

        await applyProxySettings(proxyInfoArg, main.webContents);

        return callback(username, password);
      }

      if (proxyInfoArg) {
        await showRegisteredProxyPrompt({
          actions: createProxyPromptActions({
            applyProxySettings,
            authenticate: callback,
            authInfo: {host, port},
            challengedSession: webContents.session,
            getProxyInfo: () => proxyInfoArg,
            logger,
            mainWindow: main,
            setProxyInfo: proxy => (proxyInfoArg = proxy),
            showErrorDialog,
          }),
          coordinator: proxyPromptCoordinator,
          fireAndForget: mainProcessFireAndForgetInvoker.fireAndForget,
          showWindow: onCreated => ProxyPromptWindow.showWindow(viewIdentityRegistry, onCreated),
        });
      }
    }
  });

  // System Menu, Tray Icon & Show window
  app.on('ready', async () => {
    const mainWindowState = initWindowStateKeeper();
    /* istanbul ignore next -- composition root */
    const appMenu = systemMenu.createMenu(isFullScreen, wallClock, () => {
      void AboutWindow.showWindow(viewIdentityRegistry).catch(error => logger.error(error));
    });
    if (EnvironmentUtil.app.IS_DEVELOPMENT) {
      app.commandLine.appendSwitch('enable-webrtc-internals');
      appMenu.append(developerMenu);
    }

    Menu.setApplicationMenu(appMenu);
    tray = new TrayHandler();
    if (!EnvironmentUtil.platform.IS_MAC_OS) {
      tray.initTray();
    }
    await showMainWindow(mainWindowState);

    /* istanbul ignore next -- composition root */
    app.on('ready', async () => {
      const mainWindowState = initWindowStateKeeper();
      const appMenu = systemMenu.createMenu(isFullScreen, wallClock, () => {
        void AboutWindow.showWindow(viewIdentityRegistry).catch(error => logger.error(error));
      });
      if (EnvironmentUtil.app.IS_DEVELOPMENT) {
        appMenu.append(developerMenu);
      }

      Menu.setApplicationMenu(appMenu);
      tray = new TrayHandler();
      if (!EnvironmentUtil.platform.IS_MAC_OS) {
        tray.initTray();
      }
      await showMainWindow(mainWindowState);

      if (EnvironmentUtil.platform.IS_MAC_OS && isInternalBuild()) {
        initMacAutoUpdater(main);
      }
    });
  });
};

const addLinuxWorkarounds = (): void => {
  if (EnvironmentUtil.platform.IS_LINUX) {
    // Fix indicator icon on Unity
    // Source: https://bugs.launchpad.net/ubuntu/+bug/1559249

    if (
      EnvironmentUtil.linuxDesktop.isUbuntuUnity ||
      EnvironmentUtil.linuxDesktop.isPopOS ||
      EnvironmentUtil.linuxDesktop.isGnomeX11
    ) {
      process.env.XDG_CURRENT_DESKTOP = 'Unity';
    }
  }
};

const handlePortableFlags = (): void => {
  configuredUserDataPath.match({
    Just: logConfiguredUserDataPath,
    Nothing: handleMissingUserDataPath,
  });
};

function logConfiguredUserDataPath(userDataPath: string): void {
  logger.log(`Saving user data to "${userDataPath}".`);
}

function handleMissingUserDataPath(): void {}

const applyProxySettings = async (authenticatedProxyDetails: URL, webContents: Electron.WebContents): Promise<void> => {
  const proxyURL = authenticatedProxyDetails.origin.split('://')[1];
  const proxyProtocol = authenticatedProxyDetails.protocol;
  const isSocksProxy = proxyProtocol === 'socks4:' || proxyProtocol === 'socks5:';

  logger.info(`Setting proxy on the window to URL "${proxyURL}" with protocol "${proxyProtocol}"...`);
  webContents.session.allowNTLMCredentialsForDomains(authenticatedProxyDetails.hostname);

  const proxyRules = isSocksProxy ? `socks=${proxyURL}` : `http=${proxyURL};https=${proxyURL}`;
  await webContents.session.setProxy({pacScript: '', proxyBypassRules: '', proxyRules});
};

class ElectronWrapperInit {
  logger: logdown.Logger;
  private readonly ssoWindows = new SsoWindowCoordinator(accountId => {
    if (accountViews?.has(accountId)) {
      accountViews.get(accountId).send(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED);
    }
  });

  constructor() {
    this.logger = getLogger('ElectronWrapperInit');
    bindSsoWindowControlIpc(ipcMain, viewIdentityRegistry, {
      close: accountId => this.ssoWindows.control(accountId, 'close'),
      focus: accountId => this.ssoWindows.control(accountId, 'focus'),
    });
  }

  run(): void {
    this.logger.log('webviewProtection init');
    this.webviewProtection();
  }

  webviewProtection(): void {
    app.on('web-contents-created', (_event, contents) => {
      contents.setWindowOpenHandler(() => ({action: 'deny'}));
    });
  }

  async configureAccountContents(
    contents: WebContents,
    account: {id: string; sessionID?: string},
    url: URL,
  ): Promise<void> {
    const enableSpellChecking = settings.restore(SettingsType.ENABLE_SPELL_CHECKING, true);
    const accountOrigin = url.origin;
    const registeredAccountId = account.id;
    const accountPartition = account.sessionID ?? 'default';
    attachAccountContextMenu(contents, main);
    attachAccountWebContentsTheme(contents);
    if (proxyInfoArg?.origin && contents.session) {
      this.logger.log('Found proxy settings in arguments, applying settings on the webview...');
      await applyProxySettings(proxyInfoArg, contents);
    }
    // Open webview links outside of the app
    contents.setWindowOpenHandler(details =>
      handleAccountWindowOpen(details, {
        accountSession: contents.session,
        accountOrigin,
        sourceUrl: contents.getURL(),
        openExternal: url => mainProcessFireAndForgetInvoker.fireAndForget(() => WindowUtil.openExternal(url)),
        openDeepLink: url =>
          mainProcessFireAndForgetInvoker.fireAndForget(() => customProtocolHandler.dispatchDeepLink(url)),
        openSso: url =>
          mainProcessFireAndForgetInvoker.fireAndForget(() =>
            this.ssoWindows.open(registeredAccountId, () =>
              SingleSignOn.create(main, contents, Maybe.of(registeredAccountId), url, viewIdentityRegistry),
            ),
          ),
      }),
    );
    contents.on('did-create-window', (win, windowCreationDetails) => {
      const {frameName, url} = windowCreationDetails;
      if (isPictureInPictureCallWindow(frameName)) {
        bindNavigationGuard(
          win.webContents,
          target => target === 'about:blank' || isAllowedAccountNavigation(target, accountOrigin),
        );
      }

      bindPictureInPictureCallIdentity({
        allowedUrl: url,
        destroy: () => win.destroy(),
        frameName,
        logRejection: error => logger.error('Rejected unbound picture-in-picture window.', error),
        partition: accountPartition ?? '',
        registry: viewIdentityRegistry,
        resolveAccountId: () => registeredAccountId,
        webContents: win.webContents,
      });
    });
    if (ENABLE_LOGGING) {
      const colorCodeRegex = /%c(.+?)%c/gm;
      const stylingRegex = /(color:#|font-weight:)[^;]+; /gm;
      const accessTokenRegex = /access_token=[^ &]+/gm;

      contents.on('console-message', async (_event, _level, message) => {
        const accountId = Maybe.of(account.id);

        if (accountId.isJust) {
          const logFilePath = getWebViewLogPath({
            accountId: accountId.value,
            date: new Date(),
            logDirectory: getLogDirectory(),
          });
          try {
            await writeBoundedLogMessage({
              logFilePath,
              message: message.replace(colorCodeRegex, '$1').replace(stylingRegex, '').replace(accessTokenRegex, ''),
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.error(`Cannot write to log file "${logFilePath}": ${errorMessage}`, error);
          }
        }
      });
    }

    if (enableSpellChecking) {
      try {
        const availableSpellCheckerLanguages = contents.session.availableSpellCheckerLanguages;
        const foundLanguages = locale.supportedSpellCheckLanguages[currentLocale].filter(language =>
          availableSpellCheckerLanguages.includes(language),
        );
        contents.session.setSpellCheckerLanguages(foundLanguages);
      } catch (error) {
        logger.error(error);
        contents.session.setSpellCheckerLanguages([]);
      }
    }

    // Disable TLS < v1.2
    contents.session.setSSLConfig({minVersion: 'tls1.2'});

    contents.session.setCertificateVerifyProc(setCertificateVerifyProc);

    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyUp' && input.key === 'Alt') {
        const mainBrowserWindow = WindowManager.getPrimaryWindow();

        if (mainBrowserWindow) {
          const isAutoHide = mainBrowserWindow.isMenuBarAutoHide();
          const isVisible = mainBrowserWindow.isMenuBarVisible();
          if (isAutoHide) {
            mainBrowserWindow.setMenuBarVisibility(!isVisible);
          }
        }
      }
    });
  }
}

handlePortableFlags();
void lifecycle.checkSingleInstance().catch(error => logger.error(error));

if (secureShellProof) {
  if (lifecycle.isFirstInstance) {
    void startSecureShellProof(
      {
        accountPreload: path.join(APP_PATH, 'dist/preload/preload-secure-account.js'),
        app,
        getAccountUrl: EnvironmentUtil.web.getWebappUrl,
        logger,
      },
      {
        bindIpc: bindSecureShellIpc,
        createController: (options, registry) => new SecureShellController(options, registry),
        installProtocol: installSecureShellProtocol,
      },
    );
  }
} else {
  customProtocolHandler.registerCoreProtocol();
  void lifecycle.initSquirrelListener().catch(error => logger.error(error));

  // Reloads the entire view when a `relaunch` is triggered (MacOS only, as other platform will quit and restart the app)
  lifecycle.addRelaunchListeners(async () => {
    await accountController?.reloadAll();
    const mainURL = getMainWindowUrl();
    await main.loadURL(mainURL.href);
  });

  // Stop further execution on update to prevent second tray icon
  if (lifecycle.isFirstInstance) {
    addLinuxWorkarounds();
    initializeFirstInstance({
      bindIpcEvents,
      ensureMainProcessLogFile() {
        fs.ensureFileSync(getMainProcessLogPath({date: new Date(), logDirectory: getLogDirectory()}));
      },
      handleAppEvents,
      initializeElectronWrapper() {
        try {
          wrapperInit = new ElectronWrapperInit();
          wrapperInit.run();
        } catch (error) {
          logger.error(error);
        }
      },
      startDesktopLogLifecycle() {
        mainProcessFireAndForgetInvoker.fireAndForget(async () => {
          await initializeDesktopLogLifecycle({
            reportCleanupFailure(error: unknown) {
              logger.error('Failed to complete initial desktop log cleanup.', error);
            },
            runInitialCleanup: runDesktopLogCleanup,
            schedulePeriodicCleanup() {
              scheduleLogCleanup({
                fireAndForget: mainProcessFireAndForgetInvoker.fireAndForget,
                intervalMilliseconds: LOG_CLEANUP_INTERVAL_MILLISECONDS,
                runCleanup: runDesktopLogCleanup,
                setInterval(callback: () => void, intervalMilliseconds: number): NodeJS.Timeout {
                  return setInterval(callback, intervalMilliseconds);
                },
              });
            },
          });
        });
      },
    });
  }
}
