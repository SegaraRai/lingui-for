import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
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

type TransformHook = (code: string, id: string) => unknown;

type TransformResult = {
  code: string;
};

type DistTransformModule = {
  unpluginFactory?: (options?: unknown) => {
    transform?: TransformHook | { handler?: TransformHook };
  };
  n?: (options?: unknown) => {
    transform?: TransformHook | { handler?: TransformHook };
  };
};

let astroTransformModulePromise: Promise<DistTransformModule> | undefined;
let svelteTransformModulePromise: Promise<DistTransformModule> | undefined;

async function loadDistTransformModule(
  packageName: "lingui-for-astro" | "lingui-for-svelte",
): Promise<DistTransformModule> {
  return (await import(
    pathToFileURL(
      resolve(
        workspaceRoot,
        "packages",
        packageName,
        "dist",
        "unplugin",
        "index.mjs",
      ),
    ).href
  )) as DistTransformModule;
}

async function getAstroTransformModule(): Promise<DistTransformModule> {
  astroTransformModulePromise ??= loadDistTransformModule("lingui-for-astro");
  return await astroTransformModulePromise;
}

async function getSvelteTransformModule(): Promise<DistTransformModule> {
  svelteTransformModulePromise ??= loadDistTransformModule("lingui-for-svelte");
  return await svelteTransformModulePromise;
}

async function runPluginTransform(
  module: DistTransformModule,
  code: string,
  id: string,
): Promise<string> {
  const factory = module.unpluginFactory ?? module.n;

  if (!factory) {
    throw new Error(`Transform factory was not found for ${id}.`);
  }

  const plugin = factory(undefined);
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

export function transformOfficialCore(code: string): string {
  return transformOfficial(code, "/virtual/conformance-core.ts");
}

export function transformOfficialReact(code: string): string {
  return transformOfficial(code, "/virtual/conformance-react.tsx");
}

export async function transformSvelteFixture(source: string): Promise<string> {
  return await runPluginTransform(
    await getSvelteTransformModule(),
    source,
    "/virtual/Conformance.svelte",
  );
}

export async function transformAstroFixture(source: string): Promise<string> {
  return await runPluginTransform(
    await getAstroTransformModule(),
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
