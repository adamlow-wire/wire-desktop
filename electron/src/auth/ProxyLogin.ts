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

import type {ProxySettings} from 'get-proxy-settings';

import {URL} from 'url';

import {generateProxyURL} from './ProxyAuth';
import {createProxyPromptActions, CreateProxyPromptActionsOptions} from './ProxyPromptActions';
import {RegisterProxyPromptOptions, showRegisteredProxyPrompt} from './ProxyPromptRegistration';

export interface ProxyLoginOptions<WebContents> {
  authInfo: Readonly<{host: string; port: number}>;
  webContents: WebContents;
  getProxySettings(): Promise<ProxySettings | null | undefined>;
  applyProxySettings(proxy: URL, webContents: WebContents): Promise<void>;
  setProxyInfo(proxy: URL): void;
  authenticate(username?: string, password?: string): void;
  showPrompt(): Promise<void>;
}

export const handleProxyLogin = async <WebContents>(options: ProxyLoginOptions<WebContents>): Promise<void> => {
  let settings: ProxySettings | null | undefined;
  try {
    settings = await options.getProxySettings();
  } catch {
    // An unavailable OS reader cannot authorize automatic credential use.
  }
  const matchingProxy = [settings?.http, settings?.https].find(
    proxy =>
      proxy?.credentials &&
      proxy.host.toLowerCase() === options.authInfo.host.toLowerCase() &&
      proxy.port === String(options.authInfo.port),
  );
  if (matchingProxy) {
    const {username, password} = matchingProxy.credentials;
    const proxy = generateProxyURL(options.authInfo, {username, password, protocol: matchingProxy.protocol});
    try {
      await options.applyProxySettings(proxy, options.webContents);
    } catch (error) {
      options.authenticate();
      throw error;
    }
    options.setProxyInfo(proxy);
    options.authenticate(username, password);
    return;
  }
  await options.showPrompt();
};

interface ProxyLoginView {
  session: {setProxy(config: object): Promise<void>};
  reload(): void;
}

type ProxyLoginHandlerOptions<WebContents> = Pick<
  CreateProxyPromptActionsOptions<WebContents>,
  'applyProxySettings' | 'getProxyInfo' | 'setProxyInfo' | 'logger' | 'showErrorDialog'
> &
  Pick<RegisterProxyPromptOptions, 'coordinator' | 'fireAndForget' | 'showWindow'> &
  Pick<ProxyLoginOptions<WebContents>, 'getProxySettings'>;

export const createProxyLoginHandler =
  <WebContents extends ProxyLoginView>(options: ProxyLoginHandlerOptions<WebContents>) =>
  (
    event: {preventDefault(): void},
    webContents: WebContents,
    _responseDetails: unknown,
    authInfo: Readonly<{isProxy: boolean; host: string; port: number}>,
    authenticate: (username?: string, password?: string) => void,
  ): void => {
    if (!authInfo.isProxy) {
      return;
    }
    event.preventDefault();
    options.fireAndForget(() =>
      handleProxyLogin({
        authInfo,
        webContents,
        getProxySettings: options.getProxySettings,
        applyProxySettings: options.applyProxySettings,
        setProxyInfo: options.setProxyInfo,
        authenticate,
        showPrompt: () =>
          showRegisteredProxyPrompt({
            actions: createProxyPromptActions({
              applyProxySettings: options.applyProxySettings,
              authenticate,
              authInfo,
              challengedSession: webContents.session,
              getProxyInfo: options.getProxyInfo,
              logger: options.logger,
              challengedView: {webContents, reload: () => webContents.reload()},
              setProxyInfo: options.setProxyInfo,
              showErrorDialog: options.showErrorDialog,
            }),
            coordinator: options.coordinator,
            fireAndForget: options.fireAndForget,
            showWindow: options.showWindow,
          }),
      }),
    );
  };
