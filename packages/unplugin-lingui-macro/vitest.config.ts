import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    name: "unplugin-lingui-macro",
  },
});
