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

import {faker} from '@faker-js/faker';
import {expect, test} from '@playwright/test';
import {createSandbox} from 'sinon';

import {createServer, Server} from 'node:http';
import {AddressInfo} from 'node:net';

import {createUser} from '../../actions/createUser';
import {PublicApiClient, RegisteredUser, TeamOwner} from '../../backend/PublicApiClient';

test('[TST-005] fixture handles remain valid for punctuation and Unicode display names', () => {
  const sandbox = createSandbox();
  try {
    sandbox.stub(faker.person, 'firstName').returns('Renée');
    sandbox.stub(faker.person, 'lastName').returns("O'Connor");
    const user = createUser();
    expect(user.fullName).toBe("Renée O'Connor");
    expect(user.username).toMatch(/^[a-z0-9_]{3,256}$/);
  } finally {
    sandbox.restore();
  }
});

test.describe('[TST-005] fixture API result handling', () => {
  let server: Server;
  let api: PublicApiClient;
  let status: number;
  let request: {method?: string; path?: string; authorization?: string; body: string};
  const user: RegisteredUser = {
    firstName: 'Fixture',
    lastName: 'User',
    fullName: 'Fixture User',
    initials: 'FU',
    username: 'e2e_fixture',
    email: 'fixture@example.invalid',
    password: 'Synthetic-password-1',
    id: '00000000-0000-4000-8000-000000000001',
    token: 'synthetic-token',
  };
  const owner: TeamOwner = {...user, teamId: '00000000-0000-4000-8000-000000000002'};

  test.beforeEach(async () => {
    status = 400;
    request = {body: ''};
    server = createServer((incoming, response) => {
      request = {method: incoming.method, path: incoming.url, authorization: incoming.headers.authorization, body: ''};
      incoming.on('data', chunk => {
        request.body += chunk.toString();
      });
      incoming.on('end', () => {
        response.writeHead(status, {'Content-Type': 'application/json'});
        response.end(
          status === 200 ? '{}' : JSON.stringify({label: 'invalid-fixture', message: 'Synthetic rejection'}),
        );
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    api = new PublicApiClient({baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`});
  });
  test.afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const operations: Array<{name: string; run: (api: PublicApiClient) => Promise<unknown>}> = [
    {name: 'username assignment', run: api => api.setUsername(user.token, user.username)},
    {name: 'account activation', run: api => api.activateAccount(user.email, 'synthetic-activation')},
    {name: 'telemetry preference', run: api => api.setProperties(user, {telemetryDataSharing: false})},
    {name: 'invitation acceptance', run: api => api.acceptTeamInvitation(user, 'synthetic-invitation')},
    {name: 'account cleanup', run: api => api.deleteUser(user)},
    {name: 'team cleanup', run: api => api.deleteTeam(owner)},
  ];
  for (const operation of operations) {
    test(`rejects an unsuccessful ${operation.name} response`, async () => {
      await expect(operation.run(api)).rejects.toThrow();
      expect(request.method).toBeTruthy();
    });
  }

  test('preserves successful username assignment and its exact authenticated request', async () => {
    status = 200;
    await api.setUsername(user.token, user.username);
    expect(request).toEqual({
      method: 'PUT',
      path: '/self/handle',
      authorization: 'Bearer synthetic-token',
      body: JSON.stringify({handle: user.username}),
    });
  });
});
