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

// External fixture driver: no inspector, preload injection or product test flag.
const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {mkdtemp, mkdir, rm} = require('node:fs/promises');
const {createServer} = require('node:http');
const {tmpdir} = require('node:os');
const path = require('node:path');

async function main() {
  const executable = process.argv[2];
  assert.ok(executable, 'Pass the packaged application executable.');
  assert.ok(
    process.platform === 'linux' || process.env.GITHUB_ACTIONS === 'true',
    'Native Windows/macOS package launches belong on disposable CI runners.',
  );
  const expectedOverride = process.env.M3_EXPECT_APPLOCK_OVERRIDE ?? 'false';
  assert.ok(['true', 'false'].includes(expectedOverride), 'Expected App-lock override must be true or false.');
  const directory = await mkdtemp(path.join(tmpdir(), 'wire-package-smoke-'));
  const token = randomUUID();
  const authenticatedProxy = process.env.M3_AUTHENTICATED_PROXY === 'true';
  const proxyAuthorization = `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`;
  let proxyChallenges = 0;
  let proxyAuthenticated = 0;
  let child;
  let closed;
  let deadline;
  let output = '';
  let report;
  const reported = new Promise(resolve => (report = resolve));
  const server = createServer((request, response) => {
    if (authenticatedProxy) {
      if (request.headers['proxy-authorization'] !== proxyAuthorization) {
        proxyChallenges++;
        response.writeHead(407, {'Proxy-Authenticate': 'Basic realm="m3-package-fixture"'}).end();
        return;
      }
      proxyAuthenticated++;
    }
    const pathname = new URL(request.url, 'http://m3-package.invalid').pathname;
    if (request.method === 'POST' && pathname === `/result/${token}`) {
      let body = '';
      request.on('data', data => {
        body += data;
        if (body.length > 4096) {
          request.destroy();
        }
      });
      request.on('end', () => {
        try {
          report(JSON.parse(body));
          response.writeHead(204).end();
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Packaged account fixture</title><script>
      (async () => {
        const policy = window.desktopAppConfig?.managedConfig;
        const original = policy?.applockOverride;
        try { if (policy) policy.applockOverride = !original; } catch {}
        const result = {
          account: /^[a-f0-9-]{36}$/i.test(new URL(location).searchParams.get('id') || ''),
          bridge: typeof window.wireDesktopBridge?.events?.loaded === 'function',
          version: typeof window.desktopAppConfig?.version,
          policy: typeof original,
          override: original,
          immutable: !!policy && Object.isFrozen(policy) && policy.applockOverride === original,
          node: [typeof require, typeof process, typeof module],
          top: self === top,
        };
        await fetch('/result/${token}', {method:'POST',body:JSON.stringify(result)});
      })();
    </script>`);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const localServer = `http://127.0.0.1:${server.address().port}`;
    const origin = authenticatedProxy ? 'http://m3-package.invalid' : localServer;
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const proxyArgs = [];
    if (authenticatedProxy) {
      // Synthetic credentials exist only in this child environment, never CLI arguments.
      env.HTTP_PROXY = env.HTTPS_PROXY = `http://fixture-user:fixture-password@127.0.0.1:${server.address().port}`;
      proxyArgs.push(`--proxy-server=${localServer}`);
    }
    // Keep Linux protocol/configuration side effects inside this fixture's XDG roots.
    if (process.platform === 'linux') {
      for (const name of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR']) {
        env[name] = path.join(directory, name);
        await mkdir(env[name], {mode: 0o700});
      }
    }
    child = spawn(
      executable,
      [...process.argv.slice(3), ...proxyArgs, `--env=${origin}`, `--user-data-dir=${directory}/profile`, '--lang=en'],
      {
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    closed = new Promise(resolve => child.once('close', resolve));
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', data => (output = (output + data.toString()).slice(-12000)));
    }
    const prematureExit = new Promise((_, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Application exited before fixture completion (${code}).`)));
    });
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Packaged account did not report within 45 seconds.')), 45000);
    });
    const result = await Promise.race([reported, prematureExit, timeout]);
    assert.deepEqual(result, {
      account: true,
      bridge: true,
      version: 'string',
      policy: 'boolean',
      override: expectedOverride === 'true',
      immutable: true,
      node: ['undefined', 'undefined', 'undefined'],
      top: true,
    });
    if (authenticatedProxy) {
      assert.ok(proxyChallenges > 0, 'The packaged app must receive a real proxy authentication challenge.');
      assert.ok(proxyAuthenticated > 0, 'The packaged app must authenticate through its native proxy path.');
      process.stdout.write('Packaged authenticated HTTP proxy path passes.\n');
    }
    process.stdout.write('Packaged account startup, immutable managed configuration and page Node denial pass.\n');
  } catch (error) {
    // Only this empty-profile/local-server process contributes these diagnostics.
    console.error(output);
    throw error;
  } finally {
    clearTimeout(deadline);
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'pipe'});
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
      await closed;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(directory, {recursive: true, force: true});
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
