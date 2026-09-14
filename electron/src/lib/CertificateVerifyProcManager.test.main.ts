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

import {dialog, session} from 'electron';
import type {BrowserWindow, Certificate, Request as CertificateRequest} from 'electron';
import {createSandbox} from 'sinon';
import type {SinonFakeTimers, SinonStub} from 'sinon';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:https';
import {createRequire} from 'node:module';
import type {AddressInfo} from 'node:net';
import * as path from 'node:path';

const requireFixture = createRequire(
  path.join(process.cwd(), 'electron/src/lib/CertificateVerifyProcManager.test.main.ts'),
);
const certificateUtils: typeof import('@wireapp/certificate-check') = requireFixture('@wireapp/certificate-check');
const fileSystem: typeof import('fs-extra') = requireFixture('fs-extra');
const environment: typeof import('../runtime/EnvironmentUtil') = requireFixture('../runtime/EnvironmentUtil.ts');
const {withTemporaryDirectory}: typeof import('../../test/withTemporaryDirectory') = requireFixture(
  '../../test/withTemporaryDirectory.ts',
);

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
  let messageBox: SinonStub;
  let clock: SinonFakeTimers;

  beforeEach(() => {
    // The legacy manager has process-global dialog/exception state. Give each
    // test its own module instance without exposing a production reset API.
    delete requireFixture.cache[requireFixture.resolve('./CertificateVerifyProcManager.ts')];
    ({setCertificateVerifyProc: verify} = requireFixture('./CertificateVerifyProcManager.ts'));
    clock = sandbox.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    messageBox = sandbox.stub(dialog, 'showMessageBox').resolves({checkboxChecked: false, response: 0});
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

  for (const failure of ['pinning utility', 'pinning dialog', 'Chromium dialog'] as const) {
    it(`[regression][INV-010] completes exactly once with denial when the ${failure} throws`, async () => {
      sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
      const pin = sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: false});
      if (failure === 'pinning utility') {
        pin.throws(new Error('synthetic verifier error'));
      } else {
        messageBox.rejects(new Error('synthetic dialog error'));
      }
      const result = sandbox.spy();
      let rejection: unknown;
      try {
        await verify(
          request(failure === 'Chromium dialog' ? {errorCode: -202, verificationResult: 'net::ERR_CERT_INVALID'} : {}),
          result,
        );
      } catch (error) {
        rejection = error;
      }
      assert.deepEqual(result.args, [[-2]], 'Electron must receive an explicit denial even when verification throws');
      assert.equal(rejection, undefined);
    });
  }

  it('[regression] does not invoke an Electron callback twice if that callback throws', async () => {
    sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(false);
    const error = new Error('synthetic callback error');
    const result = sandbox.stub().throws(error);
    await assert.rejects(verify(request(), result), caught => caught === error);
    assert.deepEqual(result.args, [[-3]]);
  });

  it('[characterization] suppresses duplicate warnings during the retry cooldown but keeps rejecting requests', async () => {
    sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
    sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: false});
    const result = sandbox.spy();
    await verify(request(), result);
    await verify(request(), result);
    assert.equal(messageBox.callCount, 1);
    assert.deepEqual(result.args, [[-2], [-2]]);
    clock.tick(6000);
    await verify(request(), result);
    assert.equal(messageBox.callCount, 2);
    assert.deepEqual(result.args, [[-2], [-2], [-2]]);
  });

  for (const errorCode of [0, -202]) {
    it(`[regression] permits a later warning after a rejected dialog for error ${errorCode}`, async () => {
      sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
      sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: false});
      messageBox.onFirstCall().rejects(new Error('synthetic dialog failure'));
      const result = sandbox.spy();
      const input = request({errorCode, verificationResult: errorCode === 0 ? 'net::OK' : 'net::ERR_CERT_INVALID'});
      await verify(input, result);
      await verify(input, result);
      assert.deepEqual(result.args, [[-2], [-2]]);
      assert.equal(messageBox.callCount, 2, 'a rejected dialog must not permanently suppress later warnings');
    });
  }

  for (const outcome of ['save', 'cancel', 'cancel with stale path', 'write failure'] as const) {
    it(
      `${
        outcome.startsWith('cancel') ? '[regression]' : '[characterization]'
      } preserves certificate detail navigation and ${outcome} without accepting the connection`,
      withTemporaryDirectory('cap005-certificate-details-', async directory => {
        sandbox.stub(environment.platform, 'IS_MAC_OS').value(false);
        sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
        sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: false});
        messageBox.onCall(0).resolves({checkboxChecked: false, response: 1});
        messageBox.onCall(1).resolves({checkboxChecked: false, response: 1});
        const chosenPath = path.join(
          directory,
          outcome === 'write failure' ? 'missing/certificate.pem' : 'certificate.pem',
        );
        const save: SinonStub = sandbox.stub(dialog, 'showSaveDialog').resolves({
          canceled: outcome.startsWith('cancel'),
          filePath: outcome === 'cancel' ? '' : chosenPath,
        });
        const result = sandbox.spy();
        await verify(request(), result);
        assert.deepEqual(result.args, [[-2]]);
        assert.equal(save.callCount, 1);
        assert.equal(save.firstCall.args[1].defaultPath, 'fixture.example.pem');
        assert.equal(messageBox.getCall(1).args[1].cancelId, 0);
        assert.match(messageBox.getCall(1).args[1].detail, /fixture\.example/);
        if (outcome === 'save') {
          assert.equal(await fileSystem.readFile(chosenPath, 'utf8'), certificate.data);
          assert.deepEqual(await fileSystem.readdir(directory), ['certificate.pem']);
        } else {
          assert.deepEqual(await fileSystem.readdir(directory), []);
        }
        if (outcome === 'write failure') {
          await verify(request(), result);
          assert.equal(messageBox.callCount, 3, 'a failed save must release the warning lock');
          assert.deepEqual(result.args, [[-2], [-2]]);
        } else {
          assert.equal(messageBox.callCount, 4, 'save/cancel returns through details to the warning');
        }
      }),
    );
  }

  for (const trustDialogFails of [false, true]) {
    it(`[compatibility] keeps macOS certificate details owner-bound and denied when dialog failure is ${trustDialogFails}`, async () => {
      sandbox.stub(environment.platform, 'IS_MAC_OS').value(true);
      sandbox.stub(certificateUtils, 'hostnameShouldBePinned').returns(true);
      sandbox.stub(certificateUtils, 'verifyPinning').returns({fingerprintCheck: false});
      const owner = {} as BrowserWindow;
      requireFixture('./CertificateVerifyProcManager.ts').attachTo(owner);
      const trust: SinonStub = sandbox.stub(dialog, 'showCertificateTrustDialog');
      if (trustDialogFails) {
        trust.rejects(new Error('synthetic trust dialog failure'));
      } else {
        trust.resolves();
      }
      const save = sandbox.stub(dialog, 'showSaveDialog');
      messageBox.onFirstCall().resolves({checkboxChecked: false, response: 1});
      const result = sandbox.spy();
      await verify(request(), result);
      assert.deepEqual(result.args, [[-2]]);
      assert.equal(trust.callCount, 1);
      assert.equal(trust.firstCall.args[0], owner);
      assert.equal(trust.firstCall.args[1].certificate, certificate);
      assert.match(trust.firstCall.args[1].message, /fixture\.example/);
      assert.equal(save.callCount, 0);
      if (trustDialogFails) {
        await verify(request(), result);
        assert.deepEqual(result.args, [[-2], [-2]]);
      }
      assert.equal(messageBox.callCount, 2, 'details or its failure must return to an available warning');
    });
  }
});

describe('[CAP-005] native certificate verification', () => {
  for (const dialogFails of [false, true]) {
    it(`[security-target][INV-010] rejects untrusted loopback TLS before HTTP when dialog failure is ${dialogFails}`, async () => {
      const sandbox = createSandbox();
      const messageBox = sandbox.stub(dialog, 'showMessageBox');
      if (dialogFails) {
        messageBox.rejects(new Error('synthetic native-dialog failure'));
      } else {
        messageBox.resolves({checkboxChecked: false, response: 0});
      }
      delete requireFixture.cache[requireFixture.resolve('./CertificateVerifyProcManager.ts')];
      const {setCertificateVerifyProc}: typeof import('./CertificateVerifyProcManager') = requireFixture(
        './CertificateVerifyProcManager.ts',
      );
      const target = session.fromPartition(`certificate-verification-${randomUUID()}`);
      const fixtureDirectory = path.join(process.cwd(), 'electron/test/fixtures/certificates');
      let requests = 0;
      const server = createServer(
        {
          cert: readFileSync(path.join(fixtureDirectory, 'untrusted-localhost-cert.pem')),
          key: readFileSync(path.join(fixtureDirectory, 'untrusted-localhost-key.pem')),
        },
        (_request, response) => {
          requests++;
          response.end('must not reach HTTP');
        },
      );
      const checks: {hostname: string; errorCode: number; verificationResult: string}[] = [];
      const decisions: number[] = [];
      target.setCertificateVerifyProc((request, callback) => {
        checks.push({
          hostname: request.hostname,
          errorCode: request.errorCode,
          verificationResult: request.verificationResult,
        });
        void setCertificateVerifyProc(request, result => {
          decisions.push(result);
          callback(result);
        });
      });
      try {
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address() as AddressInfo;
        const origin = `https://127.0.0.1:${address.port}`;
        // Chromium background traffic can otherwise invoke this session's
        // verifier. Keep the native denial fixture confined to its own server.
        target.webRequest.onBeforeRequest((details, callback) => {
          callback({cancel: new URL(details.url).origin !== origin});
        });
        const error = await target.fetch(`${origin}/`, {signal: AbortSignal.timeout(1000)}).then(
          () => undefined,
          (error: unknown) => error,
        );
        assert.deepEqual(
          decisions,
          [-2],
          `native verification must complete, not wait until request abort: ${JSON.stringify(checks)}`,
        );
        assert.deepEqual(checks, [
          {hostname: '127.0.0.1', errorCode: -202, verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID'},
        ]);
        assert.ok(error instanceof Error);
        assert.match(error.message, /ERR_FAILED|ERR_CERT/);
        assert.equal(requests, 0);
        assert.equal(messageBox.callCount, 1);
      } finally {
        target.setCertificateVerifyProc(null);
        await target.closeAllConnections();
        target.webRequest.onBeforeRequest(null);
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        sandbox.restore();
      }
    });
  }
});
