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
  DISPLAY_CAPTURE_BEGIN_CHANNEL,
  DISPLAY_CAPTURE_ENDED_CHANNEL,
  DISPLAY_CAPTURE_LIMITS,
  DISPLAY_CAPTURE_PORT_CHANNEL,
  DISPLAY_CAPTURE_STOP_CHANNEL,
} from './DisplayCaptureContract';

type GeneratedTrack = MediaStreamTrack & {writable: WritableStream<VideoFrame>};
interface DisplayBridge {
  begin(request: {requestId: string}): Promise<{flowId: string}>;
  stop(request: {flowId: string}): Promise<void>;
}
interface PendingCapture {
  requestId: string;
  flowId?: string;
  port?: MessagePort;
  track?: GeneratedTrack;
  writer?: WritableStreamDefaultWriter<VideoFrame>;
  timer: ReturnType<typeof setTimeout>;
  resolve: (stream: MediaStream) => void;
  reject: (error: Error) => void;
  writing: boolean;
  started: boolean;
  ended: boolean;
}

// Serialized into the main world. This compatibility adapter holds no native permission authority.
export function installDisplayMediaAdapter(configuration: {
  portChannel: string;
  endedChannel: string;
  width: number;
  height: number;
  frameTimeoutMs: number;
  promptTimeoutMs: number;
}): void {
  const bridge = (window as unknown as {wireDisplayCapture: DisplayBridge}).wireDisplayCapture;
  if (!navigator.mediaDevices || !bridge) {
    return;
  }
  const Generator = (
    globalThis as unknown as {MediaStreamTrackGenerator?: new (options: {kind: 'video'}) => GeneratedTrack}
  ).MediaStreamTrackGenerator;
  const captures = new Map<string, PendingCapture>();
  const identifier = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const end = (capture: PendingCapture, notify = true): void => {
    if (capture.ended) {
      return;
    }
    capture.ended = true;
    captures.delete(capture.requestId);
    clearTimeout(capture.timer);
    capture.port?.close();
    // Aborting the generator ends clones too; stopping only the original track does not.
    void capture.writer?.abort().catch(() => undefined);
    if (notify && capture.flowId) {
      void bridge.stop({flowId: capture.flowId}).catch(() => undefined);
    }
    capture.reject(new DOMException('Screen sharing was cancelled or ended.', 'NotAllowedError'));
  };
  window.addEventListener('message', event => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }
    if (event.data.channel === configuration.endedChannel && identifier(event.data.flowId)) {
      const capture = [...captures.values()].find(value => value.flowId === event.data.flowId);
      if (capture) {
        end(capture, false);
      }
      return;
    }
    if (
      event.data.channel !== configuration.portChannel ||
      !identifier(event.data.requestId) ||
      !identifier(event.data.flowId) ||
      event.ports.length !== 1
    ) {
      return;
    }
    const capture = captures.get(event.data.requestId);
    if (!capture || capture.ended || capture.port || !Generator) {
      event.ports[0].close();
      return;
    }
    capture.flowId = event.data.flowId;
    capture.port = event.ports[0];
    capture.track = new Generator({kind: 'video'});
    capture.writer = capture.track.writable.getWriter();
    const nativeStop = capture.track.stop.bind(capture.track);
    capture.track.stop = () => {
      nativeStop();
      end(capture);
    };
    const resetTimeout = (): void => {
      clearTimeout(capture.timer);
      capture.timer = setTimeout(() => end(capture), configuration.frameTimeoutMs);
    };
    capture.port.onmessageerror = () => end(capture);
    capture.port.onmessage = async message => {
      const value: unknown = message.data;
      if (!value || typeof value !== 'object' || capture.ended || capture.writing) {
        end(capture);
        return;
      }
      const frame = value as {buffer?: unknown; width?: unknown; height?: unknown; timestamp?: unknown};
      const valid =
        Object.keys(frame).length === 4 &&
        frame.buffer instanceof ArrayBuffer &&
        typeof frame.width === 'number' &&
        Number.isSafeInteger(frame.width) &&
        frame.width > 0 &&
        frame.width <= configuration.width &&
        typeof frame.height === 'number' &&
        Number.isSafeInteger(frame.height) &&
        frame.height > 0 &&
        frame.height <= configuration.height &&
        typeof frame.timestamp === 'number' &&
        Number.isSafeInteger(frame.timestamp) &&
        frame.timestamp >= 0 &&
        frame.buffer.byteLength === frame.width * frame.height * 4;
      if (!valid) {
        end(capture);
        return;
      }
      capture.writing = true;
      let video: VideoFrame | undefined;
      try {
        video = new VideoFrame(frame.buffer as ArrayBuffer, {
          format: 'RGBA',
          codedWidth: frame.width as number,
          codedHeight: frame.height as number,
          timestamp: frame.timestamp as number,
        });
        await capture.writer!.write(video);
        if (capture.ended) {
          return;
        }
        if (!capture.started) {
          capture.started = true;
          capture.resolve(new MediaStream([capture.track!]));
        }
        capture.port!.postMessage('ack');
        resetTimeout();
      } catch {
        end(capture);
      } finally {
        video?.close();
        capture.writing = false;
      }
    };
    capture.port.start();
    resetTimeout();
  });
  window.addEventListener('pagehide', () => {
    for (const capture of [...captures.values()]) {
      end(capture);
    }
  });
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
    configurable: false,
    writable: false,
    value: async (options: DisplayMediaStreamOptions = {}): Promise<MediaStream> => {
      if (!Generator || !navigator.userActivation.isActive || document.visibilityState !== 'visible') {
        throw new DOMException('Screen sharing requires an active visible document.', 'NotAllowedError');
      }
      if (!options || typeof options !== 'object' || options.video === false || options.audio) {
        throw new TypeError('Only video display capture is supported.');
      }
      if (captures.size) {
        throw new DOMException('Screen sharing is already pending or active.', 'InvalidStateError');
      }
      const requestId = crypto.randomUUID();
      return new Promise<MediaStream>((resolve, reject) => {
        const capture: PendingCapture = {
          requestId,
          resolve,
          reject,
          writing: false,
          started: false,
          ended: false,
          timer: setTimeout(() => end(capture), configuration.promptTimeoutMs + configuration.frameTimeoutMs),
        };
        captures.set(requestId, capture);
        void bridge.begin({requestId}).then(
          result => {
            if (!identifier(result?.flowId) || (capture.flowId && capture.flowId !== result.flowId)) {
              end(capture);
              return;
            }
            capture.flowId = result.flowId;
            if (capture.ended) {
              void bridge.stop({flowId: result.flowId}).catch(() => undefined);
            }
          },
          () => end(capture),
        );
      });
    },
  });
}

export const installDisplayCapturePreload = (): void => {
  if (!process.isMainFrame) {
    return;
  }
  contextBridge.exposeInMainWorld(
    'wireDisplayCapture',
    Object.freeze({
      begin: (request: unknown) => ipcRenderer.invoke(DISPLAY_CAPTURE_BEGIN_CHANNEL, request),
      stop: (request: unknown) => ipcRenderer.invoke(DISPLAY_CAPTURE_STOP_CHANNEL, request),
    }),
  );
  ipcRenderer.on(DISPLAY_CAPTURE_PORT_CHANNEL, (event, value: {requestId: string; flowId: string}) => {
    window.postMessage({channel: DISPLAY_CAPTURE_PORT_CHANNEL, ...value}, '*', event.ports);
  });
  ipcRenderer.on(DISPLAY_CAPTURE_ENDED_CHANNEL, (_event, value: {flowId: string}) => {
    window.postMessage({channel: DISPLAY_CAPTURE_ENDED_CHANNEL, ...value}, '*');
  });
  contextBridge.executeInMainWorld({
    func: installDisplayMediaAdapter,
    args: [
      {
        ...DISPLAY_CAPTURE_LIMITS,
        portChannel: DISPLAY_CAPTURE_PORT_CHANNEL,
        endedChannel: DISPLAY_CAPTURE_ENDED_CHANNEL,
      },
    ],
  });
};
