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

import {expect, Page} from '@playwright/test';

import {User} from './createUser';

import {conversationsSidebar} from '../poms/webapp/conversationsSidebar.page';
import {LOGIN_TIMEOUT, loginPage} from '../poms/webapp/login.page';
import {ssoPage} from '../poms/webapp/sso.page';

const fillLoginCredentials = async (page: Page, user: User) => {
  await ssoPage(page).codeEmailInput.fill(user.email);
  await ssoPage(page).loginButton.click();

  await loginPage(page).passwordInput.fill(user.password);
  await loginPage(page).loginButton.click();
};

const accountIdFromUrl = (url: string) => new URL(url).searchParams.get('id');

const waitForAuthenticatedPage = async (
  loginPage: Page,
  user: User,
  accountId: string | null,
  pagesBeforeLogin: ReadonlySet<Page>,
  timeout: number,
) => {
  let authenticatedPage: Page | undefined;

  await expect
    .poll(
      async () => {
        const candidatePages = loginPage
          .context()
          .pages()
          .filter(
            page =>
              page === loginPage ||
              !pagesBeforeLogin.has(page) ||
              (accountId !== null && accountIdFromUrl(page.url()) === accountId),
          );

        for (const candidatePage of [...candidatePages].reverse()) {
          try {
            if (await conversationsSidebar(candidatePage).userAvatar.isVisible()) {
              authenticatedPage = candidatePage;
              return true;
            }
          } catch {
            // Electron can retire the login webview while its authenticated replacement is being created.
          }
        }

        return false;
      },
      {message: `Wait for ${user.initials}'s authenticated account page`, timeout},
    )
    .toBe(true);

  return authenticatedPage!;
};

/* Visit the sso page and execute the login for the user */
export const loginUser = async (page: Page, user: User, options?: {timeout?: number}) => {
  const accountId = accountIdFromUrl(page.url());
  const pagesBeforeLogin = new Set(page.context().pages());
  await fillLoginCredentials(page, user);
  return waitForAuthenticatedPage(page, user, accountId, pagesBeforeLogin, options?.timeout ?? LOGIN_TIMEOUT);
};

export const loginUserAfterDataCleanup = async (page: Page, user: User) => {
  const accountId = accountIdFromUrl(page.url());
  const pagesBeforeLogin = new Set(page.context().pages());
  await fillLoginCredentials(page, user);
  const historyConfirmButton = loginPage(page).historyConfirmButton;
  await historyConfirmButton.click();

  return waitForAuthenticatedPage(page, user, accountId, pagesBeforeLogin, LOGIN_TIMEOUT);
};
