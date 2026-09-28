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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const util = require('node:util');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-dry-run-test-'));
const file = path.join(root, 'fixture.txt');
fs.writeFileSync(file, 'synthetic-private-asset');
const captured = [];
let requests = 0;
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'logdown')
    return () => ({
      state: {isEnabled: true},
      info: (...args) => captured.push(args),
      error: (...args) => captured.push(args),
      warn: (...args) => captured.push(args),
    });
  if (name === 'is-ci') return false;
  if (name === 'axios')
    return Object.fromEntries(
      ['post', 'put', 'delete'].map(method => [
        method,
        () => {
          requests++;
          throw new Error('Unexpected network request');
        },
      ]),
    );
  return original.call(this, name, parent, isMain);
};
(async () => {
  try {
    const {GitHubDraftDeployer} = require('../lib/GitHubDraftDeployer.ts');
    const {logDry} = require('../lib/deploy-utils.ts');
    const deployer = new GitHubDraftDeployer({
      dryRun: true,
      githubToken: 'synthetic-review-token',
      repoSlug: 'fixture/owned',
    });
    const draft = await deployer.createDraft({
      changelog: 'synthetic-private-changelog',
      commitOrBranch: 'main',
      tagName: 'fixture',
      title: 'Fixture',
    });
    await deployer.uploadAsset({draftId: draft.id, fileName: 'fixture.txt', filePath: file});
    logDry('uploadVersion', {nested: {token: 'synthetic-other-token', content: 'synthetic-private-payload'}});
    console.log(JSON.stringify({draft, requests, diagnostics: util.inspect(captured, {depth: null})}));
  } finally {
    Module._load = original;
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(() => {
  console.error('Dry-run fixture failed');
  process.exitCode = 1;
});
