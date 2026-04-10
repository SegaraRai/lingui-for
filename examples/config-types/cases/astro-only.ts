import { defineConfig } from "@lingui-for/framework-core/config";
import "lingui-for-astro/config";

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
    // @ts-expect-error astro-only config should not accept svelte settings
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "auto",
    },
  },
});
