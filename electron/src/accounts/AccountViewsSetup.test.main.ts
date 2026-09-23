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

import * as ts from 'typescript';

import {strict as assert} from 'assert';
import {EventEmitter} from 'events';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

import type {AccountViews} from './AccountViews';

import {parseNetworkNavigation, isAllowedAccountNavigation} from '../security/NavigationPolicy';
import {ViewIdentityRegistry, registerViewIdentity} from '../security/ViewIdentityRegistry';

const fixture = (failAt?: string) => {
  const failure = new Error('Controlled account view setup failure.');
  let stage = failAt;
  let cleanupStage: string | undefined;
  let closeCalls = 0;
  const diagnostics: unknown[][] = [];
  let nextId = 0;
  let loads = 0;
  let delayClose = false;
  const closing: Array<() => void> = [];
  const registry = new ViewIdentityRegistry();
  const account = {id: '11111111-1111-4111-8111-111111111111', sessionID: '22222222-2222-4222-8222-222222222222'};
  const check = (name: string) => {
    if (stage === name || cleanupStage === name) {
      throw failure;
    }
  };
  const targetSession = {setPermissionCheckHandler: () => undefined, setPermissionRequestHandler: () => undefined};
  const allocated: Array<{
    contents: EventEmitter & {id: number; isDestroyed(): boolean};
    preferences: Record<string, unknown>;
  }> = [];
  class View {
    webContents;
    constructor(options: {webPreferences: Record<string, unknown>}) {
      let destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), {
        id: ++nextId,
        session: targetSession,
        mainFrame: {url: 'https://account.example.test/'},
        isDestroyed: () => destroyed,
        setWindowOpenHandler: (handler: () => {action: string}) => {
          assert.equal(handler().action, 'deny');
          check('popup');
        },
        close: () => {
          closeCalls++;
          check('close');
          const complete = () => {
            destroyed = true;
            this.webContents.emit('destroyed');
          };
          if (delayClose) {
            closing.push(complete);
          } else {
            complete();
          }
        },
      });
      allocated.push({contents: this.webContents, preferences: options.webPreferences});
    }
    setVisible() {
      check('hidden');
    }
    setBounds() {
      check('layout');
    }
  }
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getContentBounds: () => ({width: 800, height: 600}),
    contentView: {addChildView: () => check('attach'), removeChildView: () => check('detach')},
  });
  const filename = path.resolve('electron/src/accounts/AccountViews.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const classes = source.statements.filter(ts.isClassDeclaration).filter(node => node.name?.text === 'AccountViews');
  assert.equal(classes.length, 1);
  const compiled = ts.transpileModule(`${classes[0].getText(source).replace('export class', 'class')}\nAccountViews;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  const ActualViews = runInNewContext(compiled, {
    URL,
    console: {error: (...args: unknown[]) => diagnostics.push(args)},
    ValidationUtil: {
      isUUIDv4: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
    },
    parseNetworkNavigation,
    isAllowedAccountNavigation,
    session: {fromPartition: () => targetSession},
    WebContentsView: View,
    registerViewIdentity: (...args: Parameters<typeof registerViewIdentity>) => {
      check('register');
      return registerViewIdentity(...args);
    },
    bindNavigationGuard: () => check('guard'),
    AccountPermissionPolicy: class {
      cancelPending() {}
    },
    bindAccountPermissionSession: () => () => check('revoke'),
    loadAccountDestination: async () => {
      loads++;
      check('load');
    },
  }) as new (options: object) => AccountViews;
  const views = new ActualViews({
    window,
    registry,
    preload: '/fixture/preload.js',
    additionalArguments: [],
    capabilities: [],
    configure: async () => check('configure'),
    lost: () => check('lost'),
  });
  return {
    views,
    window,
    diagnostics,
    registry,
    account,
    allocated,
    failure,
    recover: () => {
      stage = undefined;
    },
    loads: () => loads,
    closeCalls: () => closeCalls,
    failCleanup: (value?: string) => {
      cleanupStage = value;
    },
    delayClose: () => {
      delayClose = true;
    },
    finishClose: () => {
      delayClose = false;
      closing.splice(0).forEach(complete => complete());
    },
  };
};

describe('[CAP-001][INV-001][INV-005] account view setup ownership', () => {
  it('creates an isolated view and revokes its authority on close', async () => {
    const f = fixture();
    const contents = await f.views.create(f.account, 'https://account.example.test/');
    assert.equal(f.registry.has(contents.id), true);
    const prefs = f.allocated[0].preferences;
    assert.equal(prefs.sandbox, true);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.nodeIntegrationInWorker, false);
    assert.equal(prefs.webviewTag, false);
    await f.views.close(f.account.id);
    assert.equal(contents.isDestroyed(), true);
    assert.equal(f.registry.has(contents.id), false);
  });
  for (const stage of ['hidden', 'register', 'guard', 'popup', 'configure', 'attach', 'layout', 'load']) {
    it(`closes its allocation after ${stage} failure and permits retry`, async () => {
      const f = fixture(stage);
      await assert.rejects(f.views.create(f.account, 'https://account.example.test/'), error => error === f.failure);
      const first = f.allocated[0].contents;
      assert.equal(first.isDestroyed(), true, 'Failed allocation must be closed.');
      assert.equal(f.registry.has(first.id), false, 'Failed allocation must lose authority.');
      assert.equal(f.views.has(f.account.id), false);
      assert.equal(f.loads(), stage === 'load' ? 1 : 0);
      f.recover();
      const replacement = await f.views.create(f.account, 'https://account.example.test/');
      assert.notEqual(replacement.id, first.id);
      await f.views.close(f.account.id);
      assert.equal(replacement.isDestroyed(), true);
    });
  }
  for (const stage of ['register', 'guard']) {
    it(`reserves the partition until destruction after ${stage} failure`, async () => {
      const f = fixture(stage);
      f.delayClose();
      const failed = assert.rejects(
        f.views.create(f.account, 'https://account.example.test/'),
        error => error === f.failure,
      );
      f.recover();
      try {
        await assert.rejects(f.views.create(f.account, 'https://account.example.test/'), /cannot be created/);
        await assert.rejects(
          f.views.create({...f.account, id: '33333333-3333-4333-8333-333333333333'}, 'https://account.example.test/'),
          /cannot be created/,
        );
        assert.equal(f.allocated.length, 1);
      } finally {
        f.finishClose();
        await failed;
      }
      const replacement = await f.views.create(f.account, 'https://account.example.test/');
      await f.views.close(f.account.id);
      assert.equal(replacement.isDestroyed(), true);
    });
  }
  for (const stage of ['revoke', 'detach', 'close']) {
    it(`retains ownership for retry when ${stage} fails during teardown`, async () => {
      const f = fixture();
      const contents = await f.views.create(f.account, 'https://account.example.test/');
      f.failCleanup(stage);
      await assert.rejects(f.views.close(f.account.id), error => error === f.failure);
      assert.equal(f.registry.has(contents.id), false);
      assert.equal(f.closeCalls(), 1, 'Earlier cleanup failure must not skip native close.');
      assert.equal(contents.isDestroyed(), stage !== 'close');
      assert.equal(f.views.has(f.account.id), false);
      await assert.rejects(f.views.create(f.account, 'https://account.example.test/'), /cannot be created/);
      await assert.rejects(
        f.views.create({...f.account, id: '33333333-3333-4333-8333-333333333333'}, 'https://account.example.test/'),
        /cannot be created/,
      );
      f.failCleanup();
      await f.views.close(f.account.id);
      assert.equal(contents.isDestroyed(), true);
      const replacement = await f.views.create(f.account, 'https://account.example.test/');
      await f.views.close(f.account.id);
      assert.equal(replacement.isDestroyed(), true);
    });
  }
  it('retries failed live teardown during owner disposal', async () => {
    const f = fixture();
    const contents = await f.views.create(f.account, 'https://account.example.test/');
    f.failCleanup('close');
    await assert.rejects(f.views.close(f.account.id), error => error === f.failure);
    f.failCleanup();
    await f.views.dispose();
    assert.equal(contents.isDestroyed(), true);
    assert.equal(f.closeCalls(), 2);
  });
  it('retains a pre-registration allocation when its cleanup close throws', async () => {
    const f = fixture('register');
    f.failCleanup('close');
    await assert.rejects(f.views.create(f.account, 'https://account.example.test/'));
    f.recover();
    await assert.rejects(f.views.create(f.account, 'https://account.example.test/'), /cannot be created/);
    f.failCleanup();
    await f.views.close(f.account.id);
    assert.equal(f.allocated[0].contents.isDestroyed(), true);
    const replacement = await f.views.create(f.account, 'https://account.example.test/');
    await f.views.close(f.account.id);
    assert.equal(replacement.isDestroyed(), true);
  });
  it('shares pending destruction and its failure with every close caller', async () => {
    const f = fixture();
    const contents = await f.views.create(f.account, 'https://account.example.test/');
    f.failCleanup('detach');
    f.delayClose();
    const first = assert.rejects(f.views.close(f.account.id), error => error === f.failure);
    const second = assert.rejects(f.views.close(f.account.id), error => error === f.failure);
    f.finishClose();
    await Promise.all([first, second]);
    assert.equal(f.closeCalls(), 1);
    assert.equal(contents.isDestroyed(), true);
    f.failCleanup();
    await f.views.close(f.account.id);
  });
  for (const stage of ['detach', 'lost']) {
    it(`contains and sanitizes crash callback ${stage} failure`, async () => {
      const f = fixture();
      await f.views.create(f.account, 'https://account.example.test/');
      f.failCleanup(stage);
      f.allocated[0].contents.emit('render-process-gone');
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.deepEqual(f.diagnostics, [['Account view lifecycle cleanup failed.']]);
      assert.equal(f.registry.has(f.allocated[0].contents.id), false);
      f.failCleanup();
      await f.views.dispose();
    });
  }
  it('contains native window-close teardown rejection and permits explicit retry', async () => {
    const f = fixture();
    const contents = await f.views.create(f.account, 'https://account.example.test/');
    f.failCleanup('close');
    f.window.emit('closed');
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(f.diagnostics, [['Account view lifecycle cleanup failed.']]);
    assert.equal(contents.isDestroyed(), false);
    f.failCleanup();
    await f.views.dispose();
    assert.equal(contents.isDestroyed(), true);
  });
});
