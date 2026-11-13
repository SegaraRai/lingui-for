import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    name: "tools-release",
    include: ["*.test.ts"],
  },
  run: {
    tasks: {
      check: {
        command: "vp check",
        cache: false,
      },
      test: {
        command: "vp test",
        cache: false,
      },
    },
  },
});
