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

import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Event as ElectronEvent,
  ProtocolRequest,
  ProtocolResponse,
  Session,
  session,
  WebContents,
  HandlerDetails,
} from 'electron';
import {Maybe} from 'true-myth';

import * as crypto from 'crypto';
import * as path from 'path';
import {URL} from 'url';

import {executeJavaScriptWithoutResult} from '../lib/ElectronUtil';
import {writeBoundedLogMessage} from '../logging/desktopLogWriter';
import {ENABLE_LOGGING, getLogger} from '../logging/getLogger';
import {getLogDirectory, getSsoLogPath} from '../logging/logPaths';
import {isAllowedSsoNavigation} from '../security/NavigationPolicy';
import {registerViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {config} from '../settings/config';
import * as WindowUtil from '../window/WindowUtil';

const minimist = require('minimist');

const argv = minimist(process.argv.slice(1));

export class SingleSignOn {
  private static readonly ALLOWED_BACKEND_ORIGINS = config.backendOrigins;
  private static readonly SINGLE_SIGN_ON_FRAME_NAME = 'WIRE_SSO';
  private static readonly SSO_PROTOCOL = `${config.customProtocolName}-sso`;
  private static readonly SSO_PROTOCOL_HOST = 'response';
  private static readonly MAX_LENGTH_ORIGIN_DOMAIN = 255;
  private static readonly MAX_LENGTH_ORIGIN = 'https://'.length + SingleSignOn.MAX_LENGTH_ORIGIN_DOMAIN;
  private static readonly logger = getLogger(path.basename(__filename));

  private static readonly RESPONSE_TYPES = {
    AUTH_ERROR: 'AUTH_ERROR',
    AUTH_ERROR_COOKIE: 'AUTH_ERROR_COOKIE',
    AUTH_ERROR_SESS_NOT_AVAILABLE: 'AUTH_ERROR_SESS_NOT_AVAILABLE',
    AUTH_SUCCESS: 'AUTH_SUCCESS',
  };

  private session: Session | undefined;
  private revokeCallback: (() => void) | undefined;
  private closed = false;
  private sessionCleanup: Promise<void> | undefined;
  private ssoWindow: BrowserWindow | undefined;
  private readonly senderWebContents: WebContents;
  private readonly accountId: Maybe<string>;
  private readonly registry: ViewIdentityRegistry;
  private readonly windowOptions: BrowserWindowConstructorOptions;
  private readonly windowOriginUrl: URL;
  public onClose = () => {};

  constructor(
    ssoWindow: BrowserWindow,
    senderWebContents: WebContents,
    accountId: Maybe<string>,
    windowOriginURL: string,
    windowOptions: BrowserWindowConstructorOptions,
    registry: ViewIdentityRegistry,
  ) {
    this.windowOptions = windowOptions;
    this.ssoWindow = ssoWindow;
    this.senderWebContents = senderWebContents;
    this.accountId = accountId;
    this.registry = registry;
    this.windowOriginUrl = new URL(windowOriginURL);
  }

  public readonly init = async (): Promise<SingleSignOn> => {
    // Create a ephemeral and isolated session
    const partition = this.windowOptions.webPreferences?.partition;
    if (!partition || !/^sso-[a-f0-9-]{36}$/.test(partition)) {
      throw new Error('SSO requires a fresh ephemeral session partition.');
    }
    this.session = session.fromPartition(partition, {cache: false});

    // Disable browser permissions (microphone, camera...)
    this.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);

    if (!this.ssoWindow || this.ssoWindow.webContents.session !== this.session) {
      throw new Error('SSO window is not using the isolated SSO session.');
    }
    registerViewIdentity(this.registry, {
      accountId: this.accountId.isJust ? this.accountId.value : undefined,
      allowedOrigin: this.windowOriginUrl.origin,
      capabilities: [],
      partition,
      session: this.session,
      viewType: 'sso',
      webContents: this.ssoWindow.webContents,
    });

    // User-agent normalization
    this.session.webRequest.onBeforeSendHeaders(({requestHeaders}: any, callback) => {
      requestHeaders['User-Agent'] = config.userAgent;
      callback({cancel: false, requestHeaders});
    });

    this.setupBrowserWindow();

    // Register protocol
    // Note: we need to create the window before otherwise it does not work
    const ssoSession = this.session;
    const callback = await SingleSignOn.registerProtocol(ssoSession, (type, label) => this.finalizeLogin(type, label));
    this.revokeCallback = callback.dispose;
    if (this.closed) {
      callback.dispose();
      SingleSignOn.unregisterProtocol(ssoSession);
      return this;
    }

    // Spar's web verdict uses window.opener. An isolated native window instead requests redirects.
    const loginUrl = new URL(this.windowOriginUrl);
    for (const [parameter, type] of [
      ['success_redirect', SingleSignOn.RESPONSE_TYPES.AUTH_SUCCESS],
      ['error_redirect', SingleSignOn.RESPONSE_TYPES.AUTH_ERROR],
    ]) {
      const redirect = `${SingleSignOn.SSO_PROTOCOL}://response?secret=${callback.secret}&type=${type}${
        type === SingleSignOn.RESPONSE_TYPES.AUTH_ERROR ? '&label=$label' : ''
      }`;
      if (!SingleSignOn.SSO_PROTOCOL.startsWith('wire') || redirect.length > 140) {
        throw new Error('SSO callback is incompatible with the backend redirect contract.');
      }
      loginUrl.searchParams.set(parameter, redirect);
    }

    // Show the window(s)
    await this.ssoWindow?.loadURL(loginUrl.toString());

    if (typeof argv[config.ARGUMENT.DEVTOOLS] !== 'undefined') {
      this.ssoWindow?.webContents.openDevTools({mode: 'detach'});
    }

    return this;
  };

  public static create(
    parent: BrowserWindow,
    sender: WebContents,
    accountId: Maybe<string>,
    url: string,
    registry: ViewIdentityRegistry,
  ): SingleSignOn {
    const options = SingleSignOn.getSingleSignOnLoginWindowOptions(parent, url);
    const window = new BrowserWindow(options);
    const singleSignOn = new SingleSignOn(window, sender, accountId, url, options, registry);
    const close = () => singleSignOn.close();
    const closeOnNavigation = (_event: ElectronEvent, _url: string, isInPlace: boolean, isMainFrame: boolean) => {
      if (isMainFrame && !isInPlace) {
        close();
      }
    };
    sender.once('destroyed', close);
    sender.once('render-process-gone', close);
    sender.on('did-start-navigation', closeOnNavigation);
    window.once('closed', () => {
      sender.removeListener('destroyed', close);
      sender.removeListener('render-process-gone', close);
      sender.removeListener('did-start-navigation', closeOnNavigation);
    });
    return singleSignOn;
  }

  private setupBrowserWindow(): void {
    if (!this.ssoWindow) {
      throw new Error('ssoWindow is not defined');
    }

    const ssoWindow = this.ssoWindow;
    if (this.windowOptions.webPreferences) {
      // Discard old preload URL
      delete this.windowOptions.webPreferences.preload;
    }

    ssoWindow.once('closed', async () => {
      this.ssoWindow = undefined;
      try {
        await this.cleanupSession();
        this.onClose();
      } catch (error) {
        SingleSignOn.logger.error('SSO session cleanup failed; the flow remains unavailable.', error);
      }
    });

    // Prevent title updates
    ssoWindow.on('page-title-updated', event => event.preventDefault());
    // Prevent new windows (open external pages in OS browser)
    ssoWindow.webContents.setWindowOpenHandler((details: HandlerDetails): {action: 'deny'} => {
      void WindowUtil.openExternal(details.url, true);

      return {action: 'deny'};
    });

    const guardNavigation = (event: ElectronEvent, url: string): void => {
      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        event.preventDefault();
        return;
      }
      if (
        origin.length > SingleSignOn.MAX_LENGTH_ORIGIN ||
        !isAllowedSsoNavigation(url, this.windowOriginUrl.origin, SingleSignOn.SSO_PROTOCOL)
      ) {
        event.preventDefault();
      }
      ssoWindow.setTitle(SingleSignOn.getWindowTitle(origin));
    };
    ssoWindow.webContents.on('will-navigate', guardNavigation);
    ssoWindow.webContents.on('will-redirect', guardNavigation);

    if (ENABLE_LOGGING) {
      ssoWindow.webContents.on('console-message', async (_event, _level, message) => {
        if (this.accountId.isJust) {
          const logFilePath = getSsoLogPath({
            accountId: this.accountId.value,
            date: new Date(),
            logDirectory: getLogDirectory(),
          });
          try {
            await writeBoundedLogMessage({logFilePath, message});
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            console.error('Cannot write to log file:', logFilePath, errorMessage, error);
          }
        }
      });
    }
  }

  close = () => {
    this.closed = true;
    this.revokeCallback?.();
    (async () => {
      if (this.session) {
        await this.cleanupSession();
      }
      this.ssoWindow?.close();
      this.ssoWindow = undefined;
    })()
      .then(console.info)
      .catch(console.info);
  };

  focus = () => {
    this.ssoWindow?.focus();
  };

  isOwnedByAccount = (accountId: string): boolean => this.accountId.isJust && this.accountId.value === accountId;

  // Ensure authenticity of the window from within the code
  public static isSingleSignOnLoginWindow = (frameName: string) => SingleSignOn.SINGLE_SIGN_ON_FRAME_NAME === frameName;

  public static getSingleSignOnLoginWindowOptions = (
    parent: BrowserWindow,
    origin: string,
  ): Electron.BrowserWindowConstructorOptions => {
    const options = WindowUtil.getNewWindowOptions({
      title: SingleSignOn.getWindowTitle(origin),
      parent,
      width: 480,
      height: 600,
    });
    return {...options, webPreferences: {...options.webPreferences, partition: `sso-${crypto.randomUUID()}`}};
  };

  // Returns an empty string if the origin is a Wire backend
  public static getWindowTitle = (origin: string): string =>
    SingleSignOn.ALLOWED_BACKEND_ORIGINS.includes(origin) ? '' : origin;

  private static async copyCookies(
    fromSession: Session,
    toSession: Session,
    url: URL,
    isActive: () => boolean = () => true,
  ): Promise<number> {
    const cookies = await fromSession.cookies.get({name: 'zuid'});
    let copied = 0;
    for (const cookie of cookies) {
      const domain = cookie.domain?.replace(/^\./, '').toLowerCase();
      if (
        isActive() &&
        cookie.name === 'zuid' &&
        domain &&
        (url.hostname === domain || (!cookie.hostOnly && url.hostname.endsWith(`.${domain}`)))
      ) {
        await toSession.cookies.set({url: url.toString(), ...cookie});
        copied++;
      }
    }

    await toSession.cookies.flushStore();
    return copied;
  }

  private static generateSecret(length: number): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(length, (error, bytes) => (error ? reject(error) : resolve(bytes.toString('hex'))));
    });
  }

  private static async registerProtocol(
    session: Session,
    finalizeLogin: (type: string, label?: string) => void | Promise<void>,
  ): Promise<{secret: string; dispose: () => void}> {
    // Generate a new secret to authenticate the custom protocol (wire-sso)
    const secret = await SingleSignOn.generateSecret(24);
    let active = true;

    const handleRequest = (request: ProtocolRequest, respond: (response: string | ProtocolResponse) => void): void => {
      try {
        if (request.method !== 'GET' || request.url.length > 255 || /[\u0000-\u0020\u007f\\]/.test(request.url)) {
          throw new Error('Invalid SSO callback URL');
        }
        const requestURL = new URL(request.url);

        if (requestURL.protocol !== `${SingleSignOn.SSO_PROTOCOL}:`) {
          throw new Error('Protocol is invalid');
        }

        if (
          requestURL.host !== SingleSignOn.SSO_PROTOCOL_HOST ||
          requestURL.username ||
          requestURL.password ||
          requestURL.hash ||
          (requestURL.pathname !== '' && requestURL.pathname !== '/') ||
          (requestURL.searchParams.size !== 2 && requestURL.searchParams.size !== 3) ||
          requestURL.searchParams.getAll('secret').length !== 1 ||
          requestURL.searchParams.getAll('type').length !== 1
        ) {
          throw new Error('Host is invalid');
        }

        if (!active) {
          throw new Error('Secret has not be set or has been consumed');
        }

        if (requestURL.searchParams.get('secret') !== secret) {
          throw new Error('Secret is invalid');
        }

        const type = requestURL.searchParams.get('type');

        if (type !== SingleSignOn.RESPONSE_TYPES.AUTH_SUCCESS && type !== SingleSignOn.RESPONSE_TYPES.AUTH_ERROR) {
          throw new Error('Response type is not allowed');
        }
        const label = requestURL.searchParams.get('label') ?? undefined;
        if (
          (requestURL.searchParams.size === 3 && (type !== SingleSignOn.RESPONSE_TYPES.AUTH_ERROR || !label)) ||
          (label !== undefined && !/^[a-z][a-z0-9-]{0,127}$/.test(label))
        ) {
          throw new Error('Invalid SSO error label');
        }
        active = false;
        respond({mimeType: 'text/html', data: '<!doctype html><title>SSO complete</title>'});
        void (async () => finalizeLogin(type, label))().catch(error =>
          SingleSignOn.logger.error('SSO finalization failed', error),
        );
      } catch (error) {
        respond({error: -10});
        SingleSignOn.logger.error(error);
      }
    };

    const isRegistered = session.protocol.isProtocolRegistered(SingleSignOn.SSO_PROTOCOL);

    if (isRegistered || !session.protocol.registerStringProtocol(SingleSignOn.SSO_PROTOCOL, handleRequest)) {
      throw new Error('Failed to register protocol.');
    }
    return {
      secret,
      dispose: () => {
        active = false;
      },
    };
  }

  private static unregisterProtocol(session: Session): boolean {
    return session.protocol.unregisterProtocol(SingleSignOn.SSO_PROTOCOL);
  }

  private readonly finalizeLogin = async (type: string, label?: string): Promise<void> => {
    if (this.closed) {
      return;
    }
    if (type === SingleSignOn.RESPONSE_TYPES.AUTH_SUCCESS) {
      if (!this.session) {
        await this.dispatchResponse(SingleSignOn.RESPONSE_TYPES.AUTH_ERROR_SESS_NOT_AVAILABLE);

        return;
      }

      // Set cookies from ephemeral session to the default one
      try {
        const copied = await SingleSignOn.copyCookies(
          this.session,
          this.senderWebContents.session,
          this.windowOriginUrl,
          () => !this.closed,
        );
        if (!copied) {
          throw new Error('No backend authentication cookie was available.');
        }
      } catch (error) {
        SingleSignOn.logger.warn(error);
        await this.dispatchResponse(SingleSignOn.RESPONSE_TYPES.AUTH_ERROR_COOKIE);

        return;
      }
    }

    await this.dispatchResponse(type, label);
  };

  private async dispatchResponse(type: string, label?: string): Promise<void> {
    if (this.closed) {
      return;
    }
    // Ensure guest window provided type is valid
    if (!Object.values(SingleSignOn.RESPONSE_TYPES).includes(type)) {
      throw new Error('Invalid type detected, aborting.');
    }

    // Fake postMessage to the webview
    const payload =
      type === SingleSignOn.RESPONSE_TYPES.AUTH_ERROR && label ? `, payload: ${JSON.stringify({label})}` : '';
    const snippet = `window.dispatchEvent(new MessageEvent('message', {origin: ${JSON.stringify(
      this.windowOriginUrl.origin,
    )}, data: {type: '${type}'${payload}}}))`;
    await executeJavaScriptWithoutResult(snippet, this.senderWebContents);
  }

  private cleanupSession(): Promise<void> {
    this.closed = true;
    this.revokeCallback?.();
    if (!this.sessionCleanup) {
      const session = this.session;
      this.session = undefined;
      this.sessionCleanup = (async () => {
        if (session) {
          await session.clearStorageData(undefined);
          if (
            !SingleSignOn.unregisterProtocol(session) &&
            session.protocol.isProtocolRegistered(SingleSignOn.SSO_PROTOCOL)
          ) {
            throw new Error('Failed to unregister protocol');
          }
        }
      })();
    }
    return this.sessionCleanup;
  }
}
