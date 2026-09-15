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

import {ElectronApplication, expect} from '@playwright/test';

/** Require normal native exit, then release the automation connection. */
export const quitApp = async (app: ElectronApplication): Promise<void> => {
  const child = app.process();
  // Native Quit may close the inspector before its reply. Exit is authoritative.
  void app
    .evaluate(({app}) => {
      setImmediate(() => app.quit());
    })
    .catch(() => undefined);
  await expect.poll(() => child.exitCode).toBe(0);
  await app.close();
};
