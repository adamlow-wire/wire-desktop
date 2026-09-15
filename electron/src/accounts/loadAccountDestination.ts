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

import type {WebContents} from 'electron';

import {isAllowedAccountNavigation} from '../security/NavigationPolicy';

const REDIRECT_COMPLETION_TIMEOUT_MS = 30_000;

// Preserve an authorized client redirect that supersedes the initial native load.
export async function loadAccountDestination(
  contents: WebContents,
  destination: string,
  isCurrent: () => boolean,
): Promise<void> {
  const origin = new URL(destination).origin;
  let initialNavigation = true;
  let redirected = false;
  let replacementFinished = false;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveContinuation!: (failure?: Error) => void;
  const continuation = new Promise<Error | undefined>(resolve => {
    resolveContinuation = resolve;
  });
  const complete = (failure?: Error) => {
    if (!completed) {
      completed = true;
      resolveContinuation(failure);
    }
  };
  const current = () => !contents.isDestroyed() && isCurrent();
  const cancelled = () => complete(new Error('Account startup navigation was cancelled.'));
  const started = (details: {isMainFrame: boolean; isSameDocument: boolean; url: string}) => {
    if (!details.isMainFrame || details.isSameDocument) {
      return;
    }
    if (initialNavigation) {
      initialNavigation = false;
      return;
    }
    if (!current() || !isAllowedAccountNavigation(details.url, origin)) {
      cancelled();
      return;
    }
    redirected = true;
    replacementFinished = false;
  };
  const stopped = () => {
    if (redirected && replacementFinished) {
      if (!current() || !isAllowedAccountNavigation(contents.getURL(), origin)) {
        cancelled();
      } else if (!contents.isLoadingMainFrame()) {
        complete();
      }
    }
  };
  const finished = () => {
    replacementFinished = redirected;
    stopped();
  };
  const failed = (_event: Electron.Event, code: number, _description: string, _url: string, isMainFrame: boolean) => {
    if (isMainFrame && code !== -3) {
      complete(new Error('Account startup navigation failed.'));
    }
  };
  contents.on('did-start-navigation', started);
  contents.on('did-finish-load', finished);
  contents.on('did-stop-loading', stopped);
  contents.on('did-fail-load', failed);
  contents.on('destroyed', cancelled);
  contents.on('render-process-gone', cancelled);
  try {
    try {
      await contents.loadURL(destination);
    } catch (error) {
      const aborted = error as {code?: unknown; errno?: unknown} | null;
      if (aborted?.code !== 'ERR_ABORTED' || aborted.errno !== -3 || !redirected) {
        throw error;
      }
      // The native promise rejects when a client redirect interrupts pending resources.
      // Do not merely ignore ERR_ABORTED: require the replacement document to finish.
      if (!completed) {
        timer = setTimeout(
          () => complete(new Error('Account startup redirect timed out.')),
          REDIRECT_COMPLETION_TIMEOUT_MS,
        );
      }
      const failure = await continuation;
      if (failure) {
        throw failure;
      }
    }
    if (!current() || !isAllowedAccountNavigation(contents.getURL(), origin)) {
      throw new Error('Account startup destination is no longer authorized.');
    }
  } finally {
    clearTimeout(timer);
    contents.removeListener('did-start-navigation', started);
    contents.removeListener('did-finish-load', finished);
    contents.removeListener('did-stop-loading', stopped);
    contents.removeListener('did-fail-load', failed);
    contents.removeListener('destroyed', cancelled);
    contents.removeListener('render-process-gone', cancelled);
  }
}
