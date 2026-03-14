import { msg } from "lingui-svelte/macro";
import {
  i18n,
  loadAndActivate,
  type MessageDescriptor,
} from "lingui-svelte/runtime";

import { catalogs, type SupportedLocale } from "./catalogs";
import { playgroundCopy } from "./messages";

export type { SupportedLocale } from "./catalogs";

export const supportedLocales = Object.keys(
  catalogs,
) as readonly SupportedLocale[];

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
  loadAndActivate({
    locale,
    messages: catalogs[locale],
  });
  initialized = true;
}

export function formatDescriptor(
  descriptor: MessageDescriptor,
  values?: Record<string, unknown>,
): string {
  localeState.current;

  return i18n._(
    descriptor.id,
    {
      ...descriptor.values,
      ...values,
    },
    {
      message: descriptor.message,
      comment: descriptor.comment,
    },
  );
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

export function getPlaygroundSummary(): string {
  return formatDescriptor(playgroundCopy.summary, {
    count: playgroundState.count,
    name: playgroundState.name,
  });
}

export function getPlaygroundGreeting(): string {
  return formatDescriptor(playgroundCopy.greeting, {
    name: playgroundState.name,
  });
}
