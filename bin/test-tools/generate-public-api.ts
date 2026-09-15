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

import {generateSource} from 'oazapfts';
import {format, resolveConfig} from 'prettier';

import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import {tmpdir} from 'os';
import * as path from 'path';

const BINARY_REQUEST_SCHEMAS = ['AssetSource', 'QualifiedNewOtrMessage', 'CommitBundle', 'MLSMessage'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizePublicApiBinarySchemas(input: unknown): Record<string, unknown> {
  if (!isRecord(input) || !isRecord(input.components) || !isRecord(input.components.schemas)) {
    throw new Error('Public API schema has no component schemas.');
  }
  const schemas = {...input.components.schemas};
  for (const name of BINARY_REQUEST_SCHEMAS) {
    const schema = schemas[name];
    if (
      !isRecord(schema) ||
      ['properties', 'items', 'allOf', 'anyOf', 'oneOf', 'enum', '$ref'].some(key => key in schema) ||
      !(
        (schema.type === undefined && schema.format === undefined) ||
        (schema.type === 'string' && schema.format === 'binary')
      )
    ) {
      throw new Error(`Binary request schema changed and requires review: ${name}`);
    }
    schemas[name] = {...schema, type: 'string', format: 'binary'};
  }
  return {...input, components: {...input.components, schemas}};
}

export async function generatePublicApi(inputFile: string, outputFile: string): Promise<void> {
  const input: unknown = JSON.parse(await readFile(inputFile, 'utf8'));
  const normalized = normalizePublicApiBinarySchemas(input);
  // The installed generator accepts a schema filename, not serialized JSON.
  const directory = await mkdtemp(path.join(tmpdir(), 'wire-public-api-'));
  let source: string;
  try {
    const schemaFile = path.join(directory, 'schema.json');
    await writeFile(schemaFile, JSON.stringify(normalized));
    source = await generateSource(schemaFile, {
      argumentStyle: 'object',
      useUnknown: true,
      futureStripLegacyMethods: true,
    });
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
  const configuration = await resolveConfig(path.resolve(outputFile));
  if (!configuration) {
    throw new Error('Repository formatting configuration is unavailable.');
  }
  await writeFile(outputFile, format(source, {...configuration, parser: 'typescript'}));
}

if (require.main === module) {
  const [inputFile, outputFile, extra] = process.argv.slice(2);
  if (!inputFile || !outputFile || extra !== undefined) {
    throw new Error('Usage: generate-public-api.ts INPUT_SCHEMA.json OUTPUT_CLIENT.ts');
  }
  void generatePublicApi(inputFile, outputFile).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
