import { setupI18n } from "@lingui/core";
import { msg } from "lingui-for-svelte/macro";

import { catalogs, type SupportedLocale } from "./catalogs";

export type { SupportedLocale } from "./catalogs";

export const supportedLocales = Object.keys(
  catalogs,
) as readonly SupportedLocale[];

export const appI18n = setupI18n();

export const localeState = $state({
  current: "en" as SupportedLocale,
});

let initialized = false;

export function ensureLocale(
  locale: SupportedLocale = localeState.current,
): void {
  if (!initialized || localeState.current !== locale) {
    activateLocale(locale);
  }
}

export function activateLocale(locale: SupportedLocale): void {
  localeState.current = locale;
  appI18n.loadAndActivate({
    locale,
    messages: catalogs[locale],
  });
  initialized = true;
}

// `$t(...)` cannot be used in `.svelte.ts` modules because store auto-subscriptions
// are only available inside `.svelte` component files.
export const stateTaggedDescriptor = msg`Tagged template descriptor from .svelte.ts state.`;

export const playgroundState = $state({
  name: "SvelteKit",
  count: 2,
});

export function incrementPlayground(): void {
  playgroundState.count += 1;
}

export function decrementPlayground(): void {
  playgroundState.count = Math.max(0, playgroundState.count - 1);
}

export function setPlaygroundName(name: string): void {
  playgroundState.name = name;
}
