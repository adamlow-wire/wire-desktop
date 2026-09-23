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

const {FuseV1Options, FuseVersion, getCurrentFuseWire} = require('@electron/fuses');

const assert = require('node:assert/strict');

const configured = [
  [FuseV1Options.RunAsNode, '0', 'RunAsNode'],
  [FuseV1Options.EnableCookieEncryption, '1', 'EnableCookieEncryption'],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, '0', 'EnableNodeOptionsEnvironmentVariable'],
  [FuseV1Options.EnableNodeCliInspectArguments, '0', 'EnableNodeCliInspectArguments'],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, '0', 'EnableEmbeddedAsarIntegrityValidation'],
  [FuseV1Options.OnlyLoadAppFromAsar, '1', 'OnlyLoadAppFromAsar'],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, '0', 'GrantFileProtocolExtraPrivileges'],
];

function assertConfiguredFuses(wire) {
  assert.equal(wire?.version, FuseVersion.V1, 'Effective fuse wire must use V1.');
  const positions = Object.keys(wire).filter(key => /^\d+$/.test(key));
  assert.deepEqual(
    positions,
    ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
    'Effective fuse wire must contain all nine reviewed bits.',
  );
  const raw = positions.map(index => String.fromCharCode(wire[index])).join('');
  assert.match(raw, /^[01]{9}$/, 'Effective fuse wire must contain only binary states.');
  for (const [option, expected, name] of configured) {
    assert.equal(raw[option], expected, `Effective fuse ${name} differs from the unsigned build contract.`);
  }
  return raw;
}

module.exports = {assertConfiguredFuses};
if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Pass exactly one installed Electron executable.');
    process.exitCode = 1;
  } else {
    getCurrentFuseWire(process.argv[2])
      .then(wire => {
        process.stdout.write(`Effective Electron fuse wire: ${assertConfiguredFuses(wire)}\n`);
      })
      .catch(error => {
        console.error(error instanceof assert.AssertionError ? error.message : 'Could not read effective fuse wire.');
        process.exitCode = 1;
      });
  }
}
