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

import {resolveConfig} from 'prettier';

import {strict as assert} from 'assert';
import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import {tmpdir} from 'os';
import * as path from 'path';

import {generatePublicApi, normalizePublicApiBinarySchemas} from './generate-public-api';

const names = ['AssetSource', 'QualifiedNewOtrMessage', 'CommitBundle', 'MLSMessage'];
const fixture = (): {openapi: string; components: {schemas: Record<string, Record<string, unknown>>}} => ({
  openapi: '3.0.0',
  components: {
    schemas: {...Object.fromEntries(names.map(name => [name, {description: name}])), Unrelated: {type: 'object'}},
  },
});

describe('public API binary request schema normalization', () => {
  it('preserves source metadata and unrelated schemas without mutating the downloaded document', () => {
    const input = fixture();
    const original = JSON.parse(JSON.stringify(input));
    const normalized = normalizePublicApiBinarySchemas(input) as ReturnType<typeof fixture>;
    assert.deepEqual(input, original);
    assert.deepEqual(normalized.components.schemas.Unrelated, input.components.schemas.Unrelated);
    for (const name of names) {
      assert.deepEqual(normalized.components.schemas[name], {description: name, type: 'string', format: 'binary'});
    }
    assert.deepEqual(normalizePublicApiBinarySchemas(normalized), normalized);
  });

  for (const invalid of [null, {}, {components: []}, {components: {schemas: {}}}]) {
    it('rejects an unavailable or incomplete component schema', () => {
      assert.throws(() => normalizePublicApiBinarySchemas(invalid));
    });
  }

  for (const changed of [
    {type: 'object'},
    {type: 'string'},
    {type: 'string', format: 'uuid'},
    {properties: {payload: {type: 'string'}}},
    {$ref: '#/components/schemas/Unrelated'},
    {oneOf: [{type: 'object'}]},
  ]) {
    it(`rejects upstream binary-schema drift before replacing ${JSON.stringify(changed)}`, () => {
      const input = fixture();
      Object.assign(input.components.schemas, {AssetSource: changed});
      assert.throws(() => normalizePublicApiBinarySchemas(input), /requires review: AssetSource/);
    });
  }
});

describe('public API client generation', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'wire-codegen-test-'));
    const prettier = await resolveConfig(path.resolve('package.json'));
    assert.ok(prettier);
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({private: true, prettier}));
  });
  afterEach(async () => {
    await rm(directory, {recursive: true, force: true});
  });

  it('generates the four binary aliases through the installed generator without changing the source schema', async () => {
    const input = path.join(directory, 'input.json');
    const output = path.join(directory, 'client.ts');
    const paths = Object.fromEntries(
      names.map(name => [
        `/${name}`,
        {
          post: {
            operationId: `send${name}`,
            requestBody: {
              required: true,
              content: {'application/octet-stream': {schema: {$ref: `#/components/schemas/${name}`}}},
            },
            responses: {'200': {description: 'Accepted'}},
          },
        },
      ]),
    );
    const schema = JSON.stringify({...fixture(), info: {title: 'Owned fixture', version: '1'}, paths});
    await writeFile(input, schema);
    await generatePublicApi(input, output);
    const code = await readFile(output, 'utf8');
    // The generator normalizes the acronym in MLSMessage to MlsMessage.
    for (const name of ['AssetSource', 'QualifiedNewOtrMessage', 'CommitBundle', 'MlsMessage']) {
      assert.ok(code.includes(`export type ${name} = Blob;`), `${name} must accept a binary request body`);
    }
    assert.equal(await readFile(input, 'utf8'), schema);
  });

  it('preserves an existing client when schema validation fails', async () => {
    const input = path.join(directory, 'invalid.json');
    const output = path.join(directory, 'client.ts');
    await writeFile(input, '{}');
    await writeFile(output, 'existing client');
    await assert.rejects(generatePublicApi(input, output), /no component schemas/);
    assert.equal(await readFile(output, 'utf8'), 'existing client');
  });
});
