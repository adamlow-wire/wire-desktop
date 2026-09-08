/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

import * as Electron from 'electron';

import {LANGUAGES, SUPPORTED_LANGUAGES, i18nLanguageIdentifier, SupportedI18nLanguage} from './languages';
import {resolveSystemLocale} from './systemLocale';

import {readRendererLocale} from '../runtime/rendererRuntimeArguments';
import {config} from '../settings/config';
import {settings} from '../settings/ConfigurationPersistence';
import {SettingsType} from '../settings/SettingsType';

export {LANGUAGES, SUPPORTED_LANGUAGES} from './languages';
export type {
  i18nLanguageIdentifier,
  i18nStrings,
  SupportedI18nLanguage,
  SupportedI18nLanguageObject,
} from './languages';

const parseLocale = (locale: string): SupportedI18nLanguage => {
  const languageKeys = Object.keys(SUPPORTED_LANGUAGES) as SupportedI18nLanguage[];
  return languageKeys.find(languageKey => languageKey === locale) || languageKeys[0];
};

const getSystemLocale = (): SupportedI18nLanguage => {
  const systemLocale = resolveSystemLocale(
    Electron.app?.getLocale(),
    readRendererLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale,
  );
  return parseLocale(systemLocale.substring(0, 2));
};

export const supportedSpellCheckLanguages: Record<SupportedI18nLanguage, string[]> = {
  cs: ['cs', 'cs-CZ'],
  da: ['da', 'da-DK'],
  de: ['de', 'de-DE'],
  el: ['el', 'el-GR'],
  en: ['en', 'en-US'],
  es: ['es', 'es-ES'],
  et: ['et', 'et-EE'],
  fi: ['fi', 'fi-FI'],
  fr: ['fr', 'fr-FR'],
  hr: ['hr', 'hr-HR'],
  hu: ['hu', 'hu-HU'],
  it: ['it', 'it-IT'],
  lt: ['lt', 'lt-LT'],
  nl: ['nl', 'nl-NL'],
  pl: ['pl', 'pl-PL'],
  pt: ['pt', 'pt-BR'],
  ro: ['ro', 'ro-RO'],
  ru: ['ru', 'ru-RU'],
  si: ['si', 'si-LK'],
  sk: ['sk', 'sk-SK'],
  sl: ['sl', 'sl-SI'],
  tr: ['tr', 'tr-TR'],
  uk: ['uk', 'uk-UA'],
  zh: ['zh', 'zh-CN'],
};

let current: SupportedI18nLanguage | undefined;

export const getCurrent = (): SupportedI18nLanguage => {
  const systemLocale = getSystemLocale();

  if (!current) {
    const savedLocale = settings.restore<SupportedI18nLanguage | undefined>(SettingsType.LOCALE);
    const savedOverride = settings.restore<boolean | undefined>(SettingsType.LOCALE_OVERRIDE);
    const hasUserOverride =
      typeof savedOverride === 'boolean' ? savedOverride : Boolean(savedLocale && savedLocale !== systemLocale);

    current = savedLocale && hasUserOverride ? parseLocale(savedLocale) : systemLocale;
    return current;
  }

  // If there’s no override and the system locale changed, update the cache
  const hasOverride = settings.restore<boolean | undefined>(SettingsType.LOCALE_OVERRIDE) === true;
  if (!hasOverride && current !== systemLocale) {
    current = systemLocale;
  }
  return current;
};

const customReplacements: Record<string, string> = {
  brandName: config.name,
};

export const getText = (
  stringIdentifier: i18nLanguageIdentifier,
  paramReplacements?: Record<string, string>,
): string => {
  const strings = getCurrent();
  let translationText = LANGUAGES[strings][stringIdentifier] || LANGUAGES.en[stringIdentifier];

  if (!translationText) {
    throw new Error(`Translation for "${stringIdentifier}" could not be found.`);
  }

  const replacements: Record<string, string> = {...customReplacements, ...paramReplacements};
  for (const replacement of Object.keys(replacements)) {
    const regex = new RegExp(`{${replacement}}`, 'g');
    if (translationText.match(regex)) {
      translationText = translationText.replace(regex, replacements[replacement]);
    }
  }

  return translationText;
};

export const setLocale = (locale: string): void => {
  current = parseLocale(locale);

  const systemLocale = getSystemLocale();
  const isOverride = current !== systemLocale;

  if (isOverride) {
    settings.save(SettingsType.LOCALE_OVERRIDE, true);
    settings.save(SettingsType.LOCALE, current);
  } else {
    settings.delete(SettingsType.LOCALE_OVERRIDE);
    settings.delete(SettingsType.LOCALE);
  }
};
