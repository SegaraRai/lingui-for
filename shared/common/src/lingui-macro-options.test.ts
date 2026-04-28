import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  createLinguiMacroPluginOptions,
  resolveLinguiMacroPluginMajorVersion,
} from "./lingui-macro-options.ts";

function createFakeLinguiMacroPlugin(version: string): string {
  const root = mkdtempSync(join(tmpdir(), "lingui-macro-plugin-"));
  const dist = join(root, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.mjs"), "");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@lingui/babel-plugin-lingui-macro",
      version,
    }),
  );
  return pathToFileURL(join(dist, "index.mjs")).href;
}

describe("Lingui macro plugin options", () => {
  test("uses Lingui 5 options for extraction", () => {
    const pluginEntryUrl = createFakeLinguiMacroPlugin("5.9.5");

    expect(
      createLinguiMacroPluginOptions({
        extract: true,
        linguiConfig: { locales: ["en"] },
        pluginEntryUrl,
      }),
    ).toEqual({
      extract: true,
      linguiConfig: { locales: ["en"] },
    });
  });

  test("uses Lingui 5 default runtime stripping behavior for transforms", () => {
    const pluginEntryUrl = createFakeLinguiMacroPlugin("5.9.5");

    expect(
      createLinguiMacroPluginOptions({
        extract: false,
        linguiConfig: { locales: ["en"] },
        pluginEntryUrl,
      }),
    ).toEqual({
      linguiConfig: { locales: ["en"] },
    });
  });

  test("uses Lingui 6 descriptorFields for extraction and transforms", () => {
    const pluginEntryUrl = createFakeLinguiMacroPlugin("6.0.0");

    expect(
      createLinguiMacroPluginOptions({
        extract: true,
        linguiConfig: { locales: ["en"] },
        pluginEntryUrl,
      }),
    ).toEqual({
      descriptorFields: "all",
      linguiConfig: { locales: ["en"] },
    });

    expect(
      createLinguiMacroPluginOptions({
        extract: false,
        linguiConfig: { locales: ["en"] },
        pluginEntryUrl,
      }),
    ).toEqual({
      descriptorFields: "auto",
      linguiConfig: { locales: ["en"] },
    });
  });

  test("resolves the major version from the plugin entry point", () => {
    const pluginEntryUrl = createFakeLinguiMacroPlugin("6.0.0");

    expect(resolveLinguiMacroPluginMajorVersion(pluginEntryUrl)).toBe(6);
  });
});
