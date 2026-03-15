import { defineConfig } from "@lingui/conf";

import { astroExtractor, jstsExtractor } from "lingui-for-astro/extractor";
import { svelteExtractor } from "lingui-for-svelte/extractor";

export default defineConfig({
  locales: ["en", "ja"],
  sourceLocale: "en",
  fallbackLocales: {
    default: "en",
  },
  compileNamespace: "ts",
  catalogs: [
    {
      path: "src/lib/i18n/locales/{locale}",
      include: ["src/pages", "src/layouts", "src/components"],
      exclude: ["src/lib/i18n/locales/**"],
    },
  ],
  extractors: [astroExtractor, svelteExtractor, jstsExtractor],
});
