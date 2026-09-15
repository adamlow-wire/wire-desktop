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

import {strict as assert} from 'assert';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import sinon from 'sinon';

import {backupFiles, restoreFiles} from './bin-utils';

describe('build metadata backup recovery', () => {
  let root: string;
  const backups: string[] = [];
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-backup-test-'));
  });
  afterEach(async () => {
    sinon.restore();
    await Promise.all([root, ...backups.splice(0)].map(directory => fs.remove(directory)));
  });
  async function file(name: string, content: string) {
    const target = path.join(root, name);
    await fs.outputFile(target, content);
    return target;
  }
  async function backup(paths: string[]) {
    const result = await backupFiles(paths);
    backups.push(result.tempDir);
    return result;
  }

  it('[characterization][PKG-001] restores exact bytes and removes successful backups', async () => {
    const original = '  {"version":"original"}\r\n';
    const target = await file('package.json', original);
    const saved = await backup([target]);
    await fs.writeFile(target, 'changed');
    await restoreFiles(saved);
    assert.equal(await fs.readFile(target, 'utf8'), original);
    assert.equal(await fs.pathExists(saved.tempDir), false);
  });
  it('[security-target][PKG-001] independently restores files with identical basenames', async () => {
    const first = await file('first/config.json', 'first original');
    const second = await file('second/config.json', 'second original');
    const saved = await backup([first, second]);
    await fs.writeFile(first, 'changed first');
    await fs.writeFile(second, 'changed second');
    await restoreFiles(saved);
    assert.equal(await fs.readFile(first, 'utf8'), 'first original');
    assert.equal(await fs.readFile(second, 'utf8'), 'second original');
  });
  it('[security-target][PKG-001] snapshots caller paths before asynchronous work', async () => {
    const original = await file('original.json', 'original');
    const unrelated = await file('unrelated.json', 'unrelated');
    const paths = [original];
    const saving = backup(paths);
    paths[0] = unrelated;
    const saved = await saving;
    await fs.writeFile(original, 'changed');
    await restoreFiles(saved);
    assert.equal(await fs.readFile(original, 'utf8'), 'original');
    assert.equal(await fs.readFile(unrelated, 'utf8'), 'unrelated');
  });
  it('[characterization][PKG-001] retains backups after restore failure and allows recovery', async () => {
    const target = await file('package.json', 'original');
    const saved = await backup([target]);
    await fs.remove(target);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, 'occupied'), 'keep');
    await assert.rejects(restoreFiles(saved));
    assert.equal(await fs.readFile(saved.backupPaths[0], 'utf8'), 'original');
    assert.equal(await fs.readFile(path.join(target, 'occupied'), 'utf8'), 'keep');
    await fs.remove(target);
    await restoreFiles(saved);
    assert.equal(await fs.readFile(target, 'utf8'), 'original');
    assert.equal(await fs.pathExists(saved.tempDir), false);
  });
  it('[security-target][PKG-001] waits for pending backup copies before cleaning a failed backup', async () => {
    const first = await file('first.json', 'first');
    const second = await file('second.json', 'second');
    const controlled = new Error('controlled copy failure');
    let release!: () => void;
    let started!: () => void;
    let finished!: () => void;
    const copied = new Promise<void>(resolve => {
      finished = resolve;
    });
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const copying = new Promise<void>(resolve => {
      started = resolve;
    });
    const actualCopy = fs.copy.bind(fs);
    let directory = '';
    sinon.stub(fs, 'copy').callsFake((async (source: string, destination: string) => {
      directory = path.dirname(destination);
      if (source === first) {
        throw controlled;
      }
      started();
      await pending;
      try {
        await actualCopy(source, destination);
      } finally {
        finished();
      }
    }) as typeof fs.copy);
    let settled = false;
    const outcome = backupFiles([first, second]).then(
      () => {
        settled = true;
        return undefined;
      },
      error => {
        settled = true;
        return error;
      },
    );
    await copying;
    await new Promise(resolve => setImmediate(resolve));
    const settledBeforeRelease = settled;
    release();
    const error = await outcome;
    // Drain the instrumented copy even if the old implementation returned early.
    await copied;
    sinon.restore();
    backups.push(directory);
    assert.equal(error, controlled);
    assert.equal(settledBeforeRelease, false);
    assert.equal(await fs.pathExists(directory), false);
    assert.equal(await fs.readFile(first, 'utf8'), 'first');
    assert.equal(await fs.readFile(second, 'utf8'), 'second');
  });
});
