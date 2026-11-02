// Translation for code that runs outside component setup: utils, composable stores,
// error mapping and event handlers that run after an await, where useI18n() and
// useNuxtApp() are unavailable. Components keep using useI18n() / $t.
// app/plugins/locale.ts binds the app's global composer before the first render.
// See docs/localization.md.
import type { Composer } from 'vue-i18n';

export const supportedLocales = ['en', 'es'] as const;
export type AppLocale = typeof supportedLocales[number];

let composer: Composer | null = null;

export function bindI18n(global: Composer) {
  composer = global;
}

/**
 * The global vue-i18n `t`. Reading it inside a computed or a template re-evaluates
 * on locale changes, because it reads the reactive locale. Before the plugin runs
 * (never in practice) it returns the key.
 */
export const translate = ((...args: unknown[]) => composer
  ? (composer.t as (...values: unknown[]) => string)(...args)
  : String(args[0])) as Composer['t'];

/** The active app locale (reactive inside computeds), for Intl formatters and collation. */
export function appLocale(): AppLocale {
  const value = composer?.locale.value;
  return (supportedLocales as readonly string[]).includes(value ?? '') ? value as AppLocale : 'en';
}

/** The first browser language the app supports, like the iOS per-app language fallback. */
export function browserLocale(): AppLocale {
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of languages) {
    const base = tag?.toLowerCase().split('-')[0];
    if ((supportedLocales as readonly string[]).includes(base ?? '')) return base as AppLocale;
  }
  return 'en';
}

/** Joins names as a localized list: "Ana, Bo and Cy" / "Ana, Bo y Cy". */
export function nameList(names: string[]) {
  return new Intl.ListFormat(appLocale(), { style: 'long', type: 'conjunction' }).format(names);
}
