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

import cs from './cs-CZ.json';
import da from './da-DK.json';
import de from './de-DE.json';
import el from './el-GR.json';
import en from './en-US.json';
import es from './es-ES.json';
import et from './et-EE.json';
import fi from './fi-FI.json';
import fr from './fr-FR.json';
import hr from './hr-HR.json';
import hu from './hu-HU.json';
import it from './it-IT.json';
import lt from './lt-LT.json';
import nl from './nl-NL.json';
import pl from './pl-PL.json';
import pt from './pt-BR.json';
import ro from './ro-RO.json';
import ru from './ru-RU.json';
import si from './si-LK.json';
import sk from './sk-SK.json';
import sl from './sl-SI.json';
import tr from './tr-TR.json';
import uk from './uk-UA.json';
import zh from './zh-CN.json';

export type i18nLanguageIdentifier = keyof typeof en;
export type i18nStrings = Record<i18nLanguageIdentifier, string>;
export type SupportedI18nLanguage = keyof typeof SUPPORTED_LANGUAGES;
export type SupportedI18nLanguageObject = Record<SupportedI18nLanguage, i18nStrings>;

export const LANGUAGES: SupportedI18nLanguageObject = {
  cs,
  da,
  de,
  el,
  en,
  es,
  et,
  fi,
  fr,
  hr,
  hu,
  it,
  lt,
  nl,
  pl,
  pt,
  ro,
  ru,
  si,
  sk,
  sl,
  tr,
  uk,
  zh,
};

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  et: 'Eesti',
  es: 'Español',
  fr: 'Français',
  hr: 'Hrvatski',
  it: 'Italiano',
  lt: 'Lietuvos',
  hu: 'Magyar',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português do Brasil',
  ro: 'Română',
  ru: 'Русский',
  si: 'සිංහල',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  fi: 'Suomi',
  tr: 'Türkçe',
  uk: 'Українська',
  zh: '简体中文',
};
