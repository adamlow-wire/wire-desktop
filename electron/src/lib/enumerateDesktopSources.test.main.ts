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

import {strict as assert} from 'assert';

import {DesktopCapturerSource, SourcesOptions} from 'electron';

import {enumerateDesktopSources} from './enumerateDesktopSources';

describe('desktop source enumeration', () => {
  it('[characterization][DCP-008][CAP-003] forwards the options and returns every source unchanged', async () => {
    const options: SourcesOptions = {
      fetchWindowIcons: false,
      thumbnailSize: {height: 176, width: 312},
      types: ['screen', 'window'],
    };
    const sources = [
      {display_id: '1', id: 'screen:1:0', name: 'Entire Screen'},
      {display_id: '', id: 'window:2:0', name: 'Wire'},
    ] as DesktopCapturerSource[];
    let forwarded: SourcesOptions | undefined;

    const result = await enumerateDesktopSources(options, async value => {
      forwarded = value;
      return sources;
    });

    assert.strictEqual(forwarded, options);
    assert.strictEqual(result, sources);
  });
});
