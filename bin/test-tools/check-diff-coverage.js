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
 */

const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANGED_LINE_THRESHOLD = 80;
const SECURITY_BRANCH_THRESHOLD = 90;
const COVERAGE_FILES = ['coverage/electron/coverage-final.json', 'coverage/renderer/coverage-final.json'];
const SOURCE_ROOTS = ['electron/src', 'electron/renderer/src'];
const SECURE_SHELL_POLICY = /^electron\/src\/secureShell\/(ViewIdentityRegistry|ipc|policy|protocol)\.ts$/;

const normalizePath = filePath => filePath.split(path.sep).join('/');

const resolveBase = () => {
  const configuredBase = process.env.DIFF_COVERAGE_BASE;
  if (configuredBase && !/^0+$/.test(configuredBase)) {
    return configuredBase;
  }

  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD^'], {stdio: 'ignore'});
    return 'HEAD^';
  } catch {
    return undefined;
  }
};

const readChangedLines = base => {
  const output = execFileSync(
    'git',
    ['diff', '--unified=0', '--diff-filter=ACMR', '--find-copies-harder', `${base}...HEAD`, '--', ...SOURCE_ROOTS],
    {encoding: 'utf8'},
  );
  const changed = new Map();
  let currentFile;

  for (const line of output.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = normalizePath(fileMatch[1]);
      if (!changed.has(currentFile)) {
        changed.set(currentFile, new Set());
      }
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!currentFile || !hunkMatch) {
      continue;
    }

    const start = Number(hunkMatch[1]);
    const count = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
    for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
      changed.get(currentFile).add(lineNumber);
    }
  }

  return changed;
};

const readCoverage = () => {
  const merged = new Map();
  for (const coverageFile of COVERAGE_FILES) {
    if (!fs.existsSync(coverageFile)) {
      throw new Error(`Required coverage report is missing: ${coverageFile}`);
    }
    const report = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
    for (const [absoluteFile, coverage] of Object.entries(report)) {
      merged.set(normalizePath(path.relative(process.cwd(), absoluteFile)), coverage);
    }
  }
  return merged;
};

const percentage = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

const main = () => {
  const base = resolveBase();
  if (!base) {
    console.info('Diff coverage skipped: this commit has no parent and no DIFF_COVERAGE_BASE was provided.');
    return;
  }

  const changed = readChangedLines(base);
  if (changed.size === 0) {
    console.info(`Diff coverage: no application TypeScript changed since ${base}.`);
    return;
  }

  const coverageByFile = readCoverage();
  const changedStatements = [];
  const changedSecurityBranches = [];

  for (const [file, lines] of changed) {
    if (!/\.tsx?$/.test(file) || /\.d\.ts$|\.test\.|\.spec\./.test(file)) {
      continue;
    }

    const coverage = coverageByFile.get(file);
    if (!coverage) {
      throw new Error(`Changed application file is absent from coverage: ${file}`);
    }

    for (const [id, location] of Object.entries(coverage.statementMap)) {
      if (lines.has(location.start.line)) {
        changedStatements.push({covered: coverage.s[id] > 0, file, line: location.start.line});
      }
    }

    if (file.startsWith('electron/src/security/') || SECURE_SHELL_POLICY.test(file)) {
      for (const [id, branch] of Object.entries(coverage.branchMap)) {
        if (!lines.has(branch.loc.start.line)) {
          continue;
        }
        for (const [index, count] of coverage.b[id].entries()) {
          changedSecurityBranches.push({covered: count > 0, file, line: branch.locations[index].start.line});
        }
      }
    }
  }

  const coveredStatements = changedStatements.filter(item => item.covered).length;
  const lineRate = percentage(coveredStatements, changedStatements.length);
  const coveredSecurityBranches = changedSecurityBranches.filter(item => item.covered).length;
  const securityBranchRate = percentage(coveredSecurityBranches, changedSecurityBranches.length);

  console.info(
    `Changed statements: ${coveredStatements}/${changedStatements.length} (${lineRate.toFixed(
      2,
    )}%, required ${CHANGED_LINE_THRESHOLD}%).`,
  );
  if (changedSecurityBranches.length > 0) {
    console.info(
      `Changed security branches: ${coveredSecurityBranches}/${
        changedSecurityBranches.length
      } (${securityBranchRate.toFixed(2)}%, required ${SECURITY_BRANCH_THRESHOLD}%).`,
    );
  }

  const failures = [];
  if (lineRate < CHANGED_LINE_THRESHOLD) {
    failures.push(...changedStatements.filter(item => !item.covered));
  }
  if (securityBranchRate < SECURITY_BRANCH_THRESHOLD) {
    failures.push(...changedSecurityBranches.filter(item => !item.covered));
  }
  if (failures.length > 0) {
    const uncovered = [...new Set(failures.map(item => `${item.file}:${item.line}`))].join('\n  ');
    throw new Error(`Diff coverage threshold not met. Uncovered locations:\n  ${uncovered}`);
  }
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
