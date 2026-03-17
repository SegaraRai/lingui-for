import { svelteExtractor } from "lingui-for-svelte/extractor";

export default {
  locales: ["en", "ja"],
  sourceLocale: "en",
  fallbackLocales: {
    default: "en",
  },
  compileNamespace: "ts",
  catalogs: [
    {
      path: "src/i18n/locales/{locale}",
      include: ["src"],
      exclude: ["src/i18n/locales/**"],
    },
  ],
  extractors: [svelteExtractor],
};
