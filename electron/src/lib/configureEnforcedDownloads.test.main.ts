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

import type {DownloadItem} from 'electron';
import type electronDl from 'electron-dl';

import {strict as assert} from 'assert';

import {configureEnforcedDownloads} from './configureEnforcedDownloads';

import {resolveWindowsDownloadPath} from '../security/WindowsDownloadPath';

const setup = () => {
  const calls: string[] = [];
  let options: electronDl.Options | undefined;
  let linked = false;
  const dependencies = {
    resolvePath: (value: string) =>
      resolveWindowsDownloadPath('C:\\Users\\wire', value, () => ({
        isDirectory: () => true,
        isSymbolicLink: () => linked,
      })),
    ensureDirectory: (directory: string) => {
      calls.push(`ensure:${directory}`);
    },
    configure: (value: electronDl.Options) => {
      options = value;
      calls.push('configure');
    },
    blockDownloads: () => {
      calls.push('block');
    },
    notifyComplete: (directory: string) => {
      calls.push(`notify:${directory}`);
    },
    logRejected: () => {
      calls.push('rejected');
    },
  };
  return {
    calls,
    dependencies,
    getOptions: () => options!,
    linkDirectory: () => {
      linked = true;
    },
  };
};

describe('enforced download setup', () => {
  it('[CAP-005] preserves prepared automatic downloads and completion notification', () => {
    const fixture = setup();
    configureEnforcedDownloads('Documents/Wire', fixture.dependencies);
    const options = fixture.getOptions();
    assert.equal(options.directory, 'C:\\Users\\wire\\Documents\\Wire');
    assert.equal(options.saveAs, false);
    options.onStarted!({
      cancel: (): void => {
        assert.fail('Unexpected cancellation');
      },
    } as DownloadItem);
    options.onCompleted!({} as electronDl.File);
    assert.deepEqual(fixture.calls, [
      'ensure:C:\\Users\\wire\\Documents\\Wire',
      'configure',
      'notify:C:\\Users\\wire\\Documents\\Wire',
    ]);
  });

  it('[CAP-005] leaves ordinary downloads unchanged when no enforced path is configured', () => {
    const fixture = setup();
    configureEnforcedDownloads(undefined, fixture.dependencies);
    configureEnforcedDownloads('', fixture.dependencies);
    assert.deepEqual(fixture.calls, []);
  });

  for (const value of ['..\\outside', 'NUL.txt', '\\\\server\\share']) {
    it(`[security-target][CAP-005] blocks downloads for unsafe saved configuration ${JSON.stringify(value)}`, () => {
      const fixture = setup();
      configureEnforcedDownloads(value, fixture.dependencies);
      assert.deepEqual(fixture.calls, ['rejected', 'block']);
    });
  }

  it('[security-target][CAP-005] fails closed when directory preparation fails', () => {
    const fixture = setup();
    fixture.dependencies.ensureDirectory = () => {
      throw new Error('Access denied');
    };
    configureEnforcedDownloads('Documents', fixture.dependencies);
    assert.deepEqual(fixture.calls, ['rejected', 'block']);
  });

  it('[security-target][CAP-005] cancels if an approved directory becomes a link before download', () => {
    const fixture = setup();
    configureEnforcedDownloads('Documents', fixture.dependencies);
    fixture.calls.length = 0;
    fixture.linkDirectory();
    fixture.getOptions().onStarted!({
      cancel: (): void => {
        fixture.calls.push('cancel');
      },
    } as DownloadItem);
    assert.deepEqual(fixture.calls, ['cancel', 'rejected']);
  });
});
