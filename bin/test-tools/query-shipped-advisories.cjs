#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');

const endpoint = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const [permission, inventoryArg, matchesArg] = process.argv.slice(2);
if (permission !== '--allow-public-npm-metadata-query' || !inventoryArg || !matchesArg) {
  console.error('Usage: node bin/test-tools/query-shipped-advisories.cjs --allow-public-npm-metadata-query <private-inventory.json> <private-matches.json>');
  process.exit(2);
}
const packages = JSON.parse(fs.readFileSync(inventoryArg, 'utf8'));
if (!Array.isArray(packages) || packages.length === 0) throw new Error('Empty shipped package inventory.');
const versions = new Map();
for (const item of packages) {
  if (typeof item.name !== 'string' || !semver.valid(item.version)) throw new Error('Invalid shipped package record.');
  if (!versions.has(item.name)) versions.set(item.name, new Set());
  versions.get(item.name).add(item.version);
}
const request = Object.fromEntries([...versions].map(([name, values]) => [name, [...values].sort()]));

async function main() {
  // This deliberately sends package names and versions to the public npm registry.
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error('npm advisory endpoint rejected the request.');
  const advisories = await response.json();
  const matches = [];
  for (const [name, records] of Object.entries(advisories)) {
    for (const advisory of records) {
      for (const version of request[name] ?? []) {
        if (semver.satisfies(version, advisory.vulnerable_versions, {includePrerelease: true})) {
          matches.push({name, version, id: advisory.id, severity: advisory.severity,
            vulnerableVersions: advisory.vulnerable_versions, url: advisory.url});
        }
      }
    }
  }
  const output = path.resolve(matchesArg);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(matches, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({endpoint, checkedAt: new Date().toISOString(),
    packageInstances: packages.length, distinctNames: versions.size,
    matchesBySeverity: matches.reduce((counts, match) => {
      counts[match.severity] = (counts[match.severity] ?? 0) + 1;
      return counts;
    }, {}), output}));
}
main().catch(() => {
  console.error('Shipped advisory query failed.');
  process.exitCode = 1;
});
