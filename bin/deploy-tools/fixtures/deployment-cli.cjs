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
const util = require('node:util');
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const mode = process.env.DEPLOY_CLI_MODE;
const secret = 'synthetic-cli-secret';
const logger = Object.fromEntries(
  ['info', 'warn', 'error', 'log'].map(level => [
    level,
    (...args) => emit({kind: 'diagnostic', level, message: util.inspect(args, {depth: null})}),
  ]),
);
const step = async stage => {
  emit({kind: 'step', stage});
  if (mode === stage) throw Object.assign(new Error(secret), {config: {headers: {Authorization: secret}}});
};
class Deployer {
  constructor(options) {
    emit({kind: 'config', dryRun: options.dryRun});
  }
  async createDraft() {
    return {id: 42};
  }
  async createVersion() {
    return {id: 42};
  }
  async uploadAsset() {
    await step('operation');
  }
  async uploadVersion() {
    await step('operation');
  }
  async uploadToS3() {
    await step('operation');
  }
  async deleteFromS3() {
    await step('operation');
  }
  async copyOnS3() {
    await step('operation');
  }
  async findUploadFiles() {
    await step('preparation');
    return [{fileName: 'Fixture.exe', filePath: 'inert/Fixture.exe'}];
  }
}
const replacements = {
  '../bin-utils': {
    getLogger: () => logger,
    checkCommanderOptions: options => {
      if (!options.wrapperBuild) throw new Error('Missing fixture options');
    },
    execAsync: async () => {
      await step('preparation');
      return {stdout: 'fixture-head'};
    },
  },
  './lib/GitHubDraftDeployer': {GitHubDraftDeployer: Deployer},
  './lib/HockeyDeployer': {HockeyDeployer: Deployer},
  './lib/S3Deployer': {S3Deployer: Deployer},
  './lib/deploy-utils': {
    FileExtension: {ASC: '.asc', SIG: '.sig', EXE: '.exe'},
    find: async pattern => {
      await step('preparation');
      const fileName = pattern.includes('nupkg') ? 'Fixture-1.2.3-full.nupkg' : 'Fixture-Setup.exe';
      return {fileName, filePath: `inert/${fileName}`};
    },
    zip: async () => 'inert/Fixture.zip',
  },
  'fs-extra': {readdir: async () => ['Fixture.exe'], remove: async () => emit({kind: 'cleanup'})},
};
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (replacements[name]) return replacements[name];
  if (['axios', 'aws-sdk'].includes(name)) throw new Error('Unexpected external IO in fixture');
  return original.call(this, name, parent, isMain);
};
