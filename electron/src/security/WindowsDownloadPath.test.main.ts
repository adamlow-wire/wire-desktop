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

import {assert as sinonAssert, stub} from 'sinon';

import {strict as assert} from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {MAX_DOWNLOAD_LOCATION_LENGTH} from './DownloadLocationContract';
import {normalizeWindowsDownloadPath, resolveWindowsDownloadPath} from './WindowsDownloadPath';

const directory = {isDirectory: () => true, isSymbolicLink: () => false};

describe('Windows enforced download path', () => {
  it('[security-target][CAP-005] defaults to filesystem link inspection, not lexical validation alone', () => {
    const inspect = stub(fs, 'lstatSync').returns({...directory, isSymbolicLink: () => true} as fs.Stats);
    try {
      assert.throws(() => resolveWindowsDownloadPath('C:\\Users\\wire', 'Linked'), /safe home-relative directory/);
      sinonAssert.calledOnceWithExactly(inspect, 'C:\\Users\\wire\\Linked');
    } finally {
      inspect.restore();
    }
  });

  if (process.platform === 'win32') {
    it('[security-target][CAP-005] rejects a real Windows junction without touching its target', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-download-path-'));
      const base = path.join(root, 'home');
      const outside = path.join(root, 'outside');
      try {
        fs.mkdirSync(base);
        fs.mkdirSync(outside);
        fs.mkdirSync(path.join(base, 'Documents'));
        assert.equal(resolveWindowsDownloadPath(base, 'Documents'), path.join(base, 'Documents'));
        fs.symlinkSync(outside, path.join(base, 'Linked'), 'junction');
        assert.throws(() => resolveWindowsDownloadPath(base, 'Linked/New'), /safe home-relative directory/);
        assert.deepEqual(fs.readdirSync(outside), []);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    });
  }

  for (const value of [
    '',
    '.',
    '..',
    '../outside',
    'safe/../../outside',
    'safe\\..\\outside',
    '/outside',
    '\\outside',
    'C:\\outside',
    'C:outside',
    '\\\\server\\share',
    '\\\\?\\C:\\outside',
    '\\\\.\\NUL',
    'NUL.txt',
    'NUL .txt',
    'CONIN$',
    'CONOUT$.txt',
    'con',
    'AUX',
    'prn.log',
    'COM1',
    'LPT9.log',
    'COM¹',
    'LPT².txt',
    'COM³',
    'nested/nul/image',
    'folder:stream',
    'folder.',
    'folder ',
    'folder/.. /outside',
    'folder/',
    'file\u0000name',
    'file\nname',
    'file\u007fname',
    'bad<name',
    'bad>name',
    'bad"name',
    'bad|name',
    'bad?name',
    'bad*name',
    'x'.repeat(256),
    'x'.repeat(MAX_DOWNLOAD_LOCATION_LENGTH + 1),
  ]) {
    it(`[security-target][CAP-005] denies ${JSON.stringify(value.slice(0, 60))}`, () => {
      assert.throws(() => normalizeWindowsDownloadPath(value), /safe home-relative directory/);
    });
  }

  it('[CAP-005] normalizes separators while retaining Unicode, spaces and ordinary names', () => {
    assert.equal(normalizeWindowsDownloadPath('Documents//Wire Files\\日本語'), 'Documents\\Wire Files\\日本語');
    assert.equal(normalizeWindowsDownloadPath('.wire/console/COM10/LPT0'), '.wire\\console\\COM10\\LPT0');
    assert.equal(normalizeWindowsDownloadPath('x'.repeat(255)), 'x'.repeat(255));
    const maximumPath = Array.from({length: 17}, () => 'x'.repeat(240)).join('\\');
    assert.equal(maximumPath.length, MAX_DOWNLOAD_LOCATION_LENGTH);
    assert.equal(normalizeWindowsDownloadPath(maximumPath), maximumPath);
  });

  it('[CAP-005] resolves beneath main-owned home and inspects every existing component', () => {
    const inspected: string[] = [];
    assert.equal(
      resolveWindowsDownloadPath('C:\\Users\\wire', 'Documents/Wire', path => {
        inspected.push(path);
        return directory;
      }),
      'C:\\Users\\wire\\Documents\\Wire',
    );
    assert.deepEqual(inspected, ['C:\\Users\\wire\\Documents', 'C:\\Users\\wire\\Documents\\Wire']);
  });

  it('[CAP-005] allows not-yet-created subdirectories without swallowing access errors', () => {
    const missing = () => {
      throw Object.assign(new Error('missing'), {code: 'ENOENT'});
    };
    assert.equal(resolveWindowsDownloadPath('C:\\Users\\wire', 'New/Folder', missing), 'C:\\Users\\wire\\New\\Folder');
    assert.throws(
      () =>
        resolveWindowsDownloadPath('C:\\Users\\wire', 'New', () => {
          throw Object.assign(new Error('denied'), {code: 'EACCES'});
        }),
      /denied/,
    );
  });

  it('[security-target][CAP-005] denies junctions/symlinks and non-directory ancestors', () => {
    assert.throws(
      () =>
        resolveWindowsDownloadPath('C:\\Users\\wire', 'Linked/Outside', () => ({
          ...directory,
          isSymbolicLink: () => true,
        })),
      /safe home-relative directory/,
    );
    assert.throws(
      () =>
        resolveWindowsDownloadPath('C:\\Users\\wire', 'File/Child', () => ({
          ...directory,
          isDirectory: () => false,
        })),
      /safe home-relative directory/,
    );
  });

  for (const base of ['relative', 'C:relative', '\\\\server\\share', '\\\\?\\C:\\home', 'C:\\bad\u0000home']) {
    it(`[security-target][CAP-005] denies non-local or ambiguous base ${JSON.stringify(base)}`, () => {
      assert.throws(
        () => resolveWindowsDownloadPath(base, 'Downloads', () => directory),
        /safe home-relative directory/,
      );
    });
  }
});
