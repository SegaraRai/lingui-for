import { wasm } from "rolldown-plugin-wasm";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    dts: {
      eager: true,
    },
    entry: {
      index: "src/index.ts",
      "compile/index": "src/compile/index.ts",
      "compile/wasm-loader": "src/compile/wasm-loader.ts",
      "compile/wasm-loader-vite": "src/compile/wasm-loader-vite.ts",
      config: "src/config.ts",
      "runtime/index": "src/runtime/index.ts",
      "vendor/babel-core": "src/vendor/babel-core.ts",
      "vendor/babel-types": "src/vendor/babel-types.ts",
    },
    plugins: [
      wasm({
        publicPath: "../",
      }),
    ],
    attw: {
      profile: "esm-only",
    },
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["lingui-for-workspace#build:wasm"],
        cache: true,
        input: [{ auto: true }, "!**/.vite-temp/**", "!dist/**"],
      },
      check: {
        command: "vp check",
        dependsOn: ["build"],
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: ["build"],
        cache: false,
      },
    },
  },
});
