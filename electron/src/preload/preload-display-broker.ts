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

import {
  DISPLAY_BROKER_HEARTBEAT_CHANNEL,
  DISPLAY_BROKER_PORT_CHANNEL,
  DISPLAY_BROKER_READ_CHANNEL,
  DISPLAY_BROKER_SELECT_CHANNEL,
  DISPLAY_BROKER_STOP_CHANNEL,
  DISPLAY_CAPTURE_LIMITS,
  DisplayCaptureLabels,
  isDisplayBrokerChoices,
  getDisplayFrameSize,
} from '../calling/display/DisplayCaptureContract';

type Processor = {readable: ReadableStream<VideoFrame>};
const TrackProcessor = (
  globalThis as unknown as {
    MediaStreamTrackProcessor: new (options: {track: MediaStreamTrack; maxBufferSize: number}) => Processor;
  }
).MediaStreamTrackProcessor;
let labels: DisplayCaptureLabels | undefined;
let port: MessagePort | undefined;
let track: MediaStreamTrack | undefined;
let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
let stopped = false;
let started = false;
let acknowledgement: {resolve: () => void; reject: () => void} | undefined;
let acknowledgementTimer: ReturnType<typeof setTimeout> | undefined;
let pacingTimer: ReturnType<typeof setTimeout> | undefined;
let resumePacing: (() => void) | undefined;

const stop = (): void => {
  if (stopped) {
    return;
  }
  stopped = true;
  clearTimeout(acknowledgementTimer);
  clearTimeout(pacingTimer);
  resumePacing?.();
  acknowledgement?.reject();
  acknowledgement = undefined;
  track?.stop();
  void reader?.cancel().catch(() => undefined);
  port?.close();
  void ipcRenderer.invoke(DISPLAY_BROKER_STOP_CHANNEL).catch(() => undefined);
};

ipcRenderer.on(DISPLAY_BROKER_PORT_CHANNEL, event => {
  if (port || stopped || event.ports.length !== 1) {
    for (const incoming of event.ports) {
      incoming.close();
    }
    stop();
    return;
  }
  port = event.ports[0];
  port.onmessageerror = stop;
  port.onmessage = event => {
    if (event.data !== 'ack' || !acknowledgement) {
      stop();
      return;
    }
    clearTimeout(acknowledgementTimer);
    const waiting = acknowledgement;
    acknowledgement = undefined;
    waiting.resolve();
  };
  port.start();
});

const relay = async (): Promise<void> => {
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
  if (!context) {
    throw new Error('Video relay is unavailable.');
  }
  let latest: {buffer: ArrayBuffer; width: number; height: number} | undefined;
  let firstFrame: (() => void) | undefined;
  const ready = new Promise<void>(resolve => {
    firstFrame = resolve;
  });
  // Static displays legitimately stop producing changed native frames. Cache only the latest
  // approved pixels and repeat them; source termination is governed by the native track.
  const collect = async (): Promise<void> => {
    while (!stopped) {
      const {value: frame, done} = await reader!.read();
      if (done) {
        stop();
        firstFrame?.();
        return;
      }
      try {
        if (stopped) {
          return;
        }
        const dimensions = getDisplayFrameSize(frame.displayWidth, frame.displayHeight);
        if (!dimensions) {
          throw new Error('Video frame dimensions are invalid.');
        }
        const {width, height} = dimensions;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        // Drawing normalizes crop, stride and coded/display dimensions into contiguous RGBA.
        context.drawImage(frame, 0, 0, width, height);
        latest = {buffer: context.getImageData(0, 0, width, height).data.buffer as ArrayBuffer, width, height};
        firstFrame?.();
        firstFrame = undefined;
      } finally {
        frame.close();
      }
    }
  };
  void collect().catch(() => {
    stop();
    firstFrame?.();
  });
  acknowledgementTimer = setTimeout(() => {
    stop();
    firstFrame?.();
  }, DISPLAY_CAPTURE_LIMITS.frameTimeoutMs);
  await ready;
  clearTimeout(acknowledgementTimer);
  let nextHeartbeat = 0;
  while (!stopped && latest) {
    const snapshot = latest;
    // One cached image and one transferred frame; never accumulate frames behind a slow consumer.
    const buffer = snapshot.buffer.slice(0);
    const pending = new Promise<void>((resolve, reject) => {
      acknowledgement = {resolve, reject: () => reject(new Error('Video relay ended.'))};
      acknowledgementTimer = setTimeout(stop, DISPLAY_CAPTURE_LIMITS.frameTimeoutMs);
    });
    port!.postMessage(
      {buffer, width: snapshot.width, height: snapshot.height, timestamp: Math.round(performance.now() * 1000)},
      [buffer],
    );
    await pending;
    if (performance.now() >= nextHeartbeat && !stopped) {
      await ipcRenderer.invoke(DISPLAY_BROKER_HEARTBEAT_CHANNEL);
      nextHeartbeat = performance.now() + 1000;
    }
    if (stopped) {
      break;
    }
    await new Promise<void>(resolve => {
      resumePacing = resolve;
      pacingTimer = setTimeout(resolve, 1000 / DISPLAY_CAPTURE_LIMITS.framesPerSecond);
    });
    resumePacing = undefined;
  }
};

contextBridge.exposeInMainWorld(
  'wireCaptureBroker',
  Object.freeze({
    start: async (): Promise<boolean> => {
      if (started || stopped || !port) {
        return false;
      }
      started = true;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: {max: DISPLAY_CAPTURE_LIMITS.width},
            height: {max: DISPLAY_CAPTURE_LIMITS.height},
            frameRate: {max: DISPLAY_CAPTURE_LIMITS.framesPerSecond},
          },
          audio: false,
        });
        if (stopped) {
          for (const source of stream.getTracks()) {
            source.stop();
          }
          return false;
        }
        track = stream.getVideoTracks()[0];
        if (!track || stream.getAudioTracks().length) {
          for (const source of stream.getTracks()) {
            source.stop();
          }
          stop();
          return false;
        }
        track.addEventListener('ended', stop, {once: true});
        reader = new TrackProcessor({track, maxBufferSize: 1}).readable.getReader();
        document.getElementById('source-list')!.hidden = true;
        document.getElementById('capture-status')!.textContent = labels!.sharing;
        document.getElementById('stop-capture')!.textContent = labels!.stop;
        void relay().catch(stop);
        return true;
      } catch {
        stop();
        return false;
      }
    },
  }),
);

window.addEventListener('pagehide', stop, {once: true});
window.addEventListener(
  'DOMContentLoaded',
  async () => {
    document.getElementById('stop-capture')!.addEventListener('click', stop);
    try {
      const model: unknown = await ipcRenderer.invoke(DISPLAY_BROKER_READ_CHANNEL);
      if (stopped || !isDisplayBrokerChoices(model)) {
        stop();
        return;
      }
      labels = model.labels;
      document.title = labels.title;
      document.querySelector('h1')!.textContent = labels.title;
      document.getElementById('stop-capture')!.textContent = labels.cancel;
      const origin = document.getElementById('capture-origin')!;
      origin.textContent = model.origin;
      origin.title = model.origin;
      document.getElementById('capture-status')!.textContent = model.sources.length ? labels.choose : labels.empty;
      const list = document.getElementById('source-list')!;
      list.setAttribute('aria-label', labels.choose);
      for (const source of model.sources) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.choiceId = source.choiceId;
        button.title = source.name;
        if (source.thumbnail) {
          const thumbnail = document.createElement('img');
          thumbnail.src = source.thumbnail;
          thumbnail.alt = '';
          button.append(thumbnail);
        }
        const label = document.createElement('span');
        label.textContent = source.name;
        button.append(label);
        button.addEventListener(
          'click',
          () => {
            for (const choice of list.querySelectorAll('button')) {
              choice.disabled = true;
            }
            document.getElementById('capture-status')!.textContent = labels!.starting;
            void ipcRenderer.invoke(DISPLAY_BROKER_SELECT_CHANNEL, {choiceId: source.choiceId}).catch(stop);
          },
          {once: true},
        );
        list.append(button);
      }
    } catch {
      stop();
    }
  },
  {once: true},
);
