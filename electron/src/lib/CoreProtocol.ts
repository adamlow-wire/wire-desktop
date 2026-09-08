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

import {app} from 'electron';

import * as path from 'path';

import {EVENT_TYPE} from './eventType';

import {showErrorDialog} from '../lib/showDialog';
import {getLogger} from '../logging/getLogger';
import {platform} from '../runtime/EnvironmentUtil';
import {parseDeepLink} from '../security/deepLinkPolicy';
import {config} from '../settings/config';
import {WindowManager} from '../window/WindowManager';

const logger = getLogger(path.basename(__filename));

const CORE_PROTOCOL_PREFIX = `${config.customProtocolName}://`;

export class CustomProtocolHandler {
  public hashLocation = '';
  private readonly windowManager = WindowManager;

  public async dispatchDeepLink(url?: string): Promise<void> {
    const action = parseDeepLink(url);
    if (!action) {
      showErrorDialog('Invalid deep link.');
      logger.info('Invalid deep link, ignoring');
      return;
    }
    try {
      switch (action.kind) {
        case 'location':
          this.hashLocation = action.location;
          this.windowManager.sendActionToPrimaryWindow(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, action.location);
          break;
        case 'sso-login':
          await this.windowManager.sendActionAndFocusWindow(EVENT_TYPE.ACCOUNT.SSO_LOGIN, action.code);
          break;
        case 'start-login':
          await this.windowManager.sendActionAndFocusWindow(EVENT_TYPE.ACTION.START_LOGIN);
          break;
        case 'join-conversation':
          await this.windowManager.sendActionAndFocusWindow(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {
            code: action.code,
            key: action.key,
            domain: action.domain,
          });
          break;
      }
    } catch (error: unknown) {
      logger.error('Failed to dispatch deep link', error);
    }
  }

  private findDeepLink(argv: string[]): string | void {
    return argv.find(arg => arg.startsWith(CORE_PROTOCOL_PREFIX));
  }

  public registerCoreProtocol(): void {
    if (app.isDefaultProtocolClient(config.customProtocolName)) {
      logger.info(`Custom protocol "${config.customProtocolName}" already registered`);
    } else {
      logger.info(`Registering custom protocol "${config.customProtocolName}" ...`);
      app.setAsDefaultProtocolClient(config.customProtocolName);
    }

    app.on('open-url', async (event, url) => {
      event.preventDefault();
      await this.dispatchDeepLink(url);
    });
    app.once('ready', async () => {
      logger.info('App ready, looking for deep link in arguments ...');
      const deepLink = this.findDeepLink(process.argv);
      if (deepLink) {
        await this.dispatchDeepLink(deepLink);
      } else {
        logger.info('No deep link found in arguments.');
      }
    });
    if (!platform.IS_MAC_OS) {
      app.on('second-instance', async (_event, argv) => {
        logger.info('Second instance detected, looking for deep link in arguments ...');
        const deepLink = this.findDeepLink(argv);
        if (deepLink) {
          await this.dispatchDeepLink(deepLink);
        } else {
          logger.info('No deep link found in arguments.');
        }
      });
    }
  }
}
