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

import fs from 'fs-extra';

import path from 'path';

const assets = [
  'wire.json',
  'renderer/index.html',
  'renderer/dist/bundle.js',
  'renderer/dist/bundle.js.LICENSE.txt',
  'html/about.html',
  'html/proxy-prompt.html',
  'html/display-capture.html',
  'css/about.css',
  'css/proxy-prompt.css',
  'css/display-capture.css',
  'css/wrapper.css',
];
const parents = new Set(
  assets.flatMap(file => {
    const result: string[] = [];
    let parent = path.posix.dirname(file);
    while (parent !== '.') {
      result.push(parent);
      parent = path.posix.dirname(parent);
    }
    return result;
  }),
);

function applicationDirectory(value: string): string {
  const directory = value.replace(/\\/g, '/').replace(/\/$/, '');
  // Relative literal directories only: glob syntax could expand an allowlist.
  if (
    !directory ||
    directory
      .split('/')
      .some(part => !part || /[\x00-\x1f\x7f:*?"<>|[\]{}()!]/.test(part) || part === '.' || part === '..')
  ) {
    throw new Error('Invalid application directory for packaging.');
  }
  return directory;
}

export function createPackageIgnore(root: string, electronDirectory: string): (file: string) => boolean {
  const directory = applicationDirectory(electronDirectory);
  return file => {
    const relative = file.replace(/^\//, '');
    if (!relative) {
      return false;
    }
    if (relative.split('/').some(part => ['.', '..', '.git', '.bin', 'node_gyp_bins'].includes(part))) {
      return true;
    }
    if (relative === 'node_modules' || relative.startsWith('node_modules/')) {
      return /\.(?:o|obj)$/.test(relative);
    }
    const isDirectory = fs.statSync(path.join(root, relative)).isDirectory();
    if (relative === 'package.json' || relative === 'LICENSE') {
      return isDirectory;
    }
    if (relative === directory || directory.startsWith(`${relative}/`)) {
      return !isDirectory;
    }
    if (!relative.startsWith(`${directory}/`)) {
      return true;
    }
    const appFile = relative.slice(directory.length + 1);
    if (isDirectory) {
      return !(
        parents.has(appFile) ||
        appFile === 'dist' ||
        appFile.startsWith('dist/') ||
        appFile === 'img' ||
        appFile.startsWith('img/')
      );
    }
    if (assets.includes(appFile)) {
      return false;
    }
    if (appFile.startsWith('img/')) {
      return !/\.(?:png|ico|icns|svg)$/.test(appFile);
    }
    if (
      !appFile.startsWith('dist/') ||
      /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)|\.(?:test|spec)(?:\.|$)/.test(appFile)
    ) {
      return true;
    }
    return !(
      /\.(?:js|mjs|cjs)$/.test(appFile) ||
      /^dist\/locale\/[a-z]{2}-[A-Z]{2}\.json$/.test(appFile) ||
      /\.LICENSE\.txt$/.test(appFile)
    );
  };
}

export function packageFilePatterns(electronDirectory: string): string[] {
  const directory = applicationDirectory(electronDirectory);
  return [
    'package.json',
    'LICENSE',
    ...assets.map(file => `${directory}/${file}`),
    `${directory}/dist/**/*.{js,mjs,cjs}`,
    `${directory}/dist/locale/[a-z][a-z]-[A-Z][A-Z].json`,
    `${directory}/dist/**/*.LICENSE.txt`,
    `${directory}/img/**/*.{png,ico,icns,svg}`,
    `!${directory}/dist/**/{test,tests,fixtures}{,/**/*}`,
    `!${directory}/dist/**/*.{test,spec}{,.*}`,
    '!**/.git{,/**/*}',
    '!**/.bin{,/**/*}',
    '!**/node_gyp_bins{,/**/*}',
    '!**/*.{o,obj}',
  ];
}
