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

const Module = require('node:module');
const {PassThrough} = require('node:stream');
const util = require('node:util');
const original = Module._load;
let mode, calls, logs, streams;
const secret = 'synthetic-deployment-secret';
function failure() {
  const error = new Error(secret);
  error.isAxiosError = true;
  error.config = {headers: {Authorization: secret}};
  if (!mode.endsWith('offline')) error.response = {status: 503, statusText: secret, data: secret};
  return error;
}
Module._load = function (name, parent, isMain) {
  if (name === 'logdown')
    return () => ({state: {}, info: (...args) => logs.push(args), error: (...args) => logs.push(args)});
  if (name === 'fs-extra')
    return {
      readFile: async () => Buffer.from('synthetic asset'),
      createReadStream: () => {
        const stream = new PassThrough();
        streams.push(stream);
        return stream;
      },
    };
  if (name === 'axios')
    return Object.fromEntries(
      ['post', 'put', 'delete'].map(method => [
        method,
        async (url, data, config) => {
          calls.push({
            method,
            url,
            authorized:
              (config || data).headers.Authorization === `token ${secret}` ||
              (config || data).headers['X-HockeyAppToken'] === secret,
          });
          if (mode.endsWith('success') || (method === 'delete' && !mode.startsWith('github-delete')))
            return {data: {id: 42}};
          throw failure();
        },
      ]),
    );
  return original.call(this, name, parent, isMain);
};
(async () => {
  try {
    const {GitHubDraftDeployer} = require('../lib/GitHubDraftDeployer.ts');
    const {HockeyDeployer} = require('../lib/HockeyDeployer.ts');
    const results = [];
    for (const operation of ['github-create', 'github-upload', 'github-delete', 'hockey-create', 'hockey-upload']) {
      for (const outcome of ['success', 'response', 'offline']) {
        mode = `${operation}-${outcome}`;
        calls = [];
        logs = [];
        streams = [];
        let rejected = false,
          message = '',
          value;
        try {
          const github = new GitHubDraftDeployer({githubToken: secret, repoSlug: 'fixture/owned'});
          const hockey = new HockeyDeployer({hockeyToken: secret, hockeyAppId: 'fixture', version: '1.2.3'});
          if (operation === 'github-create')
            value = await github.createDraft({
              changelog: 'fixture',
              commitOrBranch: 'main',
              tagName: 'fixture',
              title: 'fixture',
            });
          else if (operation.startsWith('github'))
            value = await github.uploadAsset({draftId: 42, fileName: 'fixture.txt', filePath: 'inert-fixture'});
          else if (operation === 'hockey-create') value = await hockey.createVersion();
          else value = await hockey.uploadVersion({hockeyVersionId: 42, filePath: 'inert-fixture'});
        } catch (error) {
          rejected = true;
          message = error.message;
        } finally {
          streams.forEach(stream => stream.destroy());
        }
        results.push({
          mode,
          rejected,
          message,
          value,
          calls,
          leaked: util.inspect(logs, {depth: null}).includes(secret) || message.includes(secret),
        });
      }
    }
    console.log(JSON.stringify(results));
  } finally {
    Module._load = original;
  }
})().catch(() => {
  console.error('Deployment fixture failed');
  process.exitCode = 1;
});
