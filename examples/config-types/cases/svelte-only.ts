import { defineConfig } from "@lingui-for/framework-core/config";
import "lingui-for-svelte/config";

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
      // @ts-expect-error svelte-only config should not accept astro whitespace
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
    // @ts-expect-error svelte-only config should not accept astro settings
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "astro",
    },
  },
});
