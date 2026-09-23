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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));
const workflow = fs.readFileSync(path.resolve('.github/workflows/electron-modernization-baseline.yml'), 'utf8');

describe('unsigned Windows installer CI gate', () => {
  it('builds both installer families and validates their outputs', () => {
    assert.ok(workflow.includes('build:win:installers:manual'), 'Windows matrix must build Squirrel and MSI');
    assert.ok(workflow.includes('APP_ENV: internal'), 'Package job must build a coherent internal product');
    assert.ok(workflow.includes('verify-windows-installers.cjs'), 'Windows job must inspect installer deliverables');
    assert.ok(workflow.includes('msiexec.exe -ArgumentList'), 'Windows job must extract the built MSI');
    assert.ok(workflow.includes('package-contents-windows-msi.json'), 'Windows job must compare the MSI payload');
  });

  it('bounds each installer command and terminates a stalled direct process', () => {
    const smoke = fs.readFileSync(path.resolve('bin/test-tools/smoke-windows-installers.ps1'), 'utf8');
    const processHelper = smoke
      .split('function Invoke-CheckedProcess(')[1]
      ?.split('function Assert-InstalledArchive(')[0];
    assert.ok(processHelper, 'Installed-app smoke must own a process helper.');
    assert.match(processHelper, /\.WaitForExit\(180000\)/, 'Each installer process needs a three-minute deadline.');
    assert.match(processHelper, /\.Kill\(\$true\)/, 'A timed-out process tree must be terminated.');
    assert.match(processHelper, /throw .*did not complete within three minutes/, 'Timeout must fail the package gate.');
    assert.doesNotMatch(
      processHelper,
      /Start-Process[^\n]*-Wait/,
      'Unbounded process-tree waits hide the failing phase.',
    );
  });

  it('runs installed-app smoke from both Windows installer families', () => {
    assert.ok(workflow.includes('smoke-windows-installers.ps1'), 'Installer package job must run installed-app smoke');
  });

  it('bounds the installed Windows installer smoke job for diagnostic failure', () => {
    const installed = workflow
      .split('- name: Smoke-test applications installed by both Windows installers\n')[1]
      ?.split('\n      - name:')[0];
    assert.ok(installed, 'Installed Windows smoke step must exist');
    assert.match(installed, /timeout-minutes: 15/, 'Installed smoke must not wait indefinitely');
  });

  it('requires an explicit managed policy for each installed Windows startup', () => {
    const smoke = fs.readFileSync(path.resolve('bin/test-tools/smoke-windows-installers.ps1'), 'utf8');
    assert.match(smoke, /function Invoke-ManagedPackagedSmoke\(/);
    assert.match(smoke, /if \(\$null -ne \$existing\) \{ throw 'Refusing to replace existing managed policy\.' \}/);
    assert.match(smoke, /New-ItemProperty -Path \$policy -Name applockOverride -PropertyType DWord -Value 1/);
    assert.match(smoke, /\$env:M3_EXPECT_APPLOCK_OVERRIDE = 'true'/);
    assert.match(smoke, /Remove-ItemProperty -Path \$policy -Name applockOverride -ErrorAction SilentlyContinue/);
    assert.match(smoke, /Invoke-ManagedPackagedSmoke \$applications\[0\] 'Squirrel installed'/);
    assert.match(smoke, /Invoke-ManagedPackagedSmoke \$application 'MSI installed'/);
    assert.match(smoke, /Invoke-ManagedPackagedSmoke \$application 'MSI installed managed\/proxy'/);
    assert.doesNotMatch(smoke, /Invoke-PackagedSmoke \$applications\[0\] 'Squirrel installed'/);
    assert.doesNotMatch(smoke, /Invoke-PackagedSmoke \$application 'MSI installed'/);
  });

  async function withPackages(check: (dist: string, build: string) => void | Promise<void>): Promise<void> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-windows-installer-gate-'));
    const dist = path.join(root, 'dist');
    const build = path.join(root, 'build');
    fs.mkdirSync(dist);
    const resources = path.join(build, 'Wire-win32-x64', 'resources');
    fs.mkdirSync(resources, {recursive: true});
    fs.writeFileSync(path.join(resources, 'app.asar'), 'verified application archive');
    fs.writeFileSync(path.join(dist, 'Wire-Setup.exe'), 'setup executable');
    fs.writeFileSync(path.join(dist, 'Wire-3.44.0-x64.msi'), 'msi package');
    const nupkgName = 'Wire-3.44.0-full.nupkg';
    const zip = new AdmZip();
    zip.addFile('lib/net45/Wire/resources/app.asar', Buffer.from('verified application archive'));
    zip.writeZip(path.join(dist, nupkgName));
    fs.writeFileSync(path.join(dist, 'RELEASES'), `abc ${nupkgName} 123\n`);
    try {
      await check(dist, build);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  }

  it('accepts complete Squirrel and MSI outputs with the verified app archive', async () => {
    const {verifyWindowsInstallers} = requireCjs('./bin/test-tools/verify-windows-installers.cjs');
    await withPackages((dist, build) => {
      const result = verifyWindowsInstallers(dist, build);
      assert.equal(result.squirrelArchiveMatchesBuild, true);
      assert.equal(result.formats.length, 4);
    });
  });

  it('rejects missing or empty installer deliverables', async () => {
    const {verifyWindowsInstallers} = requireCjs('./bin/test-tools/verify-windows-installers.cjs');
    await withPackages((dist, build) => {
      fs.rmSync(path.join(dist, 'Wire-3.44.0-x64.msi'));
      assert.throws(() => verifyWindowsInstallers(dist, build), /MSI/);
      fs.writeFileSync(path.join(dist, 'Wire-3.44.0-x64.msi'), 'msi package');
      fs.writeFileSync(path.join(dist, 'Wire-Setup.exe'), '');
      assert.throws(() => verifyWindowsInstallers(dist, build), /Squirrel setup/);
    });
  });

  it('rejects an installer payload that differs from the verified unpacked archive', async () => {
    const {verifyWindowsInstallers} = requireCjs('./bin/test-tools/verify-windows-installers.cjs');
    await withPackages((dist, build) => {
      fs.writeFileSync(path.join(build, 'Wire-win32-x64', 'resources', 'app.asar'), 'different archive');
      assert.throws(() => verifyWindowsInstallers(dist, build), /Squirrel.*archive/);
    });
  });

  it('rejects release metadata that does not name the actual full package', async () => {
    const {verifyWindowsInstallers} = requireCjs('./bin/test-tools/verify-windows-installers.cjs');
    await withPackages((dist, build) => {
      fs.writeFileSync(path.join(dist, 'RELEASES'), 'other-full.nupkg\n');
      assert.throws(() => verifyWindowsInstallers(dist, build), /RELEASES/);
    });
  });
});
