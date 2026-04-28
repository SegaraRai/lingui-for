import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    clean: true,
    dts: true,
    entry: {
      index: "src/index.ts",
      types: "src/types.ts",
      rolldown: "src/rolldown.ts",
      rollup: "src/rollup.ts",
      vite: "src/vite.ts",
    },
    attw: {
      profile: "esm-only",
    },
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        cache: true,
        input: [{ auto: true }, "!**/.vite-temp/**", "!dist/**"],
        untrackedEnv: ["PATHEXT"],
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
