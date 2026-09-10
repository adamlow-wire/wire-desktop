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
 */

import {dialog} from 'electron';
import type {Certificate, Request as CertificateRequest} from 'electron';
import {createSandbox} from 'sinon';

import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
import * as path from 'node:path';

const requireFixture = createRequire(
  path.join(process.cwd(), 'electron/src/lib/CertificateVerifyProcManager.test.main.ts'),
);
const certificateUtils: typeof import('@wireapp/certificate-check') = requireFixture('@wireapp/certificate-check');

describe('[CAP-005] certificate verification completion', () => {
  const sandbox = createSandbox();
  const certificate = {data: 'synthetic certificate; verifier is stubbed'} as Certificate;
  const request = (overrides: Partial<CertificateRequest> = {}): CertificateRequest => ({
    certificate,
    errorCode: 0,
    hostname: 'fixture.example',
    isIssuedByKnownRoot: true,
    validatedCertificate: certificate,
    verificationResult: 'net::OK',
    ...overrides,
  });
  let verify: typeof import('./CertificateVerifyProcManager').setCertificateVerifyProc;

  beforeEach(() => {
    // The legacy manager has process-global dialog/exception state. Give each
    // test its own module instance without exposing a production reset API.
    delete requireFixture.cache[requireFixture.resolve('./CertificateVerifyProcManager.ts')];
    ({setCertificateVerifyProc: verify} = requireFixture('./CertificateVerifyProcManager.ts'));
    sandbox.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    sandbox.stub(dialog, 'showMessageBox').resolves({checkboxChecked: false, response: 0});
  });

  afterEach(() => sandbox.restore());

  it('[characterization] delegates a valid unpinned certificate to Chromium exactly once', async () => {
    sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(false);
    const pin = sandbox.stub(certificateUtils, 'verifyPinning');
    const result = sandbox.spy();
    await verify(request(), result);
    assert.deepEqual(result.args, [[-3]]);
    assert.equal(pin.callCount, 0);
  });

  it('[characterization] checks the validated certificate and retains Chromium validation for matching pins', async () => {
    sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
    const pin = sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: true});
    const result = sandbox.spy();
    await verify(request(), result);
    assert.deepEqual(pin.args, [['fixture.example', certificate]]);
    assert.deepEqual(result.args, [[-3]]);
  });

  for (const pinningResult of [{fingerprintCheck: false}, {errorMessage: 'fixture failure'}]) {
    it(`[characterization] denies a pin failure ${JSON.stringify(pinningResult)} exactly once`, async () => {
      sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
      sandbox.stub(certificateUtils, 'verifyPinning').returns(pinningResult);
      const result = sandbox.spy();
      await verify(request(), result);
      assert.deepEqual(result.args, [[-2]]);
    });
  }

  for (const errorCode of [-200, -202, -206]) {
    it(`[characterization] denies Chromium error ${errorCode} without consulting pinning`, async () => {
      const shouldPin = sandbox.stub(certificateUtils, 'hostnameShouldBePinned');
      const result = sandbox.spy();
      await verify(request({errorCode, verificationResult: 'net::ERR_CERT_INVALID'}), result);
      assert.deepEqual(result.args, [[-2]]);
      assert.equal(shouldPin.callCount, 0);
    });
  }
});
