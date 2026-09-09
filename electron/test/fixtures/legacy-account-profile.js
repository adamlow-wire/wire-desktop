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

const {app, BrowserWindow} = require('electron');

const path = require('path');

app.setPath('userData', process.argv[2]);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {contextIsolation: true, javascript: false, nodeIntegration: false, sandbox: true},
  });
  // Use the original file origin without running any current application/migration code.
  await window.loadFile(path.join(__dirname, '../../renderer/index.html'));
});
app.on('window-all-closed', () => app.quit());
