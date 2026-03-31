import { defineProject } from "vite-plus";

export default defineProject({
  test: {
    fileParallelism: false,
    retry: 2,
  },
});
