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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

const yaml = createRequire(path.resolve('package.json'))('js-yaml') as {load(source: string): unknown};

interface WorkflowStep {
  name?: string;
  run?: string;
  'timeout-minutes'?: number;
}

const workflow = yaml.load(fs.readFileSync(path.resolve('.github/workflows/build_test.yml'), 'utf8')) as {
  jobs: {build_test: {steps: WorkflowStep[]}};
};
const script = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).scripts.test as string;

describe('[TST-005] complete generic test gate', () => {
  it('runs every package test stage in order with a bounded and identifiable failure', () => {
    const steps = workflow.jobs.build_test.steps;
    const first = steps.findIndex(step => step.name === 'Use xvfb-run on Linux');
    const last = steps.findIndex(step => step.name === 'Collect coverage and enforce changed-code thresholds');
    assert.ok(first >= 0 && last > first);
    const actual = steps.slice(first + 1, last);
    const expected = script.split(' && ');
    assert.deepEqual(
      actual.map(step => step.run),
      expected,
      'CI must execute the complete package test script in order.',
    );
    for (const step of actual) {
      assert.ok(step.name && step.name !== 'Test', 'Every suite needs an identifiable CI phase.');
      assert.ok(
        Number.isInteger(step['timeout-minutes']) && step['timeout-minutes']! > 0 && step['timeout-minutes']! <= 15,
        `${step.name} must have a finite per-suite deadline.`,
      );
    }
    assert.ok(
      Number.isInteger(steps[last]['timeout-minutes']) && steps[last]['timeout-minutes']! <= 15,
      'Coverage collection also needs a finite deadline.',
    );
  });
});
