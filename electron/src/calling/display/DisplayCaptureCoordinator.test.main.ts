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

import {BrowserWindow, desktopCapturer, nativeImage, session} from 'electron';
import {stub} from 'sinon';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {DISPLAY_CAPTURE_CAPABILITY} from './DisplayCaptureContract';
import {DISPLAY_BROKER_URL, DisplayCaptureCoordinator, CaptureSource} from './DisplayCaptureCoordinator';

import {AccountPermissionPolicy, ACCOUNT_PERMISSION_CAPABILITY} from '../../security/AccountPermissionPolicy';
import {ViewIdentityRegistry} from '../../security/ViewIdentityRegistry';

const until = async (condition: () => boolean | Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (!(await condition())) {
    if (Date.now() >= deadline) {
      throw new Error('Native capture condition timed out.');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};

describe('consented display capture native boundary', function () {
  this.timeout(20_000);
  let owner: BrowserWindow;
  let coordinator: DisplayCaptureCoordinator;
  let options: ConstructorParameters<typeof DisplayCaptureCoordinator>[0];
  let registry: ViewIdentityRegistry;
  let enumerations: number;
  let approvedOwner: boolean;
  let sourceWindow: BrowserWindow;
  let pendingSourceList: Promise<readonly CaptureSource[]> | undefined;
  const origin = 'https://display-fixture.invalid';
  const directory = path.resolve(__dirname, '../../..');

  beforeEach(async () => {
    enumerations = 0;
    pendingSourceList = undefined;
    approvedOwner = true;
    registry = new ViewIdentityRegistry();
    const target = session.fromPartition(`capture-test-${randomUUID()}`);
    target.protocol.handle(
      'https',
      () =>
        new Response('<!doctype html><html><body style="background:#176a91">Synthetic test-owned frame</body></html>', {
          headers: {'Content-Type': 'text/html'},
        }),
    );
    owner = new BrowserWindow({
      show: true,
      width: 640,
      height: 480,
      webPreferences: {
        session: target,
        preload: path.join(directory, 'dist/preload/preload-display-pip.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await owner.loadURL(`${origin}/`);
    sourceWindow = owner;
    const identity = registry.register({
      accountId: 'capture-account',
      allowedOrigin: origin,
      capabilities: [DISPLAY_CAPTURE_CAPABILITY, ACCOUNT_PERMISSION_CAPABILITY],
      partition: 'test-owned',
      session: target,
      viewType: 'account',
      webContents: owner.webContents,
    });
    const permissions = new AccountPermissionPolicy(registry, identity, {canPrompt: () => true, ask: async () => true});
    target.setPermissionRequestHandler((contents, permission, callback, details) => {
      void permissions.request(contents, permission, details).then(callback);
    });
    target.setPermissionCheckHandler((contents, permission, origin, details) =>
      permissions.check(contents, permission, origin, details),
    );
    options = {
      registry,
      directory,
      isEligible: () => !owner.isDestroyed(),
      canApprove: () => approvedOwner,
      isForeground: () => owner.isFocused(),
      parentWindow: () => owner,
      sources: async () => {
        enumerations++;
        return (
          pendingSourceList ?? [
            {name: 'Synthetic owned page', thumbnail: '', video: sourceWindow.webContents.mainFrame},
          ]
        );
      },
    };
    coordinator = new DisplayCaptureCoordinator(options);
    owner.focus();
    await until(() => owner.isFocused());
  });

  afterEach(() => {
    coordinator?.dispose();
    if (sourceWindow && sourceWindow !== owner && !sourceWindow.isDestroyed()) {
      sourceWindow.destroy();
    }
    if (owner && !owner.isDestroyed()) {
      owner.destroy();
    }
  });

  const startRequest = async (): Promise<void> => {
    await owner.webContents.executeJavaScript(
      `
      window.captureOutcome = 'pending';
      window.addEventListener('message', event => {if(event.data?.channel==='wire-desktop:display:port:v1'){window.observedFlow=event.data.flowId;window.observedPort=event.ports[0];}});
      navigator.mediaDevices.getDisplayMedia({video:true,audio:false}).then(stream => {
        window.capturedStream=stream; window.capturedClone=stream.getVideoTracks()[0].clone();
        window.captureOutcome='started';
      }, error => {window.captureOutcome=error.name;});
      void 0;
    `,
      true,
    );
  };

  const request = async (expectChoices = true): Promise<BrowserWindow> => {
    await startRequest();
    let broker: BrowserWindow | undefined;
    await until(() => {
      broker = BrowserWindow.getAllWindows().find(
        window => !window.isDestroyed() && window.webContents.getURL() === DISPLAY_BROKER_URL,
      );
      return Boolean(broker?.isVisible() && broker.isFocused());
    });
    if (expectChoices) {
      await until(() =>
        broker!.webContents.executeJavaScript('document.querySelectorAll("#source-list button").length === 1'),
      );
    }
    return broker!;
  };

  const selectSource = async (broker: BrowserWindow): Promise<void> => {
    // executeJavaScript models a click but does not itself focus the native window.
    broker.focus();
    await until(() => broker.isFocused());
    await broker.webContents.executeJavaScript('document.querySelector("#source-list button").click()', true);
  };

  const clickStop = async (broker: BrowserWindow): Promise<void> => {
    // Stop destroys this renderer. Electron may never settle its JavaScript
    // reply after destruction, so observe the native outcome instead.
    void broker.webContents
      .executeJavaScript('document.getElementById("stop-capture").click()', true)
      .catch(() => undefined);
    await until(() => broker.isDestroyed());
  };

  it('[security-target][INV-005][CAP-003] denies native modern and legacy remote capture without enumerating', async () => {
    const result = await owner.webContents.executeJavaScript(
      `(async()=>{
      const outcome = async operation => {try {const stream=await operation();stream.getTracks().forEach(track=>track.stop());return 'allowed';} catch(error){return error.name;}};
      return [await outcome(()=>Object.getPrototypeOf(navigator.mediaDevices).getDisplayMedia.call(navigator.mediaDevices,{video:true})),
        await outcome(()=>navigator.mediaDevices.getUserMedia({video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:'screen:999999999:0'}}}))];
    })()`,
      true,
    );
    assert.deepEqual(result, ['NotAllowedError', 'NotAllowedError']);
    assert.equal(enumerations, 0);
  });

  it('[security-target][CAP-003] requires source choice and relays only the selected synthetic frame until Stop', async () => {
    let stage = 'starting';
    const warning = setTimeout(() => {
      // Fixed labels only; no URLs, source identifiers, pixels or native errors.
      console.error('Native capture Stop fixture pending at:', stage);
    }, 18_000);
    try {
      stage = 'requesting the native chooser';
      const broker = await request();
      assert.equal(enumerations, 1);
      stage = 'reading the pending owner outcome';
      assert.equal(await owner.webContents.executeJavaScript('window.captureOutcome'), 'pending');
      stage = 'selecting the synthetic source';
      await selectSource(broker);
      stage = 'waiting for stream startup';
      await until(() => owner.webContents.executeJavaScript('window.captureOutcome !== "pending"'));
      assert.equal(await owner.webContents.executeJavaScript('window.captureOutcome'), 'started');
      stage = 'reading the first captured frame';
      const frame = await owner.webContents.executeJavaScript(`(async()=>{
        const track=window.capturedStream.getVideoTracks()[0];
        const reader=new MediaStreamTrackProcessor({track}).readable.getReader();
        const {value}=await reader.read();const pixels=new Uint8Array(value.allocationSize({format:'RGBA'}));await value.copyTo(pixels,{format:'RGBA'});
        const result={dimensions:[value.displayWidth,value.displayHeight],pixel:[...pixels.slice(0,4)]};value.close();reader.releaseLock();return result;
      })()`);
      assert.ok(
        frame.dimensions[0] > 0 &&
          frame.dimensions[0] <= 3840 &&
          frame.dimensions[1] > 0 &&
          frame.dimensions[1] <= 2160,
      );
      // Native display capture performs a YUV/color-space conversion, so CSS RGB is not lossless.
      assert.equal(frame.pixel[3], 255);
      [23, 106, 145].forEach((channel, index) => assert.ok(Math.abs(frame.pixel[index] - channel) <= 16));
      assert.equal(
        await owner.webContents.executeJavaScript('window.capturedStream.getVideoTracks()[0].readyState'),
        'live',
      );
      stage = 'waiting for the Stop action to close the broker';
      await clickStop(broker);
      stage = 'waiting for original and cloned tracks to end';
      await until(() =>
        owner.webContents.executeJavaScript(
          'window.capturedStream.getVideoTracks()[0].readyState === "ended" && window.capturedClone.readyState === "ended"',
        ),
      );
      assert.equal(broker.isDestroyed(), true);
    } finally {
      clearTimeout(warning);
    }
  });

  it('[security-target][CAP-003] cancels when ownership changes before source selection', async () => {
    const broker = await request();
    approvedOwner = false;
    // Ownership denial closes this renderer before its click reply may settle.
    void broker.webContents
      .executeJavaScript('document.querySelector("#source-list button").click()', true)
      .catch(() => undefined);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome !== "pending"'));
    assert.equal(await owner.webContents.executeJavaScript('window.captureOutcome'), 'NotAllowedError');
    assert.equal(broker.isDestroyed(), true);
  });
  it('[security-target][CAP-003] rejects malformed source authority and unregistered callers before enumeration', async () => {
    const malformed = await owner.webContents.executeJavaScript(
      `window.wireDisplayCapture.begin({requestId:crypto.randomUUID(),sourceId:'screen:0:0'}).then(()=>false,()=>true)`,
    );
    assert.equal(malformed, true);
    registry.unregister(owner.webContents.id);
    const unregistered = await owner.webContents.executeJavaScript(
      `window.wireDisplayCapture.begin({requestId:crypto.randomUUID()}).then(()=>false,()=>true)`,
    );
    assert.equal(unregistered, true);
    assert.equal(enumerations, 0);
  });

  it('[security-target][CAP-003] refuses a hidden requestor even when it calls the bridge directly', async () => {
    owner.hide();
    const denied = await owner.webContents.executeJavaScript(
      `window.wireDisplayCapture.begin({requestId:crypto.randomUUID()}).then(()=>false,()=>true)`,
    );
    assert.equal(denied, true);
    assert.equal(enumerations, 0);
  });

  it('[security-target][CAP-003] cancelling the visible chooser never starts a stream', async () => {
    const broker = await request();
    await clickStop(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome !== "pending"'));
    assert.equal(await owner.webContents.executeJavaScript('window.captureOutcome'), 'NotAllowedError');
    assert.equal(broker.isDestroyed(), true);
  });

  it('[security-target][CAP-003] revokes the source and all consumer tracks on a malformed acknowledgement', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    await owner.webContents.executeJavaScript('window.observedPort.postMessage({sourceId:"unapproved"}); void 0;');
    await until(() => owner.webContents.executeJavaScript('window.capturedClone.readyState === "ended"'));
    assert.equal(broker.isDestroyed(), true);
    assert.equal(
      await owner.webContents.executeJavaScript('window.capturedStream.getVideoTracks()[0].readyState'),
      'ended',
    );
  });

  it('[security-target][CAP-003] ends the approved stream when its synthetic native source disappears', async () => {
    sourceWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        session: owner.webContents.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await sourceWindow.loadURL(`${origin}/synthetic-source`);
    owner.focus();
    await until(() => owner.isFocused());
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    sourceWindow.destroy();
    await until(() => owner.webContents.executeJavaScript('window.capturedClone.readyState === "ended"'));
    assert.equal(broker.isDestroyed(), true);
  });

  it('[security-target][CAP-003] rejects stopping another account flow even with its observed identifier', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    const flowId = await owner.webContents.executeJavaScript('window.observedFlow');
    const other = new BrowserWindow({
      show: false,
      webPreferences: {
        session: owner.webContents.session,
        preload: path.join(directory, 'dist/preload/preload-display-pip.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    try {
      await other.loadURL(`${origin}/other`);
      registry.register({
        accountId: 'other-account',
        allowedOrigin: origin,
        capabilities: [DISPLAY_CAPTURE_CAPABILITY],
        partition: 'other-test',
        session: other.webContents.session,
        viewType: 'account',
        webContents: other.webContents,
      });
      const denied = await other.webContents.executeJavaScript(
        `window.wireDisplayCapture.stop({flowId:${JSON.stringify(flowId)}}).then(()=>false,()=>true)`,
      );
      assert.equal(denied, true);
      assert.equal(broker.isDestroyed(), false);
      assert.equal(await owner.webContents.executeJavaScript('window.capturedClone.readyState'), 'live');
    } finally {
      other.destroy();
    }
  });

  it('[security-target][CAP-003] rejects an oversized frame and revokes its native source', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    await owner.webContents.executeJavaScript(
      `window.observedPort.dispatchEvent(new MessageEvent('message',{data:{buffer:new ArrayBuffer(4),width:1e9,height:1,timestamp:0}})); void 0;`,
    );
    await until(() => owner.webContents.executeJavaScript('window.capturedClone.readyState === "ended"'));
    assert.equal(broker.isDestroyed(), true);
  });

  it('[security-target][CAP-003] closes a stalled receiver within the bounded frame deadline', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    await owner.webContents.executeJavaScript('window.observedPort.close(); void 0;');
    const deadline = Date.now() + 12_000;
    while (!broker.isDestroyed() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(broker.isDestroyed(), true);
    assert.equal(await owner.webContents.executeJavaScript('window.capturedClone.readyState'), 'ended');
  });
  it('[security-target][CAP-003] keeps a main-process deadline when neither renderer can authorize cleanup', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    registry.unregister(owner.webContents.id);
    registry.unregister(broker.webContents.id);
    const deadline = Date.now() + 12_000;
    while (!broker.isDestroyed() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(broker.isDestroyed(), true);
  });
  it('[CAP-003] retains a visible Stop control when the active owner window is hidden', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    owner.hide();
    assert.equal(broker.getParentWindow(), null);
    assert.equal(broker.isVisible(), true);
    assert.equal(await owner.webContents.executeJavaScript('window.capturedClone.readyState'), 'live');
    await clickStop(broker);
    await until(() => owner.webContents.executeJavaScript('window.capturedClone.readyState === "ended"'));
  });
  it('[security-target][CAP-003] does not accumulate native enumeration behind cancelled source requests', async () => {
    let release!: (sources: readonly CaptureSource[]) => void;
    pendingSourceList = new Promise(resolve => {
      release = resolve;
    });
    try {
      const broker = await request(false);
      await until(() => enumerations === 1);
      await clickStop(broker);
      await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "NotAllowedError"'));
      owner.focus();
      await until(() => owner.isFocused());
      await startRequest();
      await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "NotAllowedError"'));
      assert.equal(enumerations, 1);
    } finally {
      release([{name: 'Late synthetic source', thumbnail: '', video: owner.webContents.mainFrame}]);
      await new Promise(resolve => setImmediate(resolve));
    }
  });

  it('[security-target][CAP-003] revalidates pending approval and active document ownership', async () => {
    const broker = await request();
    coordinator.revalidate();
    assert.equal(broker.isDestroyed(), false);
    approvedOwner = false;
    coordinator.revalidate();
    assert.equal(broker.isDestroyed(), true);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "NotAllowedError"'));
  });

  it('[security-target][CAP-003] retains active sharing across background selection but revokes a lost identity', async () => {
    const broker = await request();
    await selectSource(broker);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "started"'));
    approvedOwner = false;
    coordinator.revalidate();
    assert.equal(broker.isDestroyed(), false);
    registry.unregister(owner.webContents.id);
    coordinator.revalidate();
    assert.equal(broker.isDestroyed(), true);
    await until(() => owner.webContents.executeJavaScript('window.capturedClone.readyState === "ended"'));
  });

  it('[security-target][CAP-003] keeps same-document navigation but cancels cross-document owner navigation', async () => {
    const broker = await request();
    await owner.webContents.executeJavaScript('history.pushState({}, "", "/same-document")');
    assert.equal(broker.isDestroyed(), false);
    await owner.loadURL(`${origin}/replacement`);
    assert.equal(broker.isDestroyed(), true);
  });

  it('[security-target][CAP-003] cancels pending consent when its parent becomes hidden', async () => {
    const broker = await request();
    const hidden = new Promise<void>(resolve => owner.once('hide', () => resolve()));
    owner.hide();
    await hidden;
    assert.equal(broker.isDestroyed(), true);
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "NotAllowedError"'));
  });

  it('[security-target][CAP-003] rejects an invalid native source model without exposing choices', async () => {
    pendingSourceList = Promise.resolve([{name: 'x'.repeat(2049), thumbnail: '', video: owner.webContents.mainFrame}]);
    await startRequest();
    await until(() => owner.webContents.executeJavaScript('window.captureOutcome === "NotAllowedError"'));
    assert.equal(enumerations, 1);
    assert.equal(
      BrowserWindow.getAllWindows().some(window => window.webContents.getURL() === DISPLAY_BROKER_URL),
      false,
    );
  });

  it('[security-target][CAP-003] maps native enumeration only into the local chooser', async () => {
    coordinator.dispose();
    const enumerate = stub(desktopCapturer, 'getSources').resolves([
      {
        id: 'window:synthetic:0',
        display_id: '',
        name: 'Test-owned enumeration',
        thumbnail: nativeImage.createEmpty(),
        appIcon: nativeImage.createEmpty(),
      },
    ]);
    coordinator = new DisplayCaptureCoordinator({...options, sources: undefined});
    try {
      const broker = await request();
      assert.equal(enumerate.calledOnce, true);
      assert.deepEqual(enumerate.firstCall.args, [
        {types: ['screen', 'window'], thumbnailSize: {width: 320, height: 180}, fetchWindowIcons: false},
      ]);
      assert.equal(
        await broker.webContents.executeJavaScript('document.querySelector("#source-list button").textContent'),
        'Test-owned enumeration',
      );
      assert.equal(await owner.webContents.executeJavaScript('typeof window.desktopCapturer'), 'undefined');
      broker.close();
    } finally {
      enumerate.restore();
    }
  });
});
