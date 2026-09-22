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

const ts = require('typescript');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../../src/mainProcess.ts');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
const callbacks = [];
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === 'app.on' &&
    node.arguments[0]?.text === 'ready'
  ) {
    callbacks.push(node.arguments[1]);
    return; // Deliberately keep nested listeners in the actual callback under test.
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(callbacks.length, 1, 'one top-level application ready callback');
const mode = process.argv[2];
const mac = mode !== 'windows';
const internal = mode !== 'app-store';
const calls = [];
const nested = [];
const main = {};
const state = {};
const context = {
  app: {on: (event, callback) => nested.push({event, callback}), commandLine: {appendSwitch() {}}},
  installLocalContentProtocol: (_session, _path, role) => calls.push(`protocol:${role}`),
  session: {defaultSession: {}, fromPartition: () => ({})},
  APP_PATH: '/inert/application',
  initWindowStateKeeper: () => {
    calls.push('state');
    return state;
  },
  systemMenu: {
    createMenu: () => {
      calls.push('menu');
      return {append() {}};
    },
  },
  isFullScreen: false,
  wallClock: {},
  AboutWindow: {},
  viewIdentityRegistry: {},
  logger: {},
  EnvironmentUtil: {app: {IS_DEVELOPMENT: internal}, platform: {IS_MAC_OS: mac}},
  developerMenu: {},
  Menu: {setApplicationMenu: () => calls.push('set-menu')},
  TrayHandler: class {
    initTray() {
      calls.push('tray');
    }
  },
  tray: undefined,
  showMainWindow: async received => {
    assert.equal(received, state);
    calls.push('window-start');
    await Promise.resolve();
    if (mode === 'window-failure') {
      throw new Error('synthetic window failure');
    }
    calls.push('window-ready');
  },
  isInternalBuild: () => internal,
  initMacAutoUpdater: window => {
    assert.equal(window, main);
    calls.push('updater');
  },
  main,
};
(async () => {
  const code = ts.transpileModule(`(${callbacks[0].getText(source)})`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText;
  let failed = false;
  try {
    await vm.runInNewContext(code, context)();
  } catch (error) {
    if (error.message !== 'synthetic window failure') {
      throw error;
    }
    failed = true;
  }
  process.stdout.write(`${JSON.stringify({calls, failed, pendingReadyListeners: nested.length})}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
