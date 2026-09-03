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

import type {WallClock} from '@enormora/wall-clock/wall-clock';
import {Menu, MenuItem} from 'electron';

import {strict as assert} from 'assert';

import {createMenu} from './system';

import * as locale from '../locale';

function findMenuItem(menu: Menu, label: string): MenuItem | undefined {
  for (const item of menu.items) {
    if (item.label === label) {
      return item;
    }
    if (item.submenu) {
      const nested = findMenuItem(item.submenu, label);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

describe('system menu', () => {
  it('[characterization][security-target][INV-003] opens About through the native menu action', () => {
    let showRequests = 0;
    const wallClock = {currentDate: new Date('2026-09-03T00:00:00Z')} as WallClock;
    const menu = createMenu(false, wallClock, () => {
      showRequests += 1;
    });
    const about = findMenuItem(menu, locale.getText('menuAbout'));

    assert.ok(about);
    about.click(undefined as never, undefined as never, undefined as never);
    assert.strictEqual(showRequests, 1);
  });
});
