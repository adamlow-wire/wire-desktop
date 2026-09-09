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

import {LookupAddress} from 'dns';
import {lookup} from 'dns/promises';
import {BlockList, isIP} from 'net';

import {parseNetworkNavigation} from './NavigationPolicy';

const deniedIPv4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  deniedIPv4.addSubnet(address, prefix, 'ipv4');
}

const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const deniedIPv6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  deniedIPv6.addSubnet(address, prefix, 'ipv6');
}

// Conservative IANA special-use exclusions; translation/mapped ranges are not native global IPv6.
export const isPublicNetworkAddress = (address: string): boolean => {
  switch (isIP(address)) {
    case 4:
      return !deniedIPv4.check(address, 'ipv4');
    case 6:
      return globalIPv6.check(address, 'ipv6') && !deniedIPv6.check(address, 'ipv6');
    default:
      return false;
  }
};

export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;
export const resolveHost: ResolveHost = hostname => lookup(hostname, {all: true, verbatim: true});

export const resolvePublicTarget = async (value: string, resolve: ResolveHost = resolveHost) => {
  const url = parseNetworkNavigation(value);
  if (!url || url.port) {
    throw new Error('Preview destination is not permitted.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{address: hostname, family}] : await resolve(hostname);
  if (
    !addresses.length ||
    addresses.length > 32 ||
    addresses.some(
      result =>
        ![4, 6].includes(result.family) ||
        isIP(result.address) !== result.family ||
        !isPublicNetworkAddress(result.address),
    )
  ) {
    throw new Error('Preview destination is not permitted.');
  }
  return {url, addresses};
};
