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

import AdmZip from 'adm-zip';
import fs from 'fs-extra';

import {strict as assert} from 'assert';
import os from 'os';
import path from 'path';

import {streamLogFilesToZip} from './logExport';
import {createLogArchiveDependencies} from './logExportDependencies';

describe('[CAP-004][F-017] log export destination recovery', () => {
  let root: string;
  let destinationPath: string;
  const previous = Buffer.from('owned previous archive bytes');
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-export-recovery-'));
    destinationPath = path.join(root, 'previous.zip');
    await fs.writeFile(destinationPath, previous);
  });
  afterEach(async () => {
    await fs.remove(root);
  });
  it('[characterization] replaces a chosen existing destination with a complete valid archive', async () => {
    const logPath = path.join(root, 'console.log');
    await fs.writeFile(logPath, 'owned log content');
    await streamLogFilesToZip({
      ...createLogArchiveDependencies(() => {}),
      destinationPath,
      snapshotFiles: [{absolutePath: logPath, relativePath: 'console.log'}],
    });
    const zip = new AdmZip(destinationPath);
    assert.deepEqual(
      zip.getEntries().map(entry => entry.entryName),
      ['console.log'],
    );
    assert.equal(zip.readAsText('console.log'), 'owned log content');
  });
  for (const phase of ['archive-creation', 'output-write']) {
    it(`[regression-target] ${phase} failure preserves the existing destination bytes`, async () => {
      const failure = new Error('synthetic export failure');
      const dependencies = createLogArchiveDependencies(() => {});
      await assert.rejects(
        streamLogFilesToZip({
          ...dependencies,
          destinationPath,
          snapshotFiles: [],
          createArchive:
            phase === 'archive-creation'
              ? () => {
                  throw failure;
                }
              : dependencies.createArchive,
          createOutputStream: target => {
            const stream = dependencies.createOutputStream(target);
            if (phase === 'output-write') {
              stream.once('open', () => stream.destroy(failure));
            }
            return stream;
          },
        }),
        error => error === failure,
      );
      assert.deepEqual(await fs.readFile(destinationPath), previous);
      assert.deepEqual(await fs.readdir(root), ['previous.zip']);
    });
  }
});
