import { defineConfig } from "@lingui-for/framework-core/config";

defineConfig({
  locales: ["en"],
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error no framework imports means framework config is unavailable
    astro: {},
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    // @ts-expect-error no framework imports means framework config is unavailable
    svelte: {},
  },
});
