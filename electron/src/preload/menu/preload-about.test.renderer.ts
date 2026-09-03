/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import {ipcRenderer} from 'electron';
import {restore, stub} from 'sinon';

import * as assert from 'assert';

import {loadedAboutScreen, updateAboutScreenVersions} from './preload-about';

import {ABOUT_LOCALE_READ_CHANNEL} from '../../security/AboutWindowContract';

describe('loadedAboutScreen', () => {
  afterEach(() => {
    restore();
    document.body.innerHTML = '';
  });

  it('[characterization][SEC-003] requests exactly the rendered locale labels', async () => {
    const invokeStub = stub(ipcRenderer, 'invoke').resolves({
      aboutReleases: 'Releases',
      aboutReleasesUrl: 'https://example.test/releases',
      aboutUpdatesUrl: 'https://example.test/updates',
      aboutVersion: 'Desktop version',
      aboutWebappVersion: 'Web version',
    });
    document.body.innerHTML = `
      <span data-string="aboutVersion"></span>
      <span data-string="aboutWebappVersion"></span>
      <span data-string="aboutReleases"></span>
    `;

    await loadedAboutScreen(null, {
      copyright: '&copy; Wire Swiss GmbH',
      electronVersion: 'Development',
      productName: 'Wire',
      webappVersion: '2019.04.10.0901',
      webappAVSVersion: '9.0.test',
    });

    assert.strictEqual(
      invokeStub.calledOnceWith(ABOUT_LOCALE_READ_CHANNEL, {
        labels: ['aboutVersion', 'aboutWebappVersion', 'aboutReleases'],
      }),
      true,
    );
  });

  it('updates webapp version values without requesting locales again', async () => {
    const invokeStub = stub(ipcRenderer, 'invoke').resolves({
      aboutReleasesUrl: 'https://example.test/releases',
      aboutUpdatesUrl: 'https://example.test/updates',
    });
    document.body.innerHTML = `
      <span id="webappVersion"></span>
      <span id="webappAVSVersion">stale-avs-version</span>
    `;

    await loadedAboutScreen(null, {
      copyright: '&copy; Wire Swiss GmbH',
      electronVersion: 'Development',
      productName: 'Wire',
      webappVersion: '2019.04.10.0901',
      webappAVSVersion: '9.0.test',
    });
    updateAboutScreenVersions(null, {
      copyright: '&copy; Wire Swiss GmbH',
      electronVersion: 'Development',
      productName: 'Wire',
      webappVersion: '2019.04.10.0902',
    });

    const webappVersionElement = document.getElementById('webappVersion');
    const webappAVSVersionElement = document.getElementById('webappAVSVersion');

    if (webappVersionElement === null) {
      assert.fail('Expected webapp version element to exist');
    }

    if (webappAVSVersionElement === null) {
      assert.fail('Expected webapp AVS version element to exist');
    }

    assert.strictEqual(webappVersionElement.textContent, '2019.04.10.0902');
    assert.strictEqual(webappAVSVersionElement.textContent, '');
    assert.strictEqual(invokeStub.calledOnceWith(ABOUT_LOCALE_READ_CHANNEL, {labels: []}), true);
  });
});
