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

import {strict as assert} from 'node:assert';

import {
  DISPLAY_CAPTURE_LIMITS,
  DisplayBrokerChoices,
  isDisplayBrokerChoices,
  getDisplayFrameSize,
  isDisplayCaptureRequest,
  isDisplayCaptureStarted,
  isDisplayIdentifier,
  isDisplaySourceSelection,
  isEmptyDisplayRequest,
} from './DisplayCaptureContract';

const id = 'abcdef01-2345-4000-8000-000000000001';
const choices = (): DisplayBrokerChoices => ({
  origin: 'https://app.example.test',
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
  sources: [{choiceId: id, name: '<script>literal source name</script>', thumbnail: 'data:image/png;base64,AA=='}],
});

describe('[security-target][CAP-003] display capture contracts', () => {
  it('accepts only bounded opaque v4 identifiers and exact single-field requests', () => {
    assert.equal(isDisplayIdentifier(id), true);
    assert.equal(isDisplayCaptureRequest({requestId: id}), true);
    assert.equal(isDisplayCaptureStarted({flowId: id}), true);
    assert.equal(isDisplaySourceSelection({choiceId: id}), true);
    assert.equal(isEmptyDisplayRequest(undefined), true);
    assert.equal(isEmptyDisplayRequest(null), false);
    for (const value of [
      null,
      undefined,
      '',
      'screen:0:0',
      id.toUpperCase(),
      id.replace('4000', '1000'),
      'x'.repeat(8192),
      {},
      1,
    ]) {
      assert.equal(isDisplayIdentifier(value), false);
    }
    for (const value of [
      null,
      [],
      {},
      {requestId: id, sourceId: id},
      {flowId: id},
      {requestId: 1},
      Object.create({requestId: id}),
    ]) {
      assert.equal(isDisplayCaptureRequest(value), false);
    }
    assert.equal(isDisplayCaptureStarted({flowId: id, requestId: id}), false);
    assert.equal(isDisplaySourceSelection({choiceId: 'screen:0:0'}), false);
  });

  it('bounds the local chooser model without interpreting source names as markup', () => {
    assert.equal(isDisplayBrokerChoices(choices()), true);
    assert.equal(isDisplayBrokerChoices({...choices(), sources: []}), true);
    for (const value of [
      null,
      [],
      {},
      {...choices(), extra: true},
      {...choices(), origin: 'x'.repeat(2049)},
      {...choices(), labels: {}},
      {...choices(), labels: {...choices().labels, title: 'x'.repeat(513)}},
      {...choices(), sources: new Array(DISPLAY_CAPTURE_LIMITS.maximumSources + 1).fill(choices().sources[0])},
    ]) {
      assert.equal(isDisplayBrokerChoices(value), false);
    }
  });

  for (const source of [
    {choiceId: 'screen:0:0', name: 'Screen', thumbnail: ''},
    {choiceId: id, name: 'x'.repeat(2049), thumbnail: ''},
    {choiceId: id, name: 'Screen', thumbnail: 'https://external.example/image.png'},
    {choiceId: id, name: 'Screen', thumbnail: 'data:image/svg+xml,<svg/>'},
    {
      choiceId: id,
      name: 'Screen',
      thumbnail: `data:image/png;base64,${'A'.repeat(DISPLAY_CAPTURE_LIMITS.maximumThumbnailBytes)}`,
    },
    {choiceId: id, name: 'Screen', thumbnail: '', nativeSourceId: 'screen:0:0'},
  ]) {
    it('rejects an invalid or excessive source descriptor', () => {
      assert.equal(isDisplayBrokerChoices({...choices(), sources: [source]}), false);
    });
  }
  it('bounds frame dimensions without allocating oversized or malformed pixel buffers', () => {
    assert.deepEqual(getDisplayFrameSize(1920, 1080), {width: 1920, height: 1080});
    assert.deepEqual(getDisplayFrameSize(5120, 1440), {width: 3840, height: 1080});
    assert.deepEqual(getDisplayFrameSize(2160, 3840), {width: 1215, height: 2160});
    for (const [width, height] of [
      [0, 1],
      [1, 0],
      [-1, 10],
      [1.5, 1],
      [NaN, 1],
      [1, Infinity],
      [Number.MAX_SAFE_INTEGER, 1],
    ]) {
      assert.equal(getDisplayFrameSize(width, height), undefined);
    }
  });
});
