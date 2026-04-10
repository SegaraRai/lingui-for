import { defineConfig } from "@lingui-for/framework-core/config";
import "lingui-for-astro/config";
import "lingui-for-svelte/extractor";

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
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "auto",
    },
  },
});
