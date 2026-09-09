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

/* eslint-disable no-eval, no-new-func -- intentional constant-code CSP denial probes */
const probes = {
  eval: () => eval('1 + 1'),
  function: () => new Function('return 2')(),
};
const results = {};
for (const [name, probe] of Object.entries(probes)) {
  try {
    probe();
    results[name] = 'allowed';
  } catch (error) {
    results[name] = error.name;
  }
}
document.documentElement.setAttribute('data-csp-probe', JSON.stringify(results));
