import dedent from "dedent";
import type { UnpluginBuildContext, UnpluginContext } from "unplugin";
import { describe, expect, test } from "vite-plus/test";

import type { LinguiMacroPluginOptions } from "../types.ts";
import { unpluginFactory } from "./plugin.ts";

async function runTransform(
  code: string,
  id: string,
  options?: LinguiMacroPluginOptions,
) {
  const plugin = unpluginFactory(options, { framework: "vite" });
  const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
  const transform = pluginInstance?.transform;
  const runTransform =
    typeof transform === "function" ? transform : transform?.handler;

  return runTransform?.call(createUnpluginContext(), code, id);
}

function getCode(result: Awaited<ReturnType<typeof runTransform>>) {
  if (!result || typeof result === "string") {
    return "";
  }

  return result.code;
}

describe("unplugin-lingui-macro", () => {
  test("transforms plain TypeScript descriptors imported from @lingui/core/macro", async () => {
    const result = await runTransform(
      dedent`
        import { msg } from "@lingui/core/macro";

        export const descriptor = msg\`Hello from plain TypeScript.\`;
      `,
      "/virtual/shared-descriptor.ts",
      {
        config: {
          locales: ["en"],
        },
      },
    );

    expect(result).not.toBeNull();
    expect(getCode(result)).toContain('id: "');
    expect(getCode(result)).not.toContain("@lingui/core/macro");
  });

  test("keeps descriptor messages in non-production transforms", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      const result = await runTransform(
        dedent`
          import { msg } from "@lingui/core/macro";

          export const descriptor = msg\`Hello from development.\`;
        `,
        "/virtual/development-descriptor.ts",
        {
          config: {
            locales: ["en"],
          },
        },
      );

      expect(getCode(result)).toContain('message: "Hello from development."');
    } finally {
      if (previousNodeEnv == null) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test("omits descriptor messages in production transforms", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const result = await runTransform(
        dedent`
          import { msg } from "@lingui/core/macro";

          export const descriptor = msg\`Hello from production.\`;
        `,
        "/virtual/production-descriptor.ts",
        {
          config: {
            locales: ["en"],
          },
        },
      );

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(getCode(result)).not.toBe("");
      expect(getCode(result)).not.toContain("Hello from production.");
    } finally {
      if (previousNodeEnv == null) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test("transforms React macros when a file imports @lingui/react/macro", async () => {
    const result = await runTransform(
      dedent`
        import { Trans } from "@lingui/react/macro";

        export function Demo() {
          return <Trans>Hello from React.</Trans>;
        }
      `,
      "/virtual/Demo.tsx",
      {
        config: {
          locales: ["en"],
        },
      },
    );

    expect(result).not.toBeNull();
    expect(getCode(result)).not.toContain("@lingui/react/macro");
    expect(getCode(result)).toContain("@lingui/react");
  });

  test("honors custom Lingui macro package names from config", async () => {
    const result = await runTransform(
      dedent`
        import { msg } from "@acme/lingui-core";

        export const descriptor = msg\`Hello from a custom macro package.\`;
      `,
      "/virtual/custom-macro.ts",
      {
        config: {
          locales: ["en"],
          macro: {
            corePackage: ["@acme/lingui-core"],
          },
        },
      },
    );

    expect(result).not.toBeNull();
    expect(getCode(result)).toContain('id: "');
    expect(getCode(result)).not.toContain("@acme/lingui-core");
  });

  test("throws when no Lingui config file is found", async () => {
    await expect(
      runTransform(
        dedent`
          import { msg } from "@lingui/core/macro";

          export const descriptor = msg\`Hello\`;
        `,
        "/virtual/missing-config.ts",
      ),
    ).rejects.toThrow(
      "unplugin-lingui-macro could not resolve a Lingui config.",
    );
  });
});

function createUnpluginContext(): UnpluginBuildContext & UnpluginContext {
  return {} as UnpluginBuildContext & UnpluginContext;
}
