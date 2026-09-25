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

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

import {S3Deployer} from './S3Deployer';

describe('S3Deployer', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => fs.remove(directory)));
  });

  describe('copyOnS3', () => {
    it(`doesn't upload anything if dry run is set`, async () => {
      const s3Deployer = new S3Deployer({
        accessKeyId: '',
        dryRun: true,
        secretAccessKey: '',
      });

      await assert.doesNotReject(() => s3Deployer.copyOnS3({bucket: '', s3FromPath: '', s3ToPath: ''}));
    });
  });

  describe('findUploadFiles', () => {
    it('[security-target][PKG-002] retains nested Linux application and package paths', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-linux-nested-deployer-'));
      temporaryDirectories.push(basePath);
      const appImage = path.join(basePath, 'release', 'Wire.AppImage');
      const debImage = path.join(basePath, 'release', 'wire.deb');
      await fs.ensureFile(appImage);
      await fs.ensureFile(debImage);
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_linux_production', basePath, '3.42.123');

      assert.deepStrictEqual(files.slice(-2), [
        {fileName: 'Wire.AppImage', filePath: appImage},
        {fileName: 'wire.deb', filePath: debImage},
      ]);
    });

    it('selects the requested native MSI when Squirrel artifacts are also present', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-msi-deployer-'));
      temporaryDirectories.push(basePath);
      const fileName = 'Wire-3.42.123-x64.msi';
      await fs.ensureFile(path.join(basePath, fileName));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.122-x64.msi'));
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.ensureFile(path.join(basePath, 'RELEASES'));
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'msi');

      assert.deepStrictEqual(files, [{fileName, filePath: path.join(basePath, fileName)}]);
    });

    it('[security-target][PKG-002] retains the real path of a nested MSI artifact', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-msi-nested-deployer-'));
      temporaryDirectories.push(basePath);
      const fileName = 'Wire-3.42.123-x64.msi';
      const expectedPath = path.join(basePath, 'release', fileName);
      await fs.ensureFile(expectedPath);
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'msi');

      assert.deepStrictEqual(files, [{fileName, filePath: expectedPath}]);
    });

    it('[security-target][PKG-002] rejects ambiguous MSI artifacts for one version', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-msi-ambiguous-deployer-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-x64.msi'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-arm64.msi'));
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'msi'),
        /exactly one MSI for the requested version/,
      );
    });

    it('selects Squirrel artifacts when an MSI is also present', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-deployer-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-x64.msi'));
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash Wire-3.42.123-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel');

      assert.deepStrictEqual(files, [
        {
          fileName: 'Wire-3.42.123-full.nupkg',
          filePath: path.join(basePath, 'Wire-3.42.123-full.nupkg'),
        },
        {fileName: 'Wire-3.42.123-RELEASES', filePath: path.join(basePath, 'RELEASES')},
        {fileName: 'Wire-3.42.123.exe', filePath: path.join(basePath, 'Wire-Setup.exe')},
      ]);
    });

    it('selects the requested Squirrel package version when an older full package is present', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-version-deployer-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.122-full.nupkg'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.writeFile(
        path.join(basePath, 'RELEASES'),
        'hash Wire-3.42.122-full.nupkg 1\nhash Wire-3.42.123-full.nupkg 1\n',
      );
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel');

      assert.strictEqual(files[0].fileName, 'Wire-3.42.123-full.nupkg');
    });

    it('accepts the real builder casing difference between Setup and full package names', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-actual-case-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'WireInternal-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'wireinternal-3.44.0-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash wireinternal-3.44.0-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.44.0', 'squirrel');

      assert.strictEqual(files[0].fileName, 'wireinternal-3.44.0-full.nupkg');
      assert.strictEqual(files[2].filePath, path.join(basePath, 'WireInternal-Setup.exe'));
    });

    it('retains the selected package directory when artifacts are nested under the search root', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-nested-deployer-'));
      temporaryDirectories.push(basePath);
      const artifactDirectory = path.join(basePath, 'dist');
      await fs.ensureDir(artifactDirectory);
      await fs.ensureFile(path.join(artifactDirectory, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(artifactDirectory, 'Wire-3.42.123-full.nupkg'));
      await fs.writeFile(path.join(artifactDirectory, 'RELEASES'), 'hash Wire-3.42.123-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      const files = await s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel');

      assert.deepStrictEqual(
        files.map(file => file.filePath),
        ['Wire-3.42.123-full.nupkg', 'RELEASES', 'Wire-Setup.exe'].map(fileName =>
          path.join(artifactDirectory, fileName),
        ),
      );
    });

    it('rejects a Squirrel directory without the requested full-package version', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-missing-version-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.122-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash Wire-3.42.122-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel'),
        /exactly one Squirrel full package for the requested version/,
      );
    });

    it('rejects two Squirrel products with the same requested version', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-ambiguous-version-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.ensureFile(path.join(basePath, 'WireInternal-3.42.123-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash Wire-3.42.123-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel'),
        /exactly one Squirrel full package for the requested version/,
      );
    });

    it('rejects a Squirrel setup executable for a different product', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-other-setup-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Other-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash Wire-3.42.123-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel'),
        /exactly one matching Squirrel setup executable/,
      );
    });

    it('rejects RELEASES metadata that omits the selected Squirrel full package', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-squirrel-stale-releases-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.writeFile(path.join(basePath, 'RELEASES'), 'hash Wire-3.42.122-full.nupkg 1\n');
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123', 'squirrel'),
        /RELEASES must name the requested Squirrel full package/,
      );
    });

    it('rejects ambiguous automatic selection when both Windows installer families are present', async () => {
      const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-ambiguous-deployer-'));
      temporaryDirectories.push(basePath);
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-x64.msi'));
      await fs.ensureFile(path.join(basePath, 'Wire-Setup.exe'));
      await fs.ensureFile(path.join(basePath, 'Wire-3.42.123-full.nupkg'));
      await fs.ensureFile(path.join(basePath, 'RELEASES'));
      const s3Deployer = new S3Deployer({accessKeyId: '', dryRun: true, secretAccessKey: ''});

      await assert.rejects(
        s3Deployer.findUploadFiles('wrapper_windows_production', basePath, '3.42.123'),
        /contains both Squirrel and MSI artifacts; select one explicitly/,
      );
    });
  });
});
