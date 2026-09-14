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

import {MAX_DEEP_LINK_LENGTH} from './DeepLinkSubmitContract';

import {config} from '../settings/config';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SSO_CODE_PATTERN = /^wire-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isSsoCode = (value: unknown): value is string => typeof value === 'string' && SSO_CODE_PATTERN.test(value);

export type DeepLinkAction =
  | Readonly<{kind: 'location'; location: string}>
  | Readonly<{kind: 'sso-login'; code: string}>
  | Readonly<{kind: 'start-login'}>
  | Readonly<{kind: 'join-conversation'; code: string; domain: string | null; key: string}>;

const hasOnlySingleParameters = (url: URL, allowedParameters: readonly string[]): boolean => {
  const allowed = new Set(allowedParameters);
  const observed = [...url.searchParams.keys()];
  return (
    observed.every(parameter => allowed.has(parameter)) &&
    allowedParameters.every(parameter => {
      const count = url.searchParams.getAll(parameter).length;
      return count <= 1;
    })
  );
};

const normalizeDomain = (value: string): string | undefined => {
  const normalized = value.toLowerCase();
  if (normalized === 'localhost') {
    return normalized;
  }
  if (
    normalized.length === 0 ||
    normalized.length > 253 ||
    !normalized.includes('.') ||
    /^\d/.test(normalized.split('.').pop()!)
  ) {
    return undefined;
  }
  const labels = normalized.split('.');
  return labels.every(
    label =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  )
    ? normalized
    : undefined;
};

const parseUserLocation = (pathname: string): string | undefined => {
  const segments = pathname.slice(1).split('/');
  if (segments.length === 1 && UUID_PATTERN.test(segments[0])) {
    return `/user/${segments[0]}`;
  }
  if (segments.length === 1) {
    const separator = segments[0].lastIndexOf('@');
    const id = segments[0].slice(0, separator);
    const domain = segments[0].slice(separator + 1);
    const normalizedDomain = normalizeDomain(domain);
    if (separator > 0 && UUID_PATTERN.test(id) && normalizedDomain) {
      return `/user/${id}@${normalizedDomain}`;
    }
  }
  const normalizedDomain = normalizeDomain(segments[0] || '');
  if (segments.length === 2 && normalizedDomain && UUID_PATTERN.test(segments[1])) {
    return `/user/${normalizedDomain}/${segments[1]}`;
  }
  if (segments.length === 2 && UUID_PATTERN.test(segments[0]) && normalizeDomain(segments[1])) {
    return `/user/${segments[0]}/${normalizeDomain(segments[1])}`;
  }
  return undefined;
};

export const parseDeepLink = (value: unknown): DeepLinkAction | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_DEEP_LINK_LENGTH ||
    !value.startsWith(`${config.customProtocolName}://`) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  ) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  // Inspect the raw path before URL parsing can normalize traversal away.
  const rawPath = value.slice(value.indexOf('://') + 3).split(/[?#]/, 1)[0];
  try {
    if (
      rawPath.split('/').some(segment => {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f/\\]/.test(decoded);
      })
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  if (
    url.protocol !== `${config.customProtocolName}:` ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== ''
  ) {
    return undefined;
  }

  if (url.hostname === 'conversation') {
    const segments = url.pathname.slice(1).split('/');
    if (!UUID_PATTERN.test(segments[0]) || url.search !== '' || segments.some(segment => !segment)) {
      return undefined;
    }
    let index = 1;
    if (segments[index] && segments[index] !== 'files') {
      const domain = normalizeDomain(segments[index]);
      if (!domain) {
        return undefined;
      }
      segments[index++] = domain;
    }
    if (segments.length > index && segments[index] !== 'files') {
      return undefined;
    }
    return {kind: 'location', location: `/conversation/${segments.join('/')}`};
  }

  if (url.hostname === 'user' && url.search === '') {
    const location = parseUserLocation(url.pathname);
    return location ? {kind: 'location', location} : undefined;
  }

  if (url.hostname === 'start-sso') {
    const segments = url.pathname.slice(1).split('/');
    if (segments.length === 1 && isSsoCode(segments[0]) && url.search === '') {
      return {kind: 'sso-login', code: segments[0]};
    }
    return undefined;
  }

  if (url.hostname === 'start-login') {
    return (url.pathname === '' || url.pathname === '/') && url.search === '' ? {kind: 'start-login'} : undefined;
  }

  if (url.hostname === 'conversation-join' && (url.pathname === '' || url.pathname === '/')) {
    if (!hasOnlySingleParameters(url, ['code', 'key', 'domain'])) {
      return undefined;
    }
    const code = url.searchParams.get('code');
    const key = url.searchParams.get('key');
    const domainValue = url.searchParams.get('domain');
    if (!code || !key || !JOIN_TOKEN_PATTERN.test(code) || !JOIN_TOKEN_PATTERN.test(key)) {
      return undefined;
    }
    const domain = domainValue === null ? null : normalizeDomain(domainValue);
    if (domain === undefined) {
      return undefined;
    }
    return {kind: 'join-conversation', code, domain, key};
  }

  if (
    url.search === '' &&
    ((url.hostname === 'preferences' && ['/about', '/account', '/av', '/devices', '/options'].includes(url.pathname)) ||
      (url.hostname === 'meetings' && url.pathname === ''))
  ) {
    return {kind: 'location', location: `/${url.hostname}${url.pathname}`};
  }

  return undefined;
};
