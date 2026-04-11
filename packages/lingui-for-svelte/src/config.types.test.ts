import { test } from "vite-plus/test";

import { defineConfig } from "./config.ts";

defineConfig({
  locales: ["en"],
  framework: {
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "svelte",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    svelte: {
      // @ts-expect-error svelte config should not accept astro whitespace
      whitespace: "astro",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    svelte: {
      // @ts-expect-error auto is no longer a public whitespace mode
      whitespace: "auto",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error svelte config should not accept astro settings
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "astro",
    },
  },
});

test("config type assertions compile", () => {});
