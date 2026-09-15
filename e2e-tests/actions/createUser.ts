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

import {BrigApiClient} from '../backend/BrigApiClient';
import {PublicApiClient, RegisteredUser} from '../backend/PublicApiClient';

const runRegistrationStep = async <T>(step: string, operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`User registration failed during ${step}: ${detail}`, {cause: error});
  }
};

export type User = {
  firstName: string;
  lastName: string;
  username: string;
  initials: string;
  fullName: string;
  email: string;
  password: string;
};

export const createUser = (): User => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const username = `e2e_${faker.string.alphanumeric({length: 24, casing: 'lower'})}`;

  return {
    firstName,
    lastName,
    username,
    get initials() {
      return `${this.firstName[0]}${this.lastName[0]}`;
    },
    get fullName() {
      return `${this.firstName} ${this.lastName}`;
    },
    email: faker.internet.email({firstName, lastName, provider: 'wire.engineering'}),
    password: generateValidPassword(),
  };
};

const generateValidPassword = () => {
  const uppercase = faker.string.alpha({length: 1, casing: 'upper'});
  const lowercase = faker.string.alpha({length: 1, casing: 'lower'});
  const number = faker.string.numeric(1);
  const symbol = faker.string.symbol(1);
  const randomChars = faker.string.alphanumeric(4).split('');

  return faker.helpers.shuffle([uppercase, lowercase, number, symbol, ...randomChars]).join('');
};

export const registerUser = async (
  user: User,
  {publicApi, brigApi}: {publicApi: PublicApiClient; brigApi: BrigApiClient},
  options?: {telemetryDataSharing?: boolean},
): Promise<RegisteredUser> => {
  const {id, zuidCookie} = await runRegistrationStep('account creation', () => publicApi.registerUser(user));

  if (id === undefined) {
    throw new Error(`Failed to register user`);
  }

  let accessToken: string | undefined;
  try {
    const activationCode = await runRegistrationStep('activation-code lookup', () =>
      brigApi.getUserActivationCode(user.email),
    );
    await runRegistrationStep('account activation', () => publicApi.activateAccount(user.email, activationCode));

    const token = await runRegistrationStep('access-token request', () => publicApi.requestAccessToken(zuidCookie));
    accessToken = token;

    await runRegistrationStep('username assignment', () => publicApi.setUsername(token, user.username));

    const registeredUser = {...user, id, token};

    if (options?.telemetryDataSharing !== undefined) {
      await runRegistrationStep('telemetry preference update', () =>
        publicApi.setProperties(registeredUser, {telemetryDataSharing: options.telemetryDataSharing}),
      );
    }

    return registeredUser;
  } catch (setupError) {
    try {
      const token = accessToken ?? (await publicApi.requestAccessToken(zuidCookie));
      await publicApi.deleteUser({...user, id, token});
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        'User setup failed and its created account could not be removed',
      );
    }
    throw setupError;
  }
};
