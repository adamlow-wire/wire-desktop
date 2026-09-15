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

import {createTeam} from '../../actions/createTeam';
import {createUser, registerUser} from '../../actions/createUser';
import {BrigApiClient} from '../../backend/BrigApiClient';
import {GalleyApiClient} from '../../backend/GalleyApiClient';
import {IbisApiClient} from '../../backend/IbisApiClient';
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

  const prepareRegistration = (sandbox: ReturnType<typeof createSandbox>) => {
    const brigApi = new BrigApiClient({baseUrl: 'https://fixture.invalid', basicAuth: 'synthetic'});
    sandbox.stub(brigApi, 'getUserActivationCode').resolves('synthetic-activation');
    sandbox.stub(api, 'registerUser').resolves({id: user.id, zuidCookie: 'zuid=synthetic-cookie'});
    const activation = sandbox.stub(api, 'activateAccount').resolves();
    sandbox.stub(api, 'requestAccessToken').resolves(user.token);
    const username = sandbox.stub(api, 'setUsername').resolves();
    const preference = sandbox.stub(api, 'setProperties').resolves();
    const cleanup = sandbox.stub(api, 'deleteUser').resolves();
    return {brigApi, activation, username, preference, cleanup};
  };

  for (const stage of ['activation', 'username', 'preference'] as const) {
    test(`cleans the created account when ${stage} setup fails`, async () => {
      const sandbox = createSandbox();
      try {
        const setup = prepareRegistration(sandbox);
        setup[stage].rejects(new Error('Synthetic setup failure'));
        await expect(
          registerUser(user, {publicApi: api, brigApi: setup.brigApi}, {telemetryDataSharing: false}),
        ).rejects.toThrow('Synthetic setup failure');
        expect(setup.cleanup.callCount).toBe(1);
        expect(setup.cleanup.firstCall.args).toEqual([user]);
      } finally {
        sandbox.restore();
      }
    });
  }

  test('reports both setup and cleanup failures without claiming that the account was removed', async () => {
    const sandbox = createSandbox();
    try {
      const setup = prepareRegistration(sandbox);
      setup.username.rejects(new Error('Synthetic setup failure'));
      setup.cleanup.rejects(new Error('Synthetic cleanup failure'));
      await expect(registerUser(user, {publicApi: api, brigApi: setup.brigApi})).rejects.toBeInstanceOf(AggregateError);
      expect(setup.cleanup.callCount).toBe(1);
    } finally {
      sandbox.restore();
    }
  });

  for (const stage of ['owner upgrade', 'member invitation'] as const) {
    test(`cleans partial team resources when ${stage} fails`, async () => {
      const sandbox = createSandbox();
      try {
        const setup = prepareRegistration(sandbox);
        const upgrade = sandbox
          .stub(api, 'upgradeUserToTeamOwner')
          .resolves({teamId: owner.teamId, teamName: 'Fixture'});
        const invitation = sandbox.stub(api, 'sendTeamInvitation').resolves('synthetic-invitation');
        const teamCleanup = sandbox.stub(api, 'deleteTeam').resolves();
        (stage === 'owner upgrade' ? upgrade : invitation).rejects(new Error('Synthetic team setup failure'));
        await expect(
          createTeam(
            {
              publicApi: api,
              brigApi: setup.brigApi,
              galleyApi: new GalleyApiClient({baseUrl: 'https://fixture.invalid', basicAuth: 'synthetic'}),
              ibisApi: new IbisApiClient({baseUrl: 'https://fixture.invalid'}),
            },
            'Fixture',
            {users: [user]},
          ),
        ).rejects.toThrow('Synthetic team setup failure');
        expect(stage === 'owner upgrade' ? setup.cleanup.callCount : teamCleanup.callCount).toBe(1);
      } finally {
        sandbox.restore();
      }
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
