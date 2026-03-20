import { defineConfig } from "vite-plus";

export default defineConfig({
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
