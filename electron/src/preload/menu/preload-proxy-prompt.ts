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

import {ipcRenderer} from 'electron';

import {EVENT_TYPE} from '../../lib/eventType';
import {cancelProxyPrompt, requestProxyPromptLocaleValues, submitProxyPrompt} from '../../security/ProxyPromptIpc';

const logger = {error: (message: string, error: unknown): void => console.error(message, error)};

export const renderProxyPromptLocales = (_event: unknown, labels: Record<string, string>): void => {
  for (const label in labels) {
    const labelElement = document.querySelector(`[data-string="${label}"]`);
    if (labelElement) {
      labelElement.textContent = labels[label];
    }
  }
};

export const loadedProxyPromptScreen = async (): Promise<void> => {
  const labels = [];
  const dataStrings = document.querySelectorAll<HTMLDivElement>('[data-string]');

  for (const index in dataStrings) {
    const label = dataStrings[index];
    const localeLabel = label.dataset?.string;
    if (localeLabel !== undefined) {
      labels.push(localeLabel);
    }
  }

  const localeValues = await requestProxyPromptLocaleValues(ipcRenderer, labels, logger);
  if (localeValues) {
    renderProxyPromptLocales(null, localeValues);
  }

  const okButton = document.querySelector<HTMLButtonElement>('#okButton');
  const cancelButton = document.querySelector<HTMLButtonElement>('#cancelButton');
  const usernameInput = document.querySelector<HTMLInputElement>('#usernameInput');
  const passwordInput = document.querySelector<HTMLInputElement>('#passwordInput');
  const form = document.querySelector<HTMLInputElement>('#form');

  if (cancelButton && okButton && usernameInput && passwordInput && form) {
    usernameInput.focus();

    const sendData = async (): Promise<void> => {
      const submitted = await submitProxyPrompt(
        ipcRenderer,
        {
          password: passwordInput.value,
          username: usernameInput.value,
        },
        logger,
      );
      if (submitted) {
        window.close();
      }
    };

    const cancel = async (): Promise<void> => {
      if (await cancelProxyPrompt(ipcRenderer, logger)) {
        window.close();
      }
    };

    cancelButton.addEventListener('click', () => {
      void cancel();
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      void sendData();
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        void cancel();
      }
    });
  }
};

ipcRenderer.once(EVENT_TYPE.PROXY_PROMPT.LOADED, () => void loadedProxyPromptScreen());
