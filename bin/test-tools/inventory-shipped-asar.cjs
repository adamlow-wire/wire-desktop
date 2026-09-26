#!/usr/bin/env node
'use strict';

const asar = require('@electron/asar');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');

const [archiveArg, inventoryArg] = process.argv.slice(2);
if (!archiveArg || !inventoryArg) {
  console.error('Usage: node bin/test-tools/inventory-shipped-asar.cjs <app.asar> <private-inventory.json>');
  process.exit(2);
}
const archive = path.resolve(archiveArg);
const inventory = path.resolve(inventoryArg);
const packagePaths = asar.listPackage(archive)
  .map(entry => entry.replace(/^[/\\]/, '').replace(/\\/g, '/'))
  .filter(entry => /^node_modules\/(?:@[^/]+\/)?[^/]+\/(?:node_modules\/(?:@[^/]+\/)?[^/]+\/)*package\.json$/.test(entry));
const packages = packagePaths.map(entry => {
  const data = JSON.parse(asar.extractFile(archive, entry).toString('utf8'));
  if (typeof data.name !== 'string' || typeof data.version !== 'string' || !semver.valid(data.version)) {
    throw new Error(`Invalid installed package manifest at ${entry}`);
  }
  return {path: entry, name: data.name, version: data.version};
});
if (packages.length === 0 || new Set(packages.map(item => item.path)).size !== packages.length) {
  throw new Error('Shipped dependency inventory is empty or contains duplicate paths.');
}
fs.mkdirSync(path.dirname(inventory), {recursive: true});
fs.writeFileSync(inventory, JSON.stringify(packages, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify({
  archiveSha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  packageInstances: packages.length,
  distinctNames: new Set(packages.map(item => item.name)).size,
  inventory,
}));
