import type { MessageDescriptor } from "lingui-svelte/runtime";
import { msg } from "lingui-svelte/macro";

export type RouteCardCopy = {
  href: string;
  eyebrow: MessageDescriptor;
  title: MessageDescriptor;
  body: MessageDescriptor;
};

export const appTitle = msg({
  id: "kit.app.title",
  message: "lingui-svelte SvelteKit example",
});

export const rawTaggedDescriptor = msg`Tagged template descriptor from raw TypeScript.`;

export const navHome = msg({
  id: "kit.nav.home",
  message: "Home",
});

export const navPlayground = msg({
  id: "kit.nav.playground",
  message: "Playground",
});

export const localeLabels = {
  en: msg({
    id: "kit.locale.en",
    message: "English",
  }),
  ja: msg({
    id: "kit.locale.ja",
    message: "Japanese",
  }),
} as const;

export const homeHero = {
  eyebrow: msg({
    id: "kit.home.eyebrow",
    message: "SvelteKit route",
  }),
  title: msg({
    id: "kit.home.title",
    message: "Lingui macros inside routes, components, and plain modules",
  }),
  body: msg({
    id: "kit.home.body",
    message:
      "This page mixes load functions, component props, raw TypeScript, and .svelte.ts state.",
  }),
};

export const routeCards: RouteCardCopy[] = [
  {
    href: "/",
    eyebrow: msg({
      id: "kit.card.route.eyebrow",
      message: "Route load",
    }),
    title: msg({
      id: "kit.card.route.title",
      message: "+page.ts returns message descriptors",
    }),
    body: msg({
      id: "kit.card.route.body",
      message:
        "The route serializes descriptors produced by lingui-svelte/macro and the page renders them with the runtime.",
    }),
  },
  {
    href: "/playground",
    eyebrow: msg({
      id: "kit.card.component.eyebrow",
      message: "Component",
    }),
    title: msg({
      id: "kit.card.component.title",
      message: "Reusable Svelte components stay thin",
    }),
    body: msg({
      id: "kit.card.component.body",
      message:
        "Components receive descriptors and call the runtime without duplicating extractor logic.",
    }),
  },
  {
    href: "/playground",
    eyebrow: msg({
      id: "kit.card.module.eyebrow",
      message: "Raw .ts",
    }),
    title: msg({
      id: "kit.card.module.title",
      message: "Plain TypeScript can define shared copy",
    }),
    body: msg({
      id: "kit.card.module.body",
      message:
        "Regular modules export descriptors and helper metadata for routes and components.",
    }),
  },
];

export const playgroundCopy = {
  eyebrow: msg({
    id: "kit.playground.eyebrow",
    message: ".svelte.ts state",
  }),
  title: msg({
    id: "kit.playground.title",
    message: "Reactive state from a .svelte.ts module",
  }),
  body: msg({
    id: "kit.playground.body",
    message:
      "This route uses a rune-backed module to hold client state and translate summaries through Lingui.",
  }),
  helper: msg({
    id: "kit.playground.helper",
    message:
      "The summary above comes from a .svelte.ts file, not directly from the component.",
  }),
  routeLink: msg({
    id: "kit.playground.routeLink",
    message: "Open the playground route",
  }),
  fieldName: msg({
    id: "kit.playground.field.name",
    message: "Name",
  }),
  fieldCount: msg({
    id: "kit.playground.field.count",
    message: "Count",
  }),
  increment: msg({
    id: "kit.playground.increment",
    message: "Add",
  }),
  decrement: msg({
    id: "kit.playground.decrement",
    message: "Remove",
  }),
  summary: msg({
    id: "kit.playground.summary",
    message:
      "{count, plural, one {# queued action for {name}} other {# queued actions for {name}}}",
  }),
  rawTagged: rawTaggedDescriptor,
};
