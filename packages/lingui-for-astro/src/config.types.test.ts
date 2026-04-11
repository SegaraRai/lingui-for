import { test } from "vite-plus/test";

import { defineConfig } from "./config.ts";

defineConfig({
  locales: ["en"],
  framework: {
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "astro",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    astro: {
      // @ts-expect-error astro config should not accept svelte whitespace
      whitespace: "svelte",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    astro: {
      // @ts-expect-error auto is no longer a public whitespace mode
      whitespace: "auto",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error astro config should not accept svelte settings
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "svelte",
    },
  },
});

test("config type assertions compile", () => {});
