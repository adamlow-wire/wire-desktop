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

import * as ts from 'typescript';

import {strict as assert} from 'assert';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

export function loadProxySettingsApplication(logs: unknown[][]): (proxy: URL, contents: unknown) => Promise<void> {
  const filename = path.resolve('electron/src/mainProcess.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const initializers: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'applyProxySettings' && node.initializer) {
      initializers.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(initializers.length, 1, 'one actual production proxy application function');
  const compiled = ts.transpileModule(`const apply = ${initializers[0].getText(source)}; apply;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  return runInNewContext(compiled, {logger: {info: (...args: unknown[]) => logs.push(args)}});
}
