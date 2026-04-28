import babelExtractor from "@lingui/cli/api/extractors/babel";
import { defineConfig } from "@lingui/conf";

export default defineConfig({
  locales: ["en", "ja"],
  sourceLocale: "en",
  compileNamespace: "ts",
  catalogs: [
    {
      path: "src/i18n/locales/{locale}",
      include: ["src"],
      exclude: ["src/i18n/locales/**"],
    },
  ],
  extractors: [babelExtractor],
});
