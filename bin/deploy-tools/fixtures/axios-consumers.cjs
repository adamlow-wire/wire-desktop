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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-axios-consumers-'));
const file = path.join(root, 'fixture.zip');
fs.writeFileSync(file, 'inert asset');
const calls = [];
axios.defaults.adapter = async config => {
  calls.push(config);
  if (config.data && typeof config.data.pipe === 'function') {
    await new Promise((resolve, reject) => {
      config.data.on('error', reject);
      config.data.on('end', resolve);
      config.data.resume();
    });
  }
  let data = {id: 42};
  if (config.url.endsWith('/billing/plan/list')) data = [{id: 'enterprise', premium: true}];
  if (config.url.endsWith('/billing/team')) data = {status: 'active'};
  return {status: 200, statusText: 'OK', headers: {}, config, data};
};
(async () => {
  try {
    const {GitHubDraftDeployer} = require('../lib/GitHubDraftDeployer.ts');
    const {HockeyDeployer} = require('../lib/HockeyDeployer.ts');
    const {IbisApiClient} = require('../../../e2e-tests/backend/IbisApiClient.ts');
    const github = new GitHubDraftDeployer({githubToken: 'synthetic', repoSlug: 'fixture/owned'});
    assert.equal(
      (await github.createDraft({changelog: 'fixture', commitOrBranch: 'main', tagName: 'fixture', title: 'fixture'}))
        .id,
      42,
    );
    await github.uploadAsset({draftId: 42, fileName: 'fixture.zip', filePath: file});
    assert.ok(calls.slice(0, 2).every(c => c.headers.Authorization === 'token synthetic'));
    assert.equal(JSON.parse(calls[0].data).draft, true);
    assert.equal(calls[1].data.toString(), 'inert asset');
    const hockey = new HockeyDeployer({hockeyToken: 'synthetic', hockeyAppId: 'fixture', version: '1.2.3'});
    assert.equal((await hockey.createVersion()).id, 42);
    await hockey.uploadVersion({filePath: file, hockeyVersionId: 42});
    assert.ok(calls.slice(2, 4).every(c => c.headers['X-HockeyAppToken'] === 'synthetic'));
    assert.equal(JSON.parse(calls[2].data).bundle_version, '3');
    assert.match(calls[3].headers['Content-Type'] || calls[3].headers['content-type'], /multipart\/form-data/);
    const ibis = new IbisApiClient({baseUrl: 'https://ibis.invalid'});
    await ibis.upgradeTeam({teamId: 'fixture', token: 'synthetic', firstName: 'Fixture', lastName: 'Only'});
    const billing = calls.slice(4);
    assert.deepEqual(
      billing.map(c => c.method),
      ['put', 'put', 'get', 'put', 'get'],
    );
    assert.ok(
      billing.every(
        c =>
          c.headers.Authorization === 'Bearer synthetic' &&
          c.baseURL === 'https://ibis.invalid' &&
          c.withCredentials === true,
      ),
    );
    assert.equal(JSON.parse(billing[3].data).planId, 'enterprise');
    assert.equal(billing[0].validateStatus(412), true);
    const copyRequire = require('node:module').createRequire(require.resolve('@wireapp/copy-config/package.json'));
    const copyAxios = copyRequire('axios');
    const zip = new (require('jszip'))();
    zip.file('root/fixture.json', '{"fixture":true}');
    const zipBytes = await zip.generateAsync({type: 'nodebuffer'});
    copyAxios.defaults.adapter = async config => {
      assert.equal(config.url, 'https://config.invalid/fixture.zip');
      assert.equal(config.responseType, 'stream');
      return {data: require('node:stream').Readable.from(zipBytes), status: 200, statusText: 'OK', headers: {}, config};
    };
    const destination = path.join(root, 'config');
    await copyRequire('./lib/utils').downloadFileAsync('https://config.invalid/fixture.zip', destination);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination, 'fixture.json'), 'utf8')), {fixture: true});
    assert.equal(fs.existsSync(path.join(destination, 'archive.zip')), false);
    console.log(JSON.stringify({github: 2, hockey: 2, ibis: billing.length, copyConfig: true}));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
