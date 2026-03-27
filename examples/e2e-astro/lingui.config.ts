import babelExtractor from "@lingui/cli/api/extractors/babel";
import { defineConfig } from "@lingui/conf";

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
      path: "src/lib/i18n/locales/{locale}",
      include: ["src"],
      exclude: ["src/lib/i18n/locales/**"],
    },
  ],
  extractors: [astroExtractor(), svelteExtractor(), babelExtractor],
});
