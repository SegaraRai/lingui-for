import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import type { LinguiMacroPluginOptions } from "../types.ts";
import { unpluginFactory } from "./plugin.ts";

async function runTransform(
  code: string,
  id: string,
  options?: LinguiMacroPluginOptions,
) {
  const plugin = unpluginFactory(options, { framework: "vite" } as never);
  const pluginInstance = Array.isArray(plugin) ? plugin[0] : plugin;
  const transform = pluginInstance?.transform;
  const runTransform =
    typeof transform === "function" ? transform : transform?.handler;

  return runTransform?.call({} as never, code, id);
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
    );

    expect(result).not.toBeNull();
    expect(getCode(result)).toContain('id: "');
    expect(getCode(result)).not.toContain("@lingui/core/macro");
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
        linguiConfig: {
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
});
