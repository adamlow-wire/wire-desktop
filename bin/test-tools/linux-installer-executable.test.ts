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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 */

import {createPackage} from '@electron/asar';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));
const workflow = fs.readFileSync(path.resolve('.github/workflows/electron-modernization-baseline.yml'), 'utf8');

describe('[PKG-001][F-026] extracted Linux installer executable ownership', () => {
  let root: string;
  let input: string;
  let application: string;
  let archive: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-linux-installer-smoke-'));
    input = path.join(root, 'input');
    application = path.join(root, 'opt', 'WireInternal');
    archive = path.join(application, 'resources', 'app.asar');
    fs.mkdirSync(input);
    fs.mkdirSync(path.dirname(archive), {recursive: true});
    fs.writeFileSync(path.join(input, 'package.json'), JSON.stringify({desktopName: 'wire-desktop-internal'}));
    await createPackage(input, archive);
    fs.writeFileSync(path.join(application, 'wire-desktop-internal'), 'fixture executable');
    fs.chmodSync(path.join(application, 'wire-desktop-internal'), 0o755);
    fs.writeFileSync(path.join(application, 'chrome-sandbox'), 'fixture helper');
  });
  afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

  it('uses the archived desktop identity to select a real executable with no -desktop suffix', () => {
    const {resolveLinuxInstallerExecutable} = requireCjs('./bin/test-tools/resolve-linux-installer-executable.cjs');
    assert.equal(resolveLinuxInstallerExecutable(root), path.join(application, 'wire-desktop-internal'));
    assert.ok(workflow.includes('resolve-linux-installer-executable.cjs'));
  });

  it('rejects a missing or symlinked executable', () => {
    const {resolveLinuxInstallerExecutable} = requireCjs('./bin/test-tools/resolve-linux-installer-executable.cjs');
    const executable = path.join(application, 'wire-desktop-internal');
    fs.rmSync(executable);
    assert.throws(() => resolveLinuxInstallerExecutable(root), /executable/);
    fs.symlinkSync('chrome-sandbox', executable);
    assert.throws(() => resolveLinuxInstallerExecutable(root), /executable/);
  });

  it('rejects unsafe archived executable names', async () => {
    const {resolveLinuxInstallerExecutable} = requireCjs('./bin/test-tools/resolve-linux-installer-executable.cjs');
    fs.writeFileSync(path.join(input, 'package.json'), JSON.stringify({desktopName: '../outside'}));
    await createPackage(input, archive);
    assert.throws(() => resolveLinuxInstallerExecutable(root), /desktop identity/);
  });
});
