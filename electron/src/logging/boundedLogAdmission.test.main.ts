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
import {EOL as eol} from 'os';

import {BoundedLogWriterDependencies, createBoundedLogWriter} from './boundedLogWriter';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return {promise, resolve};
};
function fixture(
  overrides: Partial<BoundedLogWriterDependencies> = {},
  afterWrite: () => Promise<void> = async () => {},
) {
  const appended: Array<{path: string; content: string}> = [];
  const dependencies: BoundedLogWriterDependencies = {
    appendFile: async (path, content) => {
      appended.push({path, content});
    },
    ensureDirectory: async () => {},
    getCurrentTimeMilliseconds: () => 0,
    getFileSize: async () => 0,
    moveFile: async () => {},
    pathExists: async () => false,
    ...overrides,
  };
  return {
    appended,
    dependencies,
    writer: createBoundedLogWriter({
      afterWrite,
      dependencies,
      maintenanceCoordinator: {runWrite: operation => operation(), runMaintenance: operation => operation()},
      maximumFileSizeBytes: 100000,
    }),
  };
}
describe('bounded desktop logging admission', () => {
  it('[security-target][CAP-001][INV-010] bounds pending entries across files, drops without rejection and reports loss after recovery', async () => {
    const blocked = deferred();
    let appended = 0;
    let settled = 0;
    let rejected = 0;
    const f = fixture({
      appendFile: async () => {
        appended++;
        await blocked.promise;
      },
    });
    const pending = Array.from({length: 400}, (_, i) =>
      f.writer.write({logFilePath: `fixture-${i % 4}.log`, message: 'x'}).then(
        () => {
          settled++;
        },
        () => {
          rejected++;
        },
      ),
    );
    try {
      await tick();
      assert.equal(settled, 144);
      assert.equal(rejected, 0);
      assert.equal(appended, 4);
    } finally {
      blocked.resolve();
      await Promise.all(pending);
    }
    assert.equal(appended, 256);
    const recovered: string[] = [];
    f.dependencies.appendFile = async (_path, content) => {
      recovered.push(content);
    };
    await f.writer.write({logFilePath: 'recovery.log', message: 'recovered'});
    assert.equal(recovered.length, 1);
    assert.match(recovered[0], /dropped 144 entries while busy/);
    assert.ok(recovered[0].endsWith('recovered' + eol));
  });
  it('[security-target][CAP-001][INV-010] bounds encoded pending bytes independently of entry count', async () => {
    const blocked = deferred();
    let settled = 0;
    let bytes = 0;
    const f = fixture({
      appendFile: async (_path, content) => {
        bytes += Buffer.byteLength(content);
        await blocked.promise;
      },
    });
    const pending = Array.from({length: 32}, (_, i) =>
      f.writer.write({logFilePath: `fixture-${i}.log`, message: 'x'.repeat(65536 - eol.length)}).then(() => {
        settled++;
      }),
    );
    try {
      await tick();
      assert.equal(settled, 16);
      assert.equal(bytes, 1024 * 1024);
    } finally {
      blocked.resolve();
      await Promise.all(pending);
    }
    assert.equal(bytes, 1024 * 1024);
  });
  it('[security-target][CAP-001][INV-010] bounds oversized UTF-8 entries without breaking complete code points', async () => {
    const f = fixture();
    await f.writer.write({logFilePath: 'fixture.log', message: '🧵'.repeat(40000)});
    assert.equal(f.appended.length, 1);
    const content = f.appended[0].content;
    assert.ok(Buffer.byteLength(content) <= 65536);
    assert.ok(content.startsWith('🧵'));
    assert.equal(content.includes('\ufffd'), false);
    assert.ok(content.endsWith(' [desktop log entry truncated]' + eol));
  });
  it('[security-target][CAP-001][INV-010] copies admitted parameters before asynchronous work can observe caller mutation', async () => {
    const f = fixture();
    const input = {logFilePath: 'fixture.log', message: 'original'};
    const pending = f.writer.write(input);
    input.logFilePath = 'foreign.log';
    input.message = 'changed';
    await pending;
    assert.deepEqual(f.appended, [{path: 'fixture.log', content: 'original' + eol}]);
  });
  for (const phase of ['ensureDirectory', 'getFileSize', 'appendFile', 'afterWrite'] as const) {
    it(`[characterization][CAP-001] releases pending entry and byte reservations after ${phase} failure`, async () => {
      let fail = true;
      let writes = 0;
      const injected = async () => {
        if (fail) throw new Error('controlled filesystem failure');
      };
      const overrides: Partial<BoundedLogWriterDependencies> =
        phase === 'afterWrite' ? {getFileSize: async () => 100000} : {};
      if (phase === 'getFileSize') {
        overrides.getFileSize = async () => {
          await injected();
          return 0;
        };
      } else if (phase !== 'afterWrite') {
        overrides[phase] = injected;
      }
      const f = fixture(overrides, phase === 'afterWrite' ? injected : async () => {});
      const pending = Array.from({length: 16}, () =>
        f.writer.write({logFilePath: 'fixture.log', message: 'x'.repeat(65536 - eol.length)}),
      );
      const results = await Promise.allSettled(pending);
      assert.equal(results.filter(x => x.status === 'rejected').length, 16);
      fail = false;
      f.dependencies.getFileSize = async () => 0;
      f.dependencies.appendFile = async () => {
        writes++;
      };
      await f.writer.write({logFilePath: 'fixture.log', message: 'y'.repeat(65536 - eol.length)});
      assert.equal(writes, 1);
      await f.writer.flush();
    });
  }
  it('[security-target][CAP-001][INV-010] rejects oversized path retention without logging the supplied path', async () => {
    const f = fixture();
    await f.writer.write({logFilePath: 'p'.repeat(32769), message: 'oversized path'});
    assert.deepEqual(f.appended, []);
    await f.writer.write({logFilePath: 'fixture.log', message: 'recovered'});
    assert.equal(f.appended.length, 1);
    assert.match(f.appended[0].content, /dropped 1 entries/);
    assert.equal(f.appended[0].content.includes('pppp'), false);
  });
  it('[security-target][CAP-001][INV-010] preserves leading BOM data when truncating a long entry', async () => {
    const f = fixture();
    await f.writer.write({logFilePath: 'fixture.log', message: '\ufeff' + 'x'.repeat(80000)});
    assert.equal(f.appended[0].content.charCodeAt(0), 0xfeff);
    assert.ok(Buffer.byteLength(f.appended[0].content) <= 65536);
  });
  it('[security-target][CAP-001][INV-010] stops collision searches at a finite bound and preserves the original file', async () => {
    let probes = 0;
    let moves = 0;
    const f = fixture({
      getFileSize: async () => 100000,
      pathExists: async () => {
        probes++;
        if (probes > 129) throw new Error('fixture stopped unbounded lookup');
        return true;
      },
      moveFile: async () => {
        moves++;
      },
    });
    await assert.rejects(
      f.writer.write({logFilePath: 'fixture.log', message: 'x'}),
      /Log rotation has no available destination/,
    );
    assert.ok(probes <= 128);
    assert.equal(moves, 0);
    assert.equal(f.appended.length, 0);
    f.dependencies.pathExists = async () => false;
    await f.writer.write({logFilePath: 'fixture.log', message: 'recovered'});
    assert.equal(moves, 1);
    assert.equal(f.appended.length, 1);
  });
});
