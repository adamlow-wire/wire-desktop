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

import type {Session, WebContents} from 'electron';

import type {AccountPermissionPolicy} from './AccountPermissionPolicy';

const bindings = new WeakMap<Session, () => void>();

export function bindAccountPermissionSession(
  target: Session,
  contents: WebContents,
  policy: Pick<AccountPermissionPolicy, 'request' | 'check' | 'revoke'>,
  reportFailure: () => void,
): () => void {
  if (contents.isDestroyed() || contents.session !== target) {
    throw new Error('Permission session does not match a live view.');
  }
  bindings.get(target)?.();
  let disposed = false;
  const pending = new Set<(allowed: boolean) => void>();
  const report = () => {
    try {
      reportFailure();
    } catch {
      // Diagnostics must not interrupt denial or teardown.
    }
  };
  const invalidate = () => {
    policy.revoke();
    [...pending].forEach(complete => complete(false));
  };
  const navigate = (details: {isMainFrame: boolean; isSameDocument: boolean}) => {
    if (details.isMainFrame && !details.isSameDocument) {
      invalidate();
    }
  };
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    invalidate();
    contents.removeListener('did-start-navigation', navigate);
    contents.removeListener('destroyed', dispose);
    contents.removeListener('render-process-gone', dispose);
    if (bindings.get(target) === dispose) {
      bindings.delete(target);
      // Null restores Electron defaults, not a deny policy.
      target.setPermissionCheckHandler(() => false);
      target.setPermissionRequestHandler((_sender, _permission, callback) => callback(false));
    }
  };
  bindings.set(target, dispose);
  target.setPermissionCheckHandler((sender, permission, origin, details) => {
    if (disposed || sender !== contents) {
      return false;
    }
    try {
      return policy.check(sender, permission, origin, details) === true;
    } catch {
      report();
      return false;
    }
  });
  target.setPermissionRequestHandler((sender, permission, callback, details) => {
    let completed = false;
    const complete = (allowed: boolean) => {
      if (completed) {
        return;
      }
      completed = true;
      pending.delete(complete);
      try {
        callback(allowed);
      } catch {
        report();
      }
    };
    if (disposed || sender !== contents) {
      complete(false);
      return;
    }
    pending.add(complete);
    void Promise.resolve()
      .then(() => !completed && !disposed && policy.request(sender, permission, details))
      .then(allowed => complete(!disposed && allowed === true))
      .catch(() => {
        complete(false);
        report();
      });
  });
  contents.on('did-start-navigation', navigate);
  contents.once('destroyed', dispose);
  contents.once('render-process-gone', dispose);
  return dispose;
}
