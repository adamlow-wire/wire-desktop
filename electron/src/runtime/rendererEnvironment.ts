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

import type * as EnvironmentUtil from './EnvironmentUtil';

export type RendererEnvironment = Pick<
  typeof EnvironmentUtil,
  'app' | 'platform' | 'linuxDesktop' | 'ServerType' | 'web' | 'getAvailableEnvironments'
>;

export interface RendererEnvironmentSnapshot {
  app: RendererEnvironment['app'];
  platform: RendererEnvironment['platform'];
  linuxDesktop: RendererEnvironment['linuxDesktop'];
  ServerType: RendererEnvironment['ServerType'];
  environments: ReturnType<RendererEnvironment['getAvailableEnvironments']>;
  webappUrl: string | undefined;
  websiteUrl: string;
}

export const snapshotRendererEnvironment = (environment: RendererEnvironment): RendererEnvironmentSnapshot => ({
  app: {...environment.app},
  platform: {...environment.platform},
  linuxDesktop: {...environment.linuxDesktop},
  ServerType: {...environment.ServerType},
  environments: environment.getAvailableEnvironments(),
  webappUrl: environment.web.getWebappUrl(),
  websiteUrl: environment.web.getWebsiteUrl(),
});

export const restoreRendererEnvironment = (snapshot: RendererEnvironmentSnapshot): RendererEnvironment => ({
  app: snapshot.app,
  platform: snapshot.platform,
  linuxDesktop: snapshot.linuxDesktop,
  ServerType: snapshot.ServerType,
  getAvailableEnvironments: () => snapshot.environments,
  web: {
    getWebappUrl: () => snapshot.webappUrl,
    getWebsiteUrl: (path = '') => `${snapshot.websiteUrl}${path}`,
  },
});
