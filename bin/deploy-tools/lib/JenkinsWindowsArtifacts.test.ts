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

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const windowsPipeline = fs.readFileSync(path.resolve(process.cwd(), 'jenkins/windows.groovy'), 'utf8');

describe('Jenkins Windows build artifacts', () => {
  it('[security-target][SEC-011] signs every Wire Gov application that the release stage verifies', () => {
    const signApplication = windowsPipeline
      .split("stage('Sign application')")[1]
      ?.split("stage('Build installers')")[0];
    const verifyApplication = windowsPipeline.split("stage('verify')")[1]?.split("stage('Print hash')")[0];
    assert.ok(signApplication, 'Application signing stage must exist.');
    assert.ok(verifyApplication, 'Release verification stage must exist.');
    const signingCondition = signApplication.match(/if \(([^)]*)\)/)?.[1];
    const verificationCondition = verifyApplication.match(/if \(([^)]*)\)/)?.[1];
    assert.ok(signingCondition && verificationCondition, 'Both stages need explicit release conditions.');
    assert.match(verificationCondition, /\bwireGov\b/, 'Wire Gov executables must be verified.');
    assert.equal(signingCondition, verificationCondition, 'Every verified application must first be signed.');
    assert.match(signApplication, /smctl sign/);
    assert.match(verifyApplication, /signtool\.exe verify/);
  });

  it('fails the build unless both complete installer families were produced', () => {
    for (const artifact of ['*-Setup.exe', '*-full.nupkg', 'RELEASES', '*.msi']) {
      assert.ok(
        windowsPipeline.includes(`if not exist "wrap\\\\dist\\\\${artifact}"`),
        `Missing an explicit Jenkins artifact gate for ${artifact}`,
      );
    }
  });
});
