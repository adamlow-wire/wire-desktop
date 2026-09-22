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

import fs from 'fs-extra';

import {strict as assert} from 'assert';
import {createRequire} from 'module';
import os from 'os';
import path from 'path';

const requireTool = createRequire(path.resolve('package.json'));
const {createPackage} = requireTool('@electron/asar');
const {required, canaries, verifyArchive, findArchives, main} = requireTool(
  './bin/test-tools/verify-package-contents.cjs',
);

describe('[PKG-001] actual archive content verification', () => {
  let root: string;
  let input: string;
  let archive: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-archive-test-'));
    input = path.join(root, 'input');
    archive = path.join(root, 'build', 'resources', 'app.asar');
    for (const file of [...required, 'node_modules/example/package.json']) {
      await fs.outputFile(path.join(input, file), 'fixture');
    }
    await fs.writeJson(path.join(input, 'package.json'), {main: 'electron/dist/main.js'});
    await fs.ensureDir(path.dirname(archive));
  });
  afterEach(async () => {
    await fs.remove(root);
  });
  it('inspects a real ASAR and records its hash and required files', async () => {
    await createPackage(input, archive);
    const result = await verifyArchive(archive);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.requiredFiles, required.length);
    assert.deepEqual(findArchives(path.join(root, 'build')), [archive]);
    await fs.writeFile(path.join(input, 'electron/dist/main.js'), 'changed runtime bytes');
    await createPackage(input, archive);
    assert.notEqual((await verifyArchive(archive)).sha256, result.sha256);
  });
  for (const forbidden of [
    ...canaries,
    'electron/dist/main.js.map',
    'electron/dist/main.d.ts',
    'electron/dist/runtime.test.main.js',
    'electron/src/main.ts',
    'electron/secret.pem',
    'electron/dist/secret.json',
    'electron/html/unrelated.html',
  ]) {
    it(`rejects archived ${forbidden}`, async () => {
      await fs.outputFile(path.join(input, forbidden), 'synthetic');
      await createPackage(input, archive);
      await assert.rejects(verifyArchive(archive), /Package contains/);
    });
  }
  it('[PKG-002][characterization] accepts disabled updates from an actual unsigned macOS ASAR', async () => {
    await fs.writeJson(path.join(input, 'electron/wire.json'), {macAutoUpdateEnabled: false});
    await createPackage(input, archive);
    assert.match((await verifyArchive(archive, {unsignedMacOS: true})).sha256, /^[a-f0-9]{64}$/);
  });
  for (const policy of [undefined, true, 'false', null, 0, {}]) {
    it(`[PKG-002][security-target] rejects unsigned macOS policy ${JSON.stringify(policy)}`, async () => {
      await fs.writeJson(path.join(input, 'electron/wire.json'), {macAutoUpdateEnabled: policy});
      await createPackage(input, archive);
      await assert.rejects(verifyArchive(archive, {unsignedMacOS: true}), /Unsigned macOS update policy/);
      await assert.rejects(main(['--unsigned-macos', path.join(root, 'build')]), /Unsigned macOS update policy/);
    });
  }
  it('[PKG-002][security-target] rejects malformed unsigned macOS metadata', async () => {
    await fs.writeFile(path.join(input, 'electron/wire.json'), '{synthetic-invalid-json');
    await createPackage(input, archive);
    await assert.rejects(verifyArchive(archive, {unsignedMacOS: true}), /Unsigned macOS update policy/);
  });
  it('[PKG-002][security-target] reads archived policy rather than changed source metadata', async () => {
    await fs.writeJson(path.join(input, 'electron/wire.json'), {macAutoUpdateEnabled: true});
    await createPackage(input, archive);
    await fs.writeJson(path.join(input, 'electron/wire.json'), {macAutoUpdateEnabled: false});
    await assert.rejects(verifyArchive(archive, {unsignedMacOS: true}), /Unsigned macOS update policy/);
  });
  it('rejects missing privileged preload instead of accepting any valid ASAR', async () => {
    await fs.remove(path.join(input, 'electron/dist/preload/preload-secure-account.js'));
    await createPackage(input, archive);
    await assert.rejects(verifyArchive(archive), /Required package file missing/);
  });
  it('rejects an unexpected runtime entry point', async () => {
    await fs.writeJson(path.join(input, 'package.json'), {main: 'unrelated.js'});
    await createPackage(input, archive);
    await assert.rejects(verifyArchive(archive), /Unexpected package entry point/);
  });
  it('rejects a directory in place of a required runtime file', async () => {
    const file = path.join(input, 'electron/dist/main.js');
    await fs.remove(file);
    await fs.ensureDir(file);
    await fs.writeFile(path.join(file, 'placeholder'), 'fixture');
    await createPackage(input, archive);
    await assert.rejects(verifyArchive(archive), /Required package file is a directory/);
  });
  it('rejects an archive without runtime dependencies', async () => {
    await fs.remove(path.join(input, 'node_modules'));
    await createPackage(input, archive);
    await assert.rejects(verifyArchive(archive), /Runtime dependencies missing/);
  });
  it('fails when no actual archive was produced', async () => {
    await assert.rejects(main([path.join(root, 'missing')]), /No packaged app.asar/);
  });
  it('seeds owned canaries without overwriting existing input', async () => {
    await main(['--seed', root]);
    for (const file of canaries) {
      assert.equal(await fs.readFile(path.join(root, file), 'utf8'), 'synthetic non-secret package canary\n');
    }
    await assert.rejects(main(['--seed', root]), {code: 'EEXIST'});
  });
});
