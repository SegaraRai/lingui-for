import { test } from "vite-plus/test";

import { defineConfig } from "./config.ts";

defineConfig({
  locales: ["en"],
  framework: {
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "auto",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error svelte config should not exist unless svelte's augmentation is imported too.
    svelte: {},
  },
});

test("config type assertions compile", () => {});
