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

import {DIGICERT_GLOBAL_ROOT_G2, KNOWN_PINS, PinningData} from '@wireapp/certificate-check/lib/pinningData';

import {strict as assert} from 'node:assert';
import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';

import {buildCert, getFingerprint, hostnameShouldBePinned, verifyPinning} from '@wireapp/certificate-check';

// This suite runs in Node: no Electron session, network or trust-store changes.
const pem = readFileSync('electron/test/fixtures/certificates/untrusted-localhost-cert.pem', 'utf8');
const fingerprint = 'iOBxmTIzs/TNOAKAxuCg5rN2FhV81hiXIYWBd6qoaqY=';
const certificate = {data: pem, issuerCert: {data: pem}};
const hostname = 'certificate-dependency.invalid';

describe('[ELC-003][CAP-005] certificate dependency compatibility', () => {
  let fixturePin: PinningData;
  beforeEach(() => {
    fixturePin = {
      url: /^certificate-dependency\.invalid$/,
      issuerRootCerts: [pem],
      publicKeyInfo: [{algorithmID: '2a8648ce3d0201', algorithmParam: '2a8648ce3d030107', fingerprints: [fingerprint]}],
    };
    KNOWN_PINS.push(fixturePin);
  });
  afterEach(() => {
    const index = KNOWN_PINS.indexOf(fixturePin);
    if (index >= 0) {
      KNOWN_PINS.splice(index, 1);
    }
  });
  it('retains the established EC fingerprint and certificate encoding', () => {
    const der = new X509Certificate(pem).raw;
    assert.equal(getFingerprint(der), fingerprint);
    assert.deepEqual(new X509Certificate(buildCert(der)).raw, der);
  });
  it('retains RSA fingerprint and matching algorithm/root checks', () => {
    const rsaFingerprint = 'WenbDoXiH0M8jWsjfYS7novImb8qAjo135Gen8aj5M8=';
    assert.equal(getFingerprint(new X509Certificate(DIGICERT_GLOBAL_ROOT_G2).raw), rsaFingerprint);
    fixturePin.issuerRootCerts = [DIGICERT_GLOBAL_ROOT_G2];
    fixturePin.publicKeyInfo = [
      {algorithmID: '2a864886f70d010101', algorithmParam: null, fingerprints: [rsaFingerprint]},
    ];
    const result = verifyPinning(hostname, {
      data: DIGICERT_GLOBAL_ROOT_G2,
      issuerCert: {data: DIGICERT_GLOBAL_ROOT_G2},
    });
    assert.deepEqual(result, {verifiedIssuerRootCerts: true, verifiedPublicKeyInfo: true});
  });
  it('retains pin lookup normalization and matching EC key/root checks', () => {
    assert.equal(hostnameShouldBePinned(`  ${hostname.toUpperCase()}  `), true);
    assert.equal(hostnameShouldBePinned('unmatched.invalid'), false);
    assert.deepEqual(verifyPinning(hostname, certificate), {
      verifiedIssuerRootCerts: true,
      verifiedPublicKeyInfo: true,
    });
  });
  for (const field of ['fingerprints', 'algorithmID', 'algorithmParam'] as const) {
    it(`rejects a mismatched ${field} despite matching remaining fields`, () => {
      if (field === 'fingerprints') {
        fixturePin.publicKeyInfo[0].fingerprints = ['wrong'];
      } else {
        fixturePin.publicKeyInfo[0][field] = 'wrong';
      }
      const result = verifyPinning(hostname, certificate);
      assert.equal(result.verifiedPublicKeyInfo, false);
      assert.ok(result.errorMessage);
    });
  }
  it('rejects an unexpected root despite a matching key', () => {
    fixturePin.issuerRootCerts = [DIGICERT_GLOBAL_ROOT_G2];
    const result = verifyPinning(hostname, certificate);
    assert.equal(result.verifiedIssuerRootCerts, false);
    assert.ok(result.errorMessage);
  });
  it('reports missing and malformed certificates without accepting pins', () => {
    for (const input of [undefined, {data: pem}, {data: 'invalid PEM', issuerCert: {data: pem}}]) {
      const result = verifyPinning(hostname, input);
      assert.ok(result.errorMessage);
      assert.notEqual(result.verifiedPublicKeyInfo, true);
    }
    assert.throws(() => getFingerprint(Buffer.from('invalid DER')));
  });
});
