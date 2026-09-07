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

import * as assert from 'assert';

import {configureLegacyWebviewPreferences} from './LegacyWebviewPreferences';

describe('legacy webview preferences', () => {
  it('[security-target][INV-001][INV-002][SEC-005] enforces the isolated preload boundary at attachment', () => {
    const parameters = {allowpopups: 'true'};
    const preferences = {contextIsolation: false, nodeIntegration: true, sandbox: true};

    configureLegacyWebviewPreferences(preferences, parameters, {
      additionalArguments: ['--wire-desktop-locale=en'],
      preload: '/fixed/preload-webview.js',
      spellcheck: true,
    });

    assert.deepStrictEqual(parameters, {
      allowpopups: 'true',
      autosize: 'false',
      contextIsolation: 'true',
      plugins: 'false',
    });
    assert.deepStrictEqual(preferences, {
      additionalArguments: ['--wire-desktop-locale=en'],
      allowRunningInsecureContent: false,
      contextIsolation: true,
      experimentalFeatures: false,
      nodeIntegration: false,
      preload: '/fixed/preload-webview.js',
      sandbox: false,
      spellcheck: true,
      webSecurity: true,
    });
  });
});
