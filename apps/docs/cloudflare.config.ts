import { defineConfig } from "cf/config";

// GitHub Actions deploys the docs with `tools/sites`. Pushes to `stable` deploy production, and
// `main` and pull requests deploy named Previews on the Preview domain, such as
// `https://main.lingui-for-preview.roundtrip.dev/`.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "lingui-for-docs",
    compatibilityDate: "2026-11-13",
    workersDev: false,
    previewUrls: true,
    domains: [
      ...(isPreview ? [] : ["lingui-for.roundtrip.dev"]),
      {
        hostname: "lingui-for-preview.roundtrip.dev",
        production: false,
        previews: true,
      },
    ],
    assets: {
      htmlHandling: "drop-trailing-slash",
      notFoundHandling: "404-page",
    },
  },
}));
