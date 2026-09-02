/*
 * Wire
 * Copyright (C) 2020 Wire Swiss GmbH
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

import {dialog} from 'electron';
import * as fs from 'fs-extra';
import {stub} from 'sinon';
import {Maybe} from 'true-myth';

import * as assert from 'assert';
import * as path from 'path';

import {chooseLogDownloadPath, downloadFile, downloadImage, downloadLogArchive, suggestFileName} from './download';

import {withTemporaryDirectory} from '../../test/withTemporaryDirectory';

describe('download', () => {
  it('converts colons to dashes because colons cannot be used in filenames on Windows', async () => {
    // May 4th 2020, 13:42:00
    const actual = suggestFileName(Maybe.just('1588599720000'));
    const expected = `Wire 2020-05-04 at 13-42-00`;

    assert.equal(actual, expected);
  });

  it('does no export work when the save dialog is cancelled', async () => {
    let exportWorkCount = 0;

    await downloadLogArchive({
      async chooseDestinationPath() {
        return Maybe.nothing<string>();
      },
      async writeArchive() {
        exportWorkCount += 1;
      },
    });

    assert.strictEqual(exportWorkCount, 0);
  });

  it('writes the archive only after a destination has been selected', async () => {
    const events: string[] = [];

    await downloadLogArchive({
      async chooseDestinationPath() {
        events.push('choose-destination');

        return Maybe.just('logs.zip');
      },
      async writeArchive() {
        events.push('write-archive');
      },
    });

    assert.deepStrictEqual(events, ['choose-destination', 'write-archive']);
  });

  it('[characterization] suggests a dated ZIP path and returns the selected destination', async () => {
    const showSaveDialog = stub(dialog, 'showSaveDialog').resolves({
      canceled: false,
      filePath: '/tmp/wire-selected-logs.zip',
    });

    try {
      const actualPath = await chooseLogDownloadPath(new Date('2026-09-02T10:45:00.000Z'));

      assert.strictEqual(actualPath.unwrapOr(''), '/tmp/wire-selected-logs.zip');
      assert.strictEqual(showSaveDialog.firstCall.firstArg.defaultPath, 'wire-logs-2026-09-02-10-45.zip');
    } finally {
      showSaveDialog.restore();
    }
  });

  it('[characterization] fails closed when choosing a log destination throws', async () => {
    const showSaveDialog = stub(dialog, 'showSaveDialog').rejects(new Error('controlled dialog failure'));

    try {
      const actualPath = await chooseLogDownloadPath(new Date('2026-09-02T10:45:00.000Z'));

      assert.strictEqual(actualPath.isNothing, true);
    } finally {
      showSaveDialog.restore();
    }
  });

  it(
    '[characterization] writes image bytes only to the selected path and preserves the detected extension',
    withTemporaryDirectory('wire-download-', async temporaryDirectory => {
      const destinationPath = path.join(temporaryDirectory, 'image.png');
      const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const showSaveDialog = stub(dialog, 'showSaveDialog').resolves({canceled: false, filePath: destinationPath});

      try {
        await downloadImage(pngBytes, Maybe.just('1588599720000'));

        assert.deepStrictEqual(await fs.readFile(destinationPath), Buffer.from(pngBytes));
        assert.match(showSaveDialog.firstCall.firstArg.defaultPath ?? '', /\.png$/);
        assert.deepStrictEqual(showSaveDialog.firstCall.firstArg.filters, [{extensions: ['png'], name: 'Images'}]);
      } finally {
        showSaveDialog.restore();
      }
    }),
  );

  it(
    '[characterization] does not write a file when the save dialog is cancelled',
    withTemporaryDirectory('wire-download-cancel-', async temporaryDirectory => {
      const destinationPath = path.join(temporaryDirectory, 'cancelled.bin');
      const showSaveDialog = stub(dialog, 'showSaveDialog').resolves({canceled: true});

      try {
        await downloadFile(Uint8Array.from([1, 2, 3]), destinationPath, {});

        assert.strictEqual(await fs.pathExists(destinationPath), false);
      } finally {
        showSaveDialog.restore();
      }
    }),
  );
});
