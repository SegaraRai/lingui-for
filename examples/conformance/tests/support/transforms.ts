import { readdir } from "node:fs/promises";
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
  n: (options?: unknown) => {
    transform?: TransformHook | { handler?: TransformHook };
  };
};

let astroTransformModulePromise: Promise<DistTransformModule> | undefined;
let svelteTransformModulePromise: Promise<DistTransformModule> | undefined;

async function loadDistTransformModule(
  packageName: "lingui-for-astro" | "lingui-for-svelte",
): Promise<DistTransformModule> {
  const distDir = resolve(workspaceRoot, "packages", packageName, "dist");
  const entryNames = await readdir(distDir);
  const fileName = entryNames.find((entry) => /^unplugin-.*\.mjs$/.test(entry));

  if (!fileName) {
    throw new Error(`Could not find a built transform entry in ${distDir}.`);
  }

  return (await import(
    pathToFileURL(resolve(distDir, fileName)).href
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
  const plugin = module.n(undefined);
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
