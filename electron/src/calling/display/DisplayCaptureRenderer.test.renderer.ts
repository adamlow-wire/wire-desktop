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

import {contextBridge, ipcRenderer} from 'electron';
import {restore, stub, SinonStub} from 'sinon';

import {strict as assert} from 'node:assert';

import {installDisplayMediaAdapter} from './DisplayCaptureAdapter';
import {
  DISPLAY_BROKER_HEARTBEAT_CHANNEL,
  DISPLAY_BROKER_PORT_CHANNEL,
  DISPLAY_BROKER_READ_CHANNEL,
  DISPLAY_BROKER_SELECT_CHANNEL,
  DISPLAY_BROKER_STOP_CHANNEL,
} from './DisplayCaptureContract';

const until = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Renderer capture condition timed out.');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const flowId = 'abcdef01-2345-4000-8000-000000000001';
const frame = () => ({buffer: new Uint8Array([20, 40, 60, 255]).buffer, width: 1, height: 1, timestamp: 1});

describe('[security-target][CAP-003] display stream renderer adapter', () => {
  let media: MediaDevices;
  let requestId: string;
  let channel: MessageChannel;
  let begin: ReturnType<typeof stub>;
  let stop: ReturnType<typeof stub>;
  let listeners: Array<{type: string; listener: EventListenerOrEventListenerObject}>;

  beforeEach(() => {
    media = {} as MediaDevices;
    stub(navigator, 'mediaDevices').get(() => media);
    stub(navigator.userActivation, 'isActive').get(() => true);
    begin = stub().callsFake(async (request: {requestId: string}) => {
      requestId = request.requestId;
      return {flowId};
    });
    stop = stub().resolves();
    Object.assign(window, {wireDisplayCapture: {begin, stop}});
    listeners = [];
    const add = window.addEventListener.bind(window);
    stub(window, 'addEventListener').callsFake((type, listener, options) => {
      listeners.push({type, listener});
      add(type, listener, options);
    });
    installDisplayMediaAdapter({
      portChannel: 'test-capture-port',
      endedChannel: 'test-capture-ended',
      width: 2,
      height: 2,
      frameTimeoutMs: 100,
      promptTimeoutMs: 200,
    });
    channel = new MessageChannel();
  });

  afterEach(async () => {
    window.dispatchEvent(new Event('pagehide'));
    await tick();
    for (const {type, listener} of listeners) {
      window.removeEventListener(type, listener);
    }
    channel.port1.close();
    channel.port2.close();
    restore();
    delete (window as unknown as Record<string, unknown>).wireDisplayCapture;
  });

  const connect = (): void => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {channel: 'test-capture-port', requestId, flowId},
        ports: [channel.port1],
      }),
    );
  };
  const started = async (): Promise<MediaStream> => {
    const result = media.getDisplayMedia({video: true, audio: false});
    connect();
    channel.port2.postMessage(frame());
    return result;
  };

  it('delivers a real video track, acknowledges bounded pixels, and stops originals and clones', async () => {
    let acknowledgements = 0;
    channel.port2.onmessage = event => {
      assert.equal(event.data, 'ack');
      acknowledgements++;
    };
    const stream = await started();
    assert.ok(stream instanceof MediaStream);
    assert.equal(stream.getAudioTracks().length, 0);
    const track = stream.getVideoTracks()[0];
    const clone = track.clone();
    assert.equal(track.readyState, 'live');
    await until(() => acknowledgements === 1);
    track.stop();
    await until(() => clone.readyState === 'ended');
    assert.deepEqual(stop.firstCall.args, [{flowId}]);
  });

  it('requires activation and video-only options before contacting main', async () => {
    stub(navigator.userActivation, 'isActive').get(() => false);
    await assert.rejects(media.getDisplayMedia(), {name: 'NotAllowedError'});
    assert.equal(begin.called, false);
  });

  it('rejects audio and disabled video, and permits only one pending flow', async () => {
    await assert.rejects(media.getDisplayMedia({audio: true}), TypeError);
    await assert.rejects(media.getDisplayMedia({video: false}), TypeError);
    const result = media.getDisplayMedia({video: true});
    const rejected = assert.rejects(result, {name: 'NotAllowedError'});
    await assert.rejects(media.getDisplayMedia({video: true}), {name: 'InvalidStateError'});
    window.dispatchEvent(new Event('pagehide'));
    await rejected;
  });

  for (const invalid of [
    {...frame(), width: 3, buffer: new ArrayBuffer(12)},
    {...frame(), timestamp: -1},
    {...frame(), buffer: new ArrayBuffer(3)},
  ]) {
    it('rejects malformed frames before creating an approved stream', async () => {
      const result = media.getDisplayMedia({video: true});
      const rejected = assert.rejects(result, {name: 'NotAllowedError'});
      connect();
      channel.port2.postMessage(invalid);
      await rejected;
      assert.equal(stop.calledOnce, true);
    });
  }

  it('ends original and cloned tracks when main revokes the flow', async () => {
    const stream = await started();
    const tracks = [stream.getVideoTracks()[0], stream.getVideoTracks()[0].clone()];
    window.dispatchEvent(new MessageEvent('message', {source: window, data: {channel: 'test-capture-ended', flowId}}));
    await until(() => tracks.every(track => track.readyState === 'ended'));
    assert.equal(stop.called, false);
  });

  it('times out a stalled sender and revokes the native flow', async () => {
    const result = media.getDisplayMedia({video: true});
    const rejected = assert.rejects(result, {name: 'NotAllowedError'});
    connect();
    await rejected;
    assert.deepEqual(stop.firstCall.args, [{flowId}]);
  });

  it('rejects main denial without accepting a stream', async () => {
    begin.rejects(new Error('Controlled denial'));
    await assert.rejects(media.getDisplayMedia({video: true}), {name: 'NotAllowedError'});
  });
});

describe('[security-target][CAP-003] trusted display broker renderer', () => {
  let api: {start(): Promise<boolean>};
  let receivePort: (event: Electron.IpcRendererEvent) => void;
  let invoke: SinonStub<Parameters<typeof ipcRenderer.invoke>, ReturnType<typeof ipcRenderer.invoke>>;
  let capture: SinonStub<Parameters<MediaDevices['getDisplayMedia']>, Promise<MediaStream>>;
  let channel: MessageChannel;
  let stream: MediaStream;
  let canvas: HTMLCanvasElement;
  const model = () => ({
    origin: 'https://account.example.test',
    labels: {
      title: 'Share',
      loading: 'Loading',
      choose: 'Choose',
      empty: 'Empty',
      starting: 'Starting',
      sharing: 'Sharing',
      stop: 'Stop',
      cancel: 'Cancel',
    },
    sources: [{choiceId: flowId, name: '<script>literal source</script>', thumbnail: canvas.toDataURL()}],
  });

  beforeEach(() => {
    document.body.innerHTML =
      '<h1></h1><p id="capture-origin"></p><p id="capture-status"></p><div id="source-list"></div><button id="stop-capture"></button>';
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(20, 40, 60)';
    context.fillRect(0, 0, 1, 1);
    stream = canvas.captureStream(0);
    capture = stub(navigator.mediaDevices, 'getDisplayMedia').resolves(stream);
    stub(contextBridge, 'exposeInMainWorld').callsFake((_name, value) => {
      api = value;
    });
    stub(ipcRenderer, 'on').callsFake((name, listener) => {
      if (name === DISPLAY_BROKER_PORT_CHANNEL) {
        receivePort = listener;
      }
      return ipcRenderer;
    });
    invoke = stub(ipcRenderer, 'invoke').callsFake(async name =>
      name === DISPLAY_BROKER_READ_CHANNEL ? model() : undefined,
    );
    const modulePath = require.resolve('../../preload/preload-display-broker');
    delete require.cache[modulePath];
    require(modulePath);
    channel = new MessageChannel();
  });

  afterEach(async () => {
    window.dispatchEvent(new Event('pagehide'));
    stream.getTracks().forEach(track => track.stop());
    channel.port1.close();
    channel.port2.close();
    await tick();
    restore();
    document.body.innerHTML = '';
  });

  const loaded = async (): Promise<void> => {
    window.dispatchEvent(new Event('DOMContentLoaded'));
    await tick();
  };
  const connect = (): void => receivePort({ports: [channel.port1]} as unknown as Electron.IpcRendererEvent);
  const requestFrame = (): void => (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();

  it('renders literal source labels, selects once, relays bounded pixels and retains Stop', async () => {
    await loaded();
    const button = document.querySelector<HTMLButtonElement>('#source-list button')!;
    assert.equal(button.textContent, '<script>literal source</script>');
    assert.equal(button.querySelector('script'), null);
    assert.equal(document.getElementById('capture-origin')!.textContent, model().origin);
    assert.equal(capture.called, false);
    button.click();
    button.click();
    assert.equal(invoke.getCalls().filter(call => call.args[0] === DISPLAY_BROKER_SELECT_CHANNEL).length, 1);
    assert.deepEqual(invoke.getCalls().find(call => call.args[0] === DISPLAY_BROKER_SELECT_CHANNEL)!.args, [
      DISPLAY_BROKER_SELECT_CHANNEL,
      {choiceId: flowId},
    ]);
    connect();
    let received = 0;
    channel.port2.onmessage = event => {
      assert.equal(event.data.width, 1);
      assert.equal(event.data.height, 1);
      assert.deepEqual([...new Uint8Array(event.data.buffer)], [20, 40, 60, 255]);
      received++;
      channel.port2.postMessage('ack');
    };
    assert.equal(await api.start(), true);
    requestFrame();
    await until(() => received >= 2);
    assert.equal(document.getElementById('stop-capture')!.textContent, 'Stop');
    assert.equal(
      invoke.getCalls().some(call => call.args[0] === DISPLAY_BROKER_HEARTBEAT_CHANNEL),
      true,
    );
    document.getElementById('stop-capture')!.click();
    assert.equal(stream.getVideoTracks()[0].readyState, 'ended');
    assert.equal(
      invoke.getCalls().some(call => call.args[0] === DISPLAY_BROKER_STOP_CHANNEL),
      true,
    );
  });

  it('ends the source on an unsolicited acknowledgement', async () => {
    await loaded();
    connect();
    assert.equal(await api.start(), true);
    channel.port2.postMessage({sourceId: 'not-authority'});
    await until(() => stream.getVideoTracks()[0].readyState === 'ended');
  });

  it('handles native denial without exposing a stream', async () => {
    await loaded();
    connect();
    capture.rejects(new Error('Controlled native denial'));
    assert.equal(await api.start(), false);
    assert.equal(
      invoke.getCalls().some(call => call.args[0] === DISPLAY_BROKER_STOP_CHANNEL),
      true,
    );
  });

  it('stops a late native stream after the chooser was cancelled', async () => {
    await loaded();
    connect();
    let resolve!: (value: MediaStream) => void;
    capture.returns(
      new Promise<MediaStream>(done => {
        resolve = done;
      }),
    );
    const pending = api.start();
    document.getElementById('stop-capture')!.click();
    resolve(stream);
    assert.equal(await pending, false);
    assert.equal(stream.getVideoTracks()[0].readyState, 'ended');
  });

  it('rejects an invalid chooser model and failed selection', async () => {
    invoke.withArgs(DISPLAY_BROKER_READ_CHANNEL).resolves({sources: [{sourceId: 'native-id'}]});
    await loaded();
    assert.equal(document.querySelectorAll('#source-list button').length, 0);
    assert.equal(await api.start(), false);
    assert.equal(
      invoke.getCalls().some(call => call.args[0] === DISPLAY_BROKER_STOP_CHANNEL),
      true,
    );
  });

  it('cancels if main rejects the selected choice', async () => {
    invoke.withArgs(DISPLAY_BROKER_SELECT_CHANNEL).rejects(new Error('Stale choice'));
    await loaded();
    document.querySelector<HTMLButtonElement>('#source-list button')!.click();
    await tick();
    assert.equal(
      invoke.getCalls().some(call => call.args[0] === DISPLAY_BROKER_STOP_CHANNEL),
      true,
    );
  });

  it('cannot start native capture without an owned port', async () => {
    await loaded();
    assert.equal(await api.start(), false);
    assert.equal(capture.called, false);
  });
});

describe('[security-target][CAP-003] display capture preload boundary', () => {
  afterEach(() => restore());

  it('installs only fixed begin/stop operations and forwards main-owned ports', async () => {
    stub(process, 'isMainFrame').value(true);
    let bridge!: {begin(request: unknown): Promise<unknown>; stop(request: unknown): Promise<unknown>};
    const expose = stub(contextBridge, 'exposeInMainWorld').callsFake((_name, value) => {
      bridge = value;
    });
    const execute = stub(contextBridge, 'executeInMainWorld');
    const invoke = stub(ipcRenderer, 'invoke').resolves();
    const listeners = new Map<string, (...args: unknown[]) => void>();
    stub(ipcRenderer, 'on').callsFake((channel, listener) => {
      listeners.set(channel, listener as (...args: unknown[]) => void);
      return ipcRenderer;
    });
    const post = stub(window, 'postMessage');
    const entry = require.resolve('../../preload/preload-display-pip');
    delete require.cache[entry];
    require(entry);
    assert.deepEqual(Object.keys(bridge).sort(), ['begin', 'stop']);
    assert.equal(expose.firstCall.args[0], 'wireDisplayCapture');
    assert.equal(execute.firstCall.args[0].func, installDisplayMediaAdapter);
    await bridge.begin({requestId: flowId});
    await bridge.stop({flowId});
    assert.deepEqual(
      invoke.getCalls().map(call => call.args),
      [
        ['wire-desktop:display:begin:v1', {requestId: flowId}],
        ['wire-desktop:display:stop:v1', {flowId}],
      ],
    );
    const channel = new MessageChannel();
    listeners.get('wire-desktop:display:port:v1')!({ports: [channel.port1]}, {requestId: flowId, flowId});
    listeners.get('wire-desktop:display:ended:v1')!({}, {flowId});
    assert.deepEqual(post.firstCall.args, [
      {channel: 'wire-desktop:display:port:v1', requestId: flowId, flowId},
      '*',
      [channel.port1],
    ]);
    assert.deepEqual(post.secondCall.args, [{channel: 'wire-desktop:display:ended:v1', flowId}, '*']);
    channel.port1.close();
    channel.port2.close();
  });

  it('does not expose capture operations in subframes', () => {
    stub(process, 'isMainFrame').value(false);
    const expose = stub(contextBridge, 'exposeInMainWorld');
    const execute = stub(contextBridge, 'executeInMainWorld');
    const entry = require.resolve('../../preload/preload-display-pip');
    delete require.cache[entry];
    require(entry);
    assert.equal(expose.called, false);
    assert.equal(execute.called, false);
  });
});
