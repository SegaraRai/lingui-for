import { defineConfig } from "tsdown";
import markupImport from "unplugin-markup-import/rolldown";

export default defineConfig({
  clean: true,
  dts: true,
  tsconfig: "tsconfig.lib.json",
  entry: {
    "extractor/index": "src/extractor/index.ts",
    "macro/index": "src/macro/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "integration/index": "src/integration/index.ts",
    "mdx/extractor": "src/mdx/extractor.ts",
    "mdx/unplugin/index": "src/mdx/unplugin/index.ts",
    "mdx/unplugin/types": "src/mdx/unplugin/types.ts",
    "mdx/unplugin/bun": "src/mdx/unplugin/bun.ts",
    "mdx/unplugin/esbuild": "src/mdx/unplugin/esbuild.ts",
    "mdx/unplugin/rolldown": "src/mdx/unplugin/rolldown.ts",
    "mdx/unplugin/rollup": "src/mdx/unplugin/rollup.ts",
    "mdx/unplugin/rspack": "src/mdx/unplugin/rspack.ts",
    "mdx/unplugin/vite": "src/mdx/unplugin/vite.ts",
    "mdx/unplugin/webpack": "src/mdx/unplugin/webpack.ts",
    "unplugin/index": "src/unplugin/index.ts",
    "unplugin/types": "src/unplugin/types.ts",
    "unplugin/bun": "src/unplugin/bun.ts",
    "unplugin/esbuild": "src/unplugin/esbuild.ts",
    "unplugin/rolldown": "src/unplugin/rolldown.ts",
    "unplugin/rollup": "src/unplugin/rollup.ts",
    "unplugin/rspack": "src/unplugin/rspack.ts",
    "unplugin/vite": "src/unplugin/vite.ts",
    "unplugin/webpack": "src/unplugin/webpack.ts",
  },
  plugins: [markupImport({ frameworks: ["astro"] })],
});
