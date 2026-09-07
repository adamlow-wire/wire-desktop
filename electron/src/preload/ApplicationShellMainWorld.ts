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

type WebviewEditOperation = 'copy' | 'cut' | 'paste' | 'redo' | 'selectAll' | 'undo';

export function sendSelectedWebviewEvent(channel: string, args: unknown[]): void {
  const webview = document.querySelector<Electron.WebviewTag>('.Webview:not(.hide)');
  if (args.length === 0) {
    void webview?.send(channel);
    return;
  }
  void webview?.send(channel, ...args);
}

export function sendAccountWebviewEvent(accountId: string, channel: string, args: unknown[]): void {
  const webview = [...document.querySelectorAll<Electron.WebviewTag>('webview')].find(
    candidate => candidate.dataset.accountid === accountId,
  );
  if (args.length === 0) {
    void webview?.send(channel);
    return;
  }
  void webview?.send(channel, ...args);
}

export function getAccountWebContentsId(accountId: string): number | undefined {
  const webview = [...document.querySelectorAll<Electron.WebviewTag>('webview')].find(
    candidate => candidate.dataset.accountid === accountId,
  );
  return webview?.getWebContentsId();
}

export function operateSelectedWebview(operation: WebviewEditOperation): void {
  const webview = document.querySelector<Electron.WebviewTag>('.Webview:not(.hide)');
  switch (operation) {
    case 'copy':
      webview?.copy();
      break;
    case 'cut':
      webview?.cut();
      break;
    case 'paste':
      webview?.paste();
      break;
    case 'redo':
      webview?.redo();
      break;
    case 'selectAll':
      webview?.selectAll();
      break;
    case 'undo':
      webview?.undo();
      break;
  }
}

export function reloadAllWebviews(): void {
  document.querySelectorAll<Electron.WebviewTag>('webview').forEach(webview => webview.reload());
}

export function focusSelectedWebview(): void {
  const webview = document.querySelector<Electron.WebviewTag>('.Webview:not(.hide)');
  webview?.blur();
  webview?.focus();
}

type MainWorldExecutor = Pick<Electron.ContextBridge, 'executeInMainWorld'>;

export interface ApplicationShellMainWorld {
  focusSelected(): void;
  getWebContentsId(accountId: string): number | undefined;
  operateSelected(operation: WebviewEditOperation): void;
  reloadAll(): void;
  sendToAccount(accountId: string, channel: string, ...args: unknown[]): void;
  sendToSelected(channel: string, ...args: unknown[]): void;
}

export const createApplicationShellMainWorld = (executor: MainWorldExecutor): ApplicationShellMainWorld => ({
  focusSelected: (): void => executor.executeInMainWorld({func: focusSelectedWebview}),
  getWebContentsId: (accountId: string): number | undefined =>
    executor.executeInMainWorld({args: [accountId], func: getAccountWebContentsId}),
  operateSelected: (operation: WebviewEditOperation): void =>
    executor.executeInMainWorld({args: [operation], func: operateSelectedWebview}),
  reloadAll: (): void => executor.executeInMainWorld({func: reloadAllWebviews}),
  sendToAccount: (accountId: string, channel: string, ...args: unknown[]): void =>
    executor.executeInMainWorld({args: [accountId, channel, args], func: sendAccountWebviewEvent}),
  sendToSelected: (channel: string, ...args: unknown[]): void =>
    executor.executeInMainWorld({args: [channel, args], func: sendSelectedWebviewEvent}),
});
