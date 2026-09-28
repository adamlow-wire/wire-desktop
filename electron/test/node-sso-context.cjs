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

// Node-only SSO policy adapter. Hosted native tests use Electron directly.
require('./node-settings-context.cjs');
const electron = require('electron');
electron.app.getLocale = () => 'en';
electron.session = {
  fromPartition: () => {
    throw new Error('Test must supply its owned session.');
  },
};
electron.shell = {
  openExternal: async () => {
    throw new Error('Test must supply its owned external opener.');
  },
};
require('../src/logging/getLogger.ts').ENABLE_LOGGING = true;
