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

import axios from 'axios';

import {strict as assert} from 'assert';
import {spawnSync} from 'child_process';
import {createServer, Server} from 'http';
import type {AddressInfo} from 'net';
import path from 'path';

describe('[ELC-003] axios tooling compatibility', function () {
  this.timeout(15000);
  let server: Server;
  let baseURL: string;
  before(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        response.statusCode = request.url === '/status' ? 412 : 200;
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            method: request.method,
            authorization: request.headers.authorization,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });
  it('[characterization] retains JSON encoding and bearer credentials', async () => {
    const client = axios.create({baseURL, proxy: false});
    const response = await client.put('/json', {planId: 42}, {headers: {Authorization: 'Bearer synthetic'}});
    assert.equal(response.status, 200);
    assert.equal(response.data.method, 'PUT');
    assert.equal(response.data.authorization, 'Bearer synthetic');
    assert.deepEqual(JSON.parse(response.data.body), {planId: 42});
  });
  it('[characterization] retains binary uploads and configured size rejection', async () => {
    const body = Buffer.from('inert asset');
    const response = await axios.post(`${baseURL}/asset`, body, {proxy: false, maxBodyLength: 100});
    assert.equal(response.data.body, body.toString());
    await assert.rejects(axios.post(`${baseURL}/asset`, body, {proxy: false, maxBodyLength: 2}));
  });
  it('[characterization] preserves error status and explicit retry-status handling', async () => {
    await assert.rejects(
      axios.get(`${baseURL}/status`, {proxy: false}),
      (error: any) => error.isAxiosError && error.response.status === 412,
    );
    const response = await axios.get(`${baseURL}/status`, {proxy: false, validateStatus: () => true});
    assert.equal(response.status, 412);
  });
  it('[security-target] ignores inherited request destinations and credentials', async () => {
    let captured: any;
    const client = axios.create({
      baseURL: 'https://expected.invalid',
      headers: {Authorization: 'Bearer expected'},
      adapter: async config => {
        captured = config;
        return {data: {}, status: 200, statusText: 'OK', headers: {}, config};
      },
    });
    const config = Object.assign(
      Object.create({baseURL: 'https://wrong.invalid', headers: {Authorization: 'Bearer inherited'}}),
      {url: '/relative', method: 'get'},
    );
    await client.request(config);
    assert.equal(captured.baseURL, 'https://expected.invalid');
    assert.equal(captured.headers.Authorization, 'Bearer expected');
  });
  it('[characterization] retains actual GitHub/Hockey/Ibis/config request contracts with an inert adapter', () => {
    const child = spawnSync(
      process.execPath,
      ['--require', path.resolve('.babel-register.js'), path.resolve('bin/deploy-tools/fixtures/axios-consumers.cjs')],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot},
      },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim().split('\n').at(-1)!), {
      github: 2,
      hockey: 2,
      ibis: 5,
      copyConfig: true,
    });
  });
});
