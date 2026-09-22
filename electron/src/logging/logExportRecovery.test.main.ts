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
  it('[regression] publishes only a complete private adjacent archive', async () => {
    const dependencies = createLogArchiveDependencies(() => {});
    let published = false;
    await streamLogFilesToZip({
      ...dependencies,
      destinationPath,
      snapshotFiles: [],
      publishArchive: async (stagedPath, target) => {
        assert.equal(target, destinationPath);
        assert.equal(path.dirname(path.dirname(stagedPath)), root);
        assert.notEqual(path.dirname(stagedPath), root);
        if (process.platform !== 'win32') {
          assert.equal((await fs.stat(path.dirname(stagedPath))).mode & 0o077, 0);
          assert.equal((await fs.stat(stagedPath)).mode & 0o077, 0);
        }
        assert.deepEqual(await fs.readFile(destinationPath), previous);
        assert.deepEqual(new AdmZip(stagedPath).getEntries(), []);
        await dependencies.publishArchive(stagedPath, target);
        published = true;
      },
    });
    assert.equal(published, true);
    assert.deepEqual(await fs.readdir(root), ['previous.zip']);
    assert.deepEqual(new AdmZip(destinationPath).getEntries(), []);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(destinationPath)).mode & 0o077, 0);
    }
  });
  for (const phase of ['staging-creation', 'publication']) {
    it(`[regression] ${phase} failure preserves destination and cleans owned staging`, async () => {
      const dependencies = createLogArchiveDependencies(() => {});
      const failure = new Error('synthetic publication failure');
      await assert.rejects(
        streamLogFilesToZip({
          ...dependencies,
          destinationPath,
          snapshotFiles: [],
          createStagingDirectory:
            phase === 'staging-creation'
              ? async () => {
                  throw failure;
                }
              : dependencies.createStagingDirectory,
          publishArchive: async () => {
            throw failure;
          },
        }),
        error => error === failure,
      );
      assert.deepEqual(await fs.readFile(destinationPath), previous);
      assert.deepEqual(await fs.readdir(root), ['previous.zip']);
    });
  }
  it('[regression] failed new export leaves no destination or staging archive', async () => {
    await fs.remove(destinationPath);
    const failure = new Error('synthetic archive failure');
    await assert.rejects(
      streamLogFilesToZip({
        ...createLogArchiveDependencies(() => {}),
        destinationPath,
        snapshotFiles: [],
        createArchive: () => {
          throw failure;
        },
      }),
      error => error === failure,
    );
    assert.deepEqual(await fs.readdir(root), []);
  });
  it('[regression] reports cleanup failure without hiding publication failure or losing prior bytes', async () => {
    const failure = new Error('synthetic publication failure');
    const cleanupFailure = new Error('synthetic cleanup failure');
    const reports: unknown[] = [];
    await assert.rejects(
      streamLogFilesToZip({
        ...createLogArchiveDependencies((message, error) => reports.push({message, error})),
        destinationPath,
        snapshotFiles: [],
        publishArchive: async () => {
          throw failure;
        },
        removeStagingDirectory: async () => {
          throw cleanupFailure;
        },
      }),
      error => error === failure,
    );
    assert.deepEqual(await fs.readFile(destinationPath), previous);
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0], {
      message: 'Failed to remove temporary log archive staging directory',
      error: cleanupFailure,
    });
  });
});
