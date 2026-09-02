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

import {createUser, registerUser} from './createUser';

import {BrigApiClient} from '../backend/BrigApiClient';
import {GalleyApiClient} from '../backend/GalleyApiClient';
import {IbisApiClient} from '../backend/IbisApiClient';
import {PublicApiClient, RegisteredUser, TeamOwner} from '../backend/PublicApiClient';

export type TeamRole = 'admin' | 'partner' | 'owner' | 'member';

export type Team = {
  teamId: string;
  owner: TeamOwner;
  /** Add a new member to the team after its initial creation */
  addTeamMember: (member: RegisteredUser, options?: {role?: TeamRole}) => Promise<void>;
};

const runTeamSetupStep = async <T>(step: string, operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Team setup failed during ${step}: ${detail}`, {cause: error});
  }
};

export const createTeam = async (
  api: {publicApi: PublicApiClient; brigApi: BrigApiClient; galleyApi: GalleyApiClient; ibisApi: IbisApiClient},
  teamName: string,
  options?: {
    users?: (RegisteredUser | {user: RegisteredUser; role?: TeamRole})[];
    features?: {
      conferenceCalling?: boolean;
      channels?: boolean;
      mls?: boolean;
      cells?: boolean;
    };
  },
) => {
  const user = await runTeamSetupStep('owner registration', () =>
    registerUser(createUser(), {publicApi: api.publicApi, brigApi: api.brigApi}, {telemetryDataSharing: false}),
  );

  const {teamId} = await runTeamSetupStep('owner upgrade', () => api.publicApi.upgradeUserToTeamOwner(user, teamName));
  const owner: TeamOwner = {...user, teamId};

  const addTeamMember: Team['addTeamMember'] = async (member, options) => {
    const invitationId = await runTeamSetupStep('member invitation', () =>
      api.publicApi.sendTeamInvitation(owner, member.email, options?.role ?? 'member'),
    );
    const invitationCode = await runTeamSetupStep('invitation-code lookup', () =>
      api.brigApi.getTeamActivationCode(owner.teamId, invitationId),
    );
    await runTeamSetupStep('invitation acceptance', () => api.publicApi.acceptTeamInvitation(member, invitationCode));
  };

  if (options?.users) {
    await Promise.all(
      options.users.map(user => {
        if ('user' in user) {
          return addTeamMember(user.user, {role: user.role});
        }
        return addTeamMember(user);
      }),
    );
  }

  if (options?.features && Object.values(options.features).some(Boolean)) {
    await runTeamSetupStep('team feature upgrade', () => api.ibisApi.upgradeTeam(owner));

    if (options.features.conferenceCalling) {
      await runTeamSetupStep('conference-calling unlock', () => api.galleyApi.unlockConferenceCallingFeature(teamId));
    }
  }

  return {teamId, owner, addTeamMember};
};
