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

interface WebviewAttachParameters {
  [key: string]: string | undefined;
  autosize?: string;
  contextIsolation?: string;
  plugins?: string;
}

interface WebviewPreferences {
  additionalArguments?: string[];
  allowRunningInsecureContent?: boolean;
  contextIsolation?: boolean;
  experimentalFeatures?: boolean;
  nodeIntegration?: boolean;
  preload?: string;
  sandbox?: boolean;
  spellcheck?: boolean;
  webSecurity?: boolean;
}

export const configureLegacyWebviewPreferences = (
  preferences: WebviewPreferences,
  parameters: WebviewAttachParameters,
  options: {additionalArguments: string[]; preload: string; spellcheck: boolean},
): void => {
  parameters.autosize = 'false';
  parameters.contextIsolation = 'true';
  parameters.plugins = 'false';
  preferences.additionalArguments = options.additionalArguments;
  preferences.allowRunningInsecureContent = false;
  preferences.contextIsolation = true;
  preferences.experimentalFeatures = false;
  preferences.nodeIntegration = false;
  preferences.preload = options.preload;
  preferences.sandbox = false;
  preferences.spellcheck = options.spellcheck;
  preferences.webSecurity = true;
};
