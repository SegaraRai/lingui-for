import { defineConfig } from "@lingui-for/framework-core/config";
import "lingui-for-svelte/config";

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
    // @ts-expect-error svelte-only config should not accept astro settings
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "auto",
    },
  },
});
