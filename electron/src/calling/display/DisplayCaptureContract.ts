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

export const DISPLAY_CAPTURE_CAPABILITY = 'display-capture';
export const DISPLAY_CAPTURE_BEGIN_CHANNEL = 'wire-desktop:display:begin:v1';
export const DISPLAY_CAPTURE_STOP_CHANNEL = 'wire-desktop:display:stop:v1';
export const DISPLAY_CAPTURE_PORT_CHANNEL = 'wire-desktop:display:port:v1';
export const DISPLAY_CAPTURE_ENDED_CHANNEL = 'wire-desktop:display:ended:v1';
export const DISPLAY_BROKER_CAPABILITY = 'display-broker';
export const DISPLAY_BROKER_READ_CHANNEL = 'wire-desktop:display:broker:read:v1';
export const DISPLAY_BROKER_SELECT_CHANNEL = 'wire-desktop:display:broker:select:v1';
export const DISPLAY_BROKER_HEARTBEAT_CHANNEL = 'wire-desktop:display:broker:heartbeat:v1';
export const DISPLAY_BROKER_STOP_CHANNEL = 'wire-desktop:display:broker:stop:v1';
export const DISPLAY_BROKER_PORT_CHANNEL = 'wire-desktop:display:broker:port:v1';

export const DISPLAY_CAPTURE_LIMITS = Object.freeze({
  width: 3840,
  height: 2160,
  framesPerSecond: 5,
  frameTimeoutMs: 10_000,
  promptTimeoutMs: 60_000,
  maximumSources: 64,
  maximumThumbnailBytes: 256 * 1024,
});

export interface DisplayCaptureRequest {
  readonly requestId: string;
}
export interface DisplayCaptureStarted {
  readonly flowId: string;
}
export interface DisplaySourceChoice {
  readonly choiceId: string;
  readonly name: string;
  readonly thumbnail: string;
}
export interface DisplayCaptureLabels {
  readonly title: string;
  readonly loading: string;
  readonly choose: string;
  readonly empty: string;
  readonly starting: string;
  readonly sharing: string;
  readonly stop: string;
  readonly cancel: string;
}
export interface DisplayBrokerChoices {
  readonly labels: DisplayCaptureLabels;
  readonly origin: string;
  readonly sources: readonly DisplaySourceChoice[];
}

export const isDisplayIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const isIdentifierObject = (value: unknown, key: string): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  Object.prototype.hasOwnProperty.call(value, key) &&
  isDisplayIdentifier((value as Record<string, unknown>)[key]);

export const isDisplayCaptureRequest = (value: unknown): value is DisplayCaptureRequest =>
  isIdentifierObject(value, 'requestId');
export const isDisplayCaptureStarted = (value: unknown): value is DisplayCaptureStarted =>
  isIdentifierObject(value, 'flowId');
export const isDisplaySourceSelection = (value: unknown): value is {choiceId: string} =>
  isIdentifierObject(value, 'choiceId');
export const isEmptyDisplayRequest = (value: unknown): value is undefined => value === undefined;
export const isDisplayBrokerChoices = (value: unknown): value is DisplayBrokerChoices => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const choices = value as Partial<DisplayBrokerChoices>;
  return (
    Object.keys(value).length === 3 &&
    !!choices.labels &&
    typeof choices.labels === 'object' &&
    Object.keys(choices.labels).length === 8 &&
    ['title', 'loading', 'choose', 'empty', 'starting', 'sharing', 'stop', 'cancel'].every(
      key =>
        typeof (choices.labels as unknown as Record<string, unknown>)[key] === 'string' &&
        (choices.labels as unknown as Record<string, string>)[key].length <= 512,
    ) &&
    typeof choices.origin === 'string' &&
    choices.origin.length <= 2048 &&
    Array.isArray(choices.sources) &&
    choices.sources.length <= DISPLAY_CAPTURE_LIMITS.maximumSources &&
    choices.sources.every(
      source =>
        source &&
        typeof source === 'object' &&
        Object.keys(source).length === 3 &&
        isDisplayIdentifier(source.choiceId) &&
        typeof source.name === 'string' &&
        source.name.length <= 2048 &&
        typeof source.thumbnail === 'string' &&
        source.thumbnail.length <= DISPLAY_CAPTURE_LIMITS.maximumThumbnailBytes &&
        (source.thumbnail === '' || /^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(source.thumbnail)),
    )
  );
};

export const getDisplayFrameSize = (width: number, height: number): {width: number; height: number} | undefined => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return undefined;
  }
  const scale = Math.min(1, DISPLAY_CAPTURE_LIMITS.width / width, DISPLAY_CAPTURE_LIMITS.height / height);
  const result = {width: Math.floor(width * scale), height: Math.floor(height * scale)};
  return result.width > 0 && result.height > 0 ? result : undefined;
};
