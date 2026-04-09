import { defineConfig } from "./config.ts";

defineConfig({
  locales: ["en"],
  framework: {
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "auto",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error astro config should not exist unless astro's augmentation is imported too.
    astro: {},
  },
});
