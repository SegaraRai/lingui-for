import { fileURLToPath } from "node:url";

import { getViteConfig } from "astro/config";
import { defineProject } from "vite-plus";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

export default getViteConfig(
  defineProject({
    resolve: {
      alias: {
        "@lingui-for/framework-core/compile/wasm-loader":
          "@lingui-for/framework-core/compile/wasm-loader-vite",
      },
    },
    test: {},
  }),
  {
    root: rootDir,
  },
);
