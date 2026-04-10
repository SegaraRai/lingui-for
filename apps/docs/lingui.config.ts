import babelExtractor from "@lingui/cli/api/extractors/babel";

import { defineConfig } from "lingui-for-astro/config";
import { astroExtractor } from "lingui-for-astro/extractor";
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
      path: "src/i18n/locales/docs/{locale}",
      include: ["src"],
      exclude: ["src/demos/**/*.svelte", "src/i18n/locales/**"],
    },
    {
      path: "src/i18n/locales/demos/{locale}",
      include: ["src/demos/**/*.svelte"],
    },
  ],
  extractors: [astroExtractor(), svelteExtractor(), babelExtractor],
});
