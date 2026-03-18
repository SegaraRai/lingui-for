import {
  makeConfig,
  type CatalogType,
  type ExtractedMessage,
} from "@lingui/conf";
import { formatter as createPoFormatter } from "@lingui/format-po";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { svelteExtractor } from "lingui-for-svelte/extractor";
import { transformSvelte } from "../../../packages/lingui-for-svelte/src/compiler-core/index.ts";
import linguiConfig from "../lingui.config.ts";
import {
  WORKBENCH_LOCALE_REGISTRY,
  type MacroWorkbenchLocaleCode,
} from "../src/lib/macro-workbench.ts";

const VIRTUAL_PREFIX = "virtual:macro-workbench?";

type MacroWorkbenchPluginOptions = {
  projectRoot: string;
};

export function macroWorkbenchPlugin({
  projectRoot,
}: MacroWorkbenchPluginOptions) {
  const poFormatter = createPoFormatter({ lineNumbers: false });
  const normalizedLinguiConfig = makeConfig(
    {
      ...linguiConfig,
      rootDir: projectRoot,
    },
    { skipValidation: true },
  );
  const localeCodes = Object.keys(
    WORKBENCH_LOCALE_REGISTRY,
  ) as MacroWorkbenchLocaleCode[];

  return {
    name: "docs-macro-workbench",
    enforce: "pre",
    resolveId(id: string) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return `\0${id}`;
      }

      return null;
    },
    async load(id: string) {
      if (!id.startsWith(`\0${VIRTUAL_PREFIX}`)) {
        return null;
      }

      const params = new URLSearchParams(
        id.slice(`\0${VIRTUAL_PREFIX}`.length),
      );
      const demo = params.get("demo");

      if (!demo) {
        throw new Error(
          'virtual:macro-workbench imports must include a "demo" query parameter.',
        );
      }

      const demoDir = resolve(projectRoot, demo);
      const demoFile = resolve(demoDir, "Demo.svelte");
      const workbenchFile = resolve(demoDir, "workbench.ts");
      const source = await readFile(demoFile, "utf8");
      const messages = await collectMessages(
        demoFile,
        source,
        normalizedLinguiConfig,
      );
      const ids = messages.map((message) => message.id);
      const sourceSnippet = extractSnippet(source);
      const transformedSource = extractSnippet(
        transformSvelte(source, {
          filename: demoFile,
          linguiConfig: normalizedLinguiConfig,
        }).code,
      );
      const poCatalogs = await buildPoCatalogArtifacts(
        projectRoot,
        ids,
        localeCodes,
        poFormatter,
      );
      const compiledCatalogs = await buildCompiledCatalogArtifacts(
        projectRoot,
        ids,
        localeCodes,
      );

      return [
        `import { resolveMacroWorkbenchSpec } from ${JSON.stringify(
          toFsImportPath(
            resolve(projectRoot, "src", "lib", "macro-workbench.ts"),
          ),
        )};`,
        existsSync(workbenchFile)
          ? `import authoredWorkbench from ${JSON.stringify(
              toFsImportPath(workbenchFile),
            )};`
          : "const authoredWorkbench = {};",
        `const artifacts = ${JSON.stringify(
          {
            id: normalizePath(relative(projectRoot, demoDir)),
            source: {
              demo: {
                code: sourceSnippet,
                filename: "Demo.svelte",
                lang: "svelte",
              },
              catalogs: poCatalogs,
            },
            result: {
              compiledCatalogs,
              preview: {
                componentModule: toComponentModulePath(projectRoot, demoFile),
                initialProps: {},
              },
              transformed: {
                code: transformedSource,
                filename: "Demo.svelte",
                lang: "svelte",
              },
            },
          },
          null,
          2,
        )};`,
        `export default resolveMacroWorkbenchSpec(artifacts, authoredWorkbench);`,
      ].join("\n");
    },
  };
}

async function collectMessages(
  filename: string,
  source: string,
  linguiConfigNormalized: ReturnType<typeof makeConfig>,
): Promise<ExtractedMessage[]> {
  const extracted: ExtractedMessage[] = [];

  await svelteExtractor.extract(
    filename,
    source,
    (message) => {
      extracted.push(message);
    },
    {
      linguiConfig: linguiConfigNormalized,
    },
  );

  return dedupeMessages(extracted);
}

function dedupeMessages(messages: ExtractedMessage[]): ExtractedMessage[] {
  const byId = new Map<string, ExtractedMessage>();

  for (const message of messages) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
    }
  }

  return Array.from(byId.values());
}

async function buildPoCatalogArtifacts(
  projectRoot: string,
  ids: string[],
  localeCodes: readonly MacroWorkbenchLocaleCode[],
  poFormatter: ReturnType<typeof createPoFormatter>,
): Promise<
  Record<
    MacroWorkbenchLocaleCode,
    { code: string; filename: string; lang: "po" }
  >
> {
  const entries = await Promise.all(
    localeCodes.map(async (locale) => {
      const poCatalogPath = resolve(
        projectRoot,
        "src",
        "i18n",
        "locales",
        `${locale}.po`,
      );
      const poCatalog = (await poFormatter.parse(
        await readFile(poCatalogPath, "utf8"),
        {
          filename: poCatalogPath,
          locale,
          sourceLocale: "en",
        },
      )) as CatalogType;
      const filteredCatalog = pickCatalogEntries(poCatalog, ids);
      const po = stripPoHeader(
        await poFormatter.serialize(filteredCatalog, {
          existing: null,
          filename: poCatalogPath,
          locale,
          sourceLocale: "en",
        }),
      );

      return [
        locale,
        {
          code: po.trim(),
          filename: `${locale}.po`,
          lang: "po" as const,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    MacroWorkbenchLocaleCode,
    { code: string; filename: string; lang: "po" }
  >;
}

async function buildCompiledCatalogArtifacts(
  projectRoot: string,
  ids: string[],
  localeCodes: readonly MacroWorkbenchLocaleCode[],
): Promise<
  Record<
    MacroWorkbenchLocaleCode,
    { code: string; filename: string; lang: "ts" }
  >
> {
  const entries = await Promise.all(
    localeCodes.map(async (locale) => {
      const compiledCatalogPath = resolve(
        projectRoot,
        "src",
        "i18n",
        "locales",
        `${locale}.ts`,
      );
      const compiledSource = await readFile(compiledCatalogPath, "utf8");
      const catalog = readCompiledCatalog(compiledSource);
      const subset = pickCatalogEntries(catalog, ids);

      return [
        locale,
        {
          code: serializeCompiledCatalog(subset),
          filename: `${locale}.ts`,
          lang: "ts" as const,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    MacroWorkbenchLocaleCode,
    { code: string; filename: string; lang: "ts" }
  >;
}

function pickCatalogEntries<T>(
  catalog: Record<string, T>,
  ids: string[],
): Record<string, T> {
  const subset: Record<string, T> = {};

  for (const id of ids) {
    const entry = catalog[id];
    if (entry) {
      subset[id] = entry;
    }
  }

  return subset;
}

function readCompiledCatalog(source: string): Record<string, unknown> {
  const match = source.match(/JSON\.parse\(\s*([\s\S]*?)\s*\)\s*as Messages;/);

  if (!match) {
    throw new Error("Could not locate compiled catalog payload.");
  }

  const literal = match[1].replace(/,\s*$/, "").trim();
  const jsonString = Function(`"use strict"; return (${literal});`)();

  if (typeof jsonString !== "string") {
    throw new Error("Compiled catalog payload was not a string literal.");
  }

  return JSON.parse(jsonString) as Record<string, unknown>;
}

function serializeCompiledCatalog(catalog: Record<string, unknown>): string {
  return [
    '/*eslint-disable*/ import type { Messages } from "@lingui/core";',
    "export const messages = JSON.parse(",
    `  ${JSON.stringify(JSON.stringify(catalog))},`,
    ") as Messages;",
  ].join("\n");
}

function stripPoHeader(serialized: string): string {
  return serialized.replace(
    /^msgid ""\r?\nmsgstr ""\r?\n(?:".*"\r?\n)+\r?\n?/,
    "",
  );
}

function toFsImportPath(filename: string): string {
  return `/@fs/${normalizePath(filename)}`;
}

function normalizePath(filename: string): string {
  return filename.replaceAll("\\", "/");
}

function toComponentModulePath(projectRoot: string, filename: string): string {
  const componentsDir = resolve(projectRoot, "src", "components");

  return normalizePath(relative(componentsDir, filename));
}

function extractSnippet(source: string): string {
  const visibleSource = stripCutBlocks(source);
  const startMarker = "<!-- docs-snippet:start -->";
  const endMarker = "<!-- docs-snippet:end -->";
  const startIndex = visibleSource.indexOf(startMarker);
  const endIndex = visibleSource.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return visibleSource.trim();
  }

  const snippet = visibleSource
    .slice(startIndex + startMarker.length, endIndex)
    .replaceAll(startMarker, "")
    .replaceAll(endMarker, "")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  return dedentSnippet(snippet);
}

function stripCutBlocks(source: string): string {
  return source
    .replace(
      /[ \t]*\/\*\s*docs-cut:start\s*\*\/[\s\S]*?\/\*\s*docs-cut:end\s*\*\/\n/g,
      "",
    )
    .replace(
      /[ \t]*<!--\s*docs-cut:start\s*-->[\s\S]*?<!--\s*docs-cut:end\s*-->\n/g,
      "",
    );
}

function dedentSnippet(source: string): string {
  const lines = source.split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const minimumIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines
    .map((line) => line.slice(minimumIndent))
    .join("\n")
    .trim();
}
