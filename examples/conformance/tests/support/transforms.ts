import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import { unpluginFactory as astroUnpluginFactory } from "lingui-for-astro/unplugin";
import { unpluginFactory as svelteUnpluginFactory } from "lingui-for-svelte/unplugin";

const linguiConfig = {
  macro: {
    corePackage: ["@lingui/core/macro", "@lingui/macro"],
    jsxPackage: ["@lingui/react/macro", "@lingui/macro"],
  },
  runtimeConfigModule: {
    i18n: ["@lingui/core", "i18n"] as const,
    Trans: ["@lingui/react", "Trans"] as const,
  },
};

type FixtureWhitespace = "auto" | "jsx";

function transformOfficial(code: string, filename: string): string {
  const result = transformSync(code, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename,
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    },
    plugins: [[linguiMacroPlugin, { extract: false, linguiConfig }]],
  });
  if (!result?.code) {
    throw new Error(`Failed to transform ${filename}`);
  }

  return result.code;
}

type TransformResult = {
  code: string;
};

type TestTransformFactory = (options?: unknown) =>
  | {
      transform?: (code: string, id: string) => unknown;
    }
  | {
      transform?: {
        handler?: (code: string, id: string) => unknown;
      };
    };

async function runPluginTransform(
  factory: TestTransformFactory,
  options: unknown,
  code: string,
  id: string,
): Promise<string> {
  const plugin = factory(options as never);
  const transform =
    typeof plugin.transform === "function"
      ? plugin.transform
      : plugin.transform?.handler;

  if (!transform) {
    throw new Error(`Transform hook was not found for ${id}.`);
  }

  const result = (await transform.call({} as never, code, id)) as
    | TransformResult
    | null
    | undefined;
  if (!result) {
    throw new Error(`Transform hook did not return code for ${id}.`);
  }

  return result.code;
}

async function runFixtureTransform(
  factory: TestTransformFactory,
  options: unknown,
  code: string,
  id: string,
): Promise<string> {
  return await runPluginTransform(factory, options, code, id);
}

export function transformOfficialCore(code: string): string {
  return transformOfficial(code, "/virtual/conformance-core.ts");
}

export function transformOfficialReact(code: string): string {
  return transformOfficial(code, "/virtual/conformance-react.tsx");
}

export async function transformSvelteFixture(
  source: string,
  whitespace: FixtureWhitespace = "jsx",
): Promise<string> {
  return await runFixtureTransform(
    svelteUnpluginFactory as unknown as TestTransformFactory,
    { whitespace },
    source,
    "/virtual/Conformance.svelte",
  );
}

export async function transformAstroFixture(
  source: string,
  whitespace: FixtureWhitespace = "jsx",
): Promise<string> {
  return await runFixtureTransform(
    astroUnpluginFactory as unknown as TestTransformFactory,
    { whitespace },
    source,
    "/virtual/Conformance.astro",
  );
}

function extractFields(code: string, field: string): string[] {
  const regex = new RegExp(`${field}:\\s*"((?:[^"]|\\.)*)`, "g");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(code)) !== null) {
    matches.push(match[1]);
  }
  return Array.from(new Set(matches)).toSorted();
}

export function extractIds(code: string): string[] {
  return extractFields(code, "id");
}

export function extractMessages(code: string): string[] {
  return extractFields(code, "message");
}
