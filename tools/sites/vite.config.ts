import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    name: "tools-sites",
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
      "check:urls": {
        command: "node check-urls.ts",
        dependsOn: ["docs#build"],
        cache: {
          env: ["PUBLIC_SITE_URL"],
          input: [{ auto: true }, "../../apps/docs/dist/**"],
        },
      },
      prepare: {
        command: "node cloudflare.ts docs",
        dependsOn: ["docs#build"],
        cache: {
          env: ["SITE_DEPLOYMENT"],
          input: [
            { auto: true },
            "../../apps/docs/dist/**",
            "../../apps/docs/cloudflare.config.ts",
            { pattern: "!.deploy", base: "workspace" },
            { pattern: "!.deploy/**", base: "workspace" },
          ],
          output: ["../../.deploy/docs/**"],
        },
      },
      "check:production": {
        command: "node deploy.ts docs stable --dry-run",
        dependsOn: ["prepare"],
        cache: false,
      },
      deploy: {
        command: "node deploy.ts",
        cache: false,
      },
    },
  },
});
