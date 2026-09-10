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

import {strict as assert} from 'node:assert';

import {
  ACCOUNT_PERMISSION_CAPABILITY,
  AccountPermissionPolicy,
  AccountPermissionScope,
} from './AccountPermissionPolicy';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

const origin = 'https://app.wire.test';
const details = {isMainFrame: true, requestingUrl: `${origin}/call`, securityOrigin: origin};
const fixture = () => {
  const registry = new ViewIdentityRegistry();
  const sender = {id: 1, mainFrame: {url: `${origin}/call`}, session: {}, isDestroyed: () => false};
  const registration = {
    accountId: 'account-a',
    allowedOrigin: origin,
    capabilities: [ACCOUNT_PERMISSION_CAPABILITY],
    partition: 'account-a',
    session: sender.session,
    viewType: 'account' as const,
    webContents: sender,
  };
  const owner = registry.register(registration);
  const prompts: Array<readonly AccountPermissionScope[]> = [];
  const consent = {
    canPrompt: () => true,
    ask: async (_owner: typeof owner, scopes: readonly AccountPermissionScope[]) => {
      assert.equal(_owner, owner);
      prompts.push(scopes);
      return true;
    },
  };
  const policy = new AccountPermissionPolicy(registry, owner, consent);
  return {registry, registration, sender, owner, prompts, consent, policy};
};

describe('[security-target][INV-003][INV-004][INV-006][SEC-009] account permission policy', () => {
  it('requires consent and keeps microphone, camera and notification grants separate', async () => {
    const {policy, sender, prompts} = fixture();
    assert.equal(policy.check(sender, 'media', origin, {...details, mediaType: 'audio'}), false);
    assert.equal(await policy.request(sender, 'media', {...details, mediaTypes: ['audio']}), true);
    assert.deepEqual(prompts, [['audio']]);
    assert.equal(policy.check(sender, 'media', origin, {...details, mediaType: 'audio'}), true);
    assert.equal(policy.check(sender, 'media', origin, {...details, mediaType: 'video'}), false);
    assert.equal(policy.check(sender, 'media', origin, {...details, mediaType: 'unknown'}), false);
    assert.equal(policy.check(sender, 'media', origin, details), false);
    assert.equal(policy.check(sender, 'notifications', origin, details), false);
    assert.equal(await policy.request(sender, 'media', {...details, mediaTypes: ['audio', 'video']}), true);
    assert.deepEqual(prompts, [['audio'], ['video']]);
    assert.equal(await policy.request(sender, 'notifications', details), true);
    assert.equal(policy.check(sender, 'notifications', origin, details), true);
  });

  it('denies unknown permissions and ambiguous media types without prompting', async () => {
    const {policy, sender, prompts} = fixture();
    for (const permission of ['geolocation', 'display-capture', 'clipboard-read', 'unknown', 'usb']) {
      assert.equal(await policy.request(sender, permission, details), false);
      assert.equal(policy.check(sender, permission, origin, details), false);
    }
    for (const mediaTypes of [undefined, [], ['unknown'], ['audio', 'audio'], ['audio', 'video', 'audio']]) {
      assert.equal(await policy.request(sender, 'media', {...details, mediaTypes}), false);
    }
    assert.deepEqual(prompts, []);
  });

  it('rejects missing, spoofed, foreign-session and unregistered senders without prompting', async () => {
    const {policy, sender, prompts} = fixture();
    assert.equal(await policy.request(sender, 'notifications', details), true);
    for (const invalid of [null, {...sender}, {...sender, session: {}}, {...sender, id: 2}]) {
      assert.equal(await policy.request(invalid, 'notifications', details), false);
      assert.equal(policy.check(invalid, 'notifications', origin, details), false);
    }
    assert.equal(prompts.length, 1);
  });

  it('rejects auxiliary views and accounts without the permission capability', async () => {
    for (const override of [
      {capabilities: []},
      {viewType: 'sso' as const},
      {viewType: 'picture-in-picture' as const},
    ]) {
      const {registry, sender, registration} = fixture();
      registry.unregister(sender.id);
      const owner = registry.register({...registration, ...override});
      let prompts = 0;
      const policy = new AccountPermissionPolicy(registry, owner, {
        canPrompt: () => true,
        ask: async () => {
          prompts++;
          return true;
        },
      });
      assert.equal(await policy.request(sender, 'notifications', details), false);
      assert.equal(policy.check(sender, 'notifications', origin, details), false);
      assert.equal(prompts, 0);
    }
  });

  it('revokes cached grants when the real sender changes session or frame or loses registration', async () => {
    for (const change of ['session', 'frame', 'unregister'] as const) {
      const {policy, sender, registry} = fixture();
      assert.equal(await policy.request(sender, 'notifications', details), true);
      if (change === 'session') {
        sender.session = {};
      } else if (change === 'frame') {
        sender.mainFrame = {url: `${origin}/replacement`};
      } else {
        registry.unregister(sender.id);
      }
      assert.equal(policy.check(sender, 'notifications', origin, details), false);
      assert.equal(await policy.request(sender, 'notifications', details), false);
    }
  });

  it('denies subframes, missing frame metadata and foreign or malformed origins even after consent', async () => {
    const {policy, sender, prompts} = fixture();
    assert.equal(await policy.request(sender, 'notifications', details), true);
    for (const invalid of [
      {...details, isMainFrame: false},
      {...details, isMainFrame: undefined},
      {...details, requestingUrl: 'https://evil.wire.test/'},
      {...details, requestingUrl: 'file:///fixture'},
      {...details, securityOrigin: 'https://evil.wire.test/'},
    ]) {
      assert.equal(await policy.request(sender, 'notifications', invalid), false);
      assert.equal(policy.check(sender, 'notifications', origin, invalid), false);
    }
    assert.equal(await policy.request(sender, 'notifications', {...details, requestingUrl: undefined}), false);
    assert.equal(policy.check(sender, 'notifications', 'https://evil.wire.test', details), false);
    assert.equal(prompts.length, 1);
  });

  it('does not prompt a background-ineligible account but permits its existing grant', async () => {
    const {policy, sender, consent, prompts} = fixture();
    consent.canPrompt = () => false;
    assert.equal(await policy.request(sender, 'notifications', details), false);
    assert.equal(prompts.length, 0);
    consent.canPrompt = () => true;
    assert.equal(await policy.request(sender, 'notifications', details), true);
    consent.canPrompt = () => false;
    assert.equal(await policy.request(sender, 'notifications', details), true);
    assert.equal(prompts.length, 1);
  });

  it('does not retain cancelled consent or convert a consent error into a grant', async () => {
    const {policy, sender, consent} = fixture();
    consent.ask = async () => false;
    assert.equal(await policy.request(sender, 'notifications', details), false);
    assert.equal(policy.check(sender, 'notifications', origin, details), false);
    consent.ask = async () => {
      throw new Error('Fixture consent failure');
    };
    await assert.rejects(policy.request(sender, 'notifications', details), /Fixture consent failure/);
    assert.equal(policy.check(sender, 'notifications', origin, details), false);
    consent.ask = async () => true;
    assert.equal(await policy.request(sender, 'notifications', details), true);
  });

  it('bounds concurrent consent and invalidates an outstanding answer on document revocation', async () => {
    const {policy, sender, consent} = fixture();
    let answer!: (value: boolean) => void;
    consent.ask = () =>
      new Promise(resolve => {
        answer = resolve;
      });
    const pending = policy.request(sender, 'notifications', details);
    assert.equal(await policy.request(sender, 'notifications', details), false);
    policy.revoke();
    answer(true);
    assert.equal(await pending, false);
    assert.equal(policy.check(sender, 'notifications', origin, details), false);
    consent.ask = async () => true;
    assert.equal(await policy.request(sender, 'notifications', details), true);
    policy.revoke();
    assert.equal(policy.check(sender, 'notifications', origin, details), false);
  });

  it('rechecks registration and eligibility after asynchronous consent', async () => {
    for (const change of ['registration', 'eligibility', 'origin', 'destroyed'] as const) {
      const {policy, sender, consent, registry, registration} = fixture();
      consent.ask = async () => {
        if (change === 'registration') {
          registry.unregister(sender.id);
          registry.register(registration);
        } else if (change === 'eligibility') {
          consent.canPrompt = () => false;
        } else if (change === 'origin') {
          sender.mainFrame.url = 'https://evil.wire.test/';
        } else {
          sender.isDestroyed = () => true;
        }
        return true;
      };
      assert.equal(await policy.request(sender, 'notifications', details), false);
      assert.equal(policy.check(sender, 'notifications', origin, details), false);
    }
  });
});
