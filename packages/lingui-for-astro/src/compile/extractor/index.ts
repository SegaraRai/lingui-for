import type {
  ExtractedMessage,
  ExtractorCtx,
  ExtractorType,
  LinguiConfigNormalized,
} from "@lingui/conf";
import { createHash } from "node:crypto";

import {
  buildAstroSyntheticModule,
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  stripQuery,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/framework-core/compile";
import { initWasmOnce } from "@lingui-for/framework-core/compile/wasm-loader";
import * as t from "@lingui-for/framework-core/vendor/babel-types";
import {
  createLinguiConfigResolver,
  type LinguiConfigSource,
} from "@lingui-for/framework-core/config";

import {
  loadLinguiConfig,
  type LinguiAstroFrameworkConfig,
} from "../common/config.ts";
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { lowerAstroExtractProgram } from "../lower/extract.ts";

/**
 * Options for {@link astroExtractor}.
 */
export interface AstroExtractorOptions {
  config?: LinguiConfigSource;
}

/**
 * Lingui extractor for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing syntax into a Rust-generated
 * synthetic module, and forwards the extracted messages to Lingui's Babel
 * extractor pipeline.
 */
export const astroExtractor: ExtractorType & typeof astroExtractorFactory =
  /*#__PURE__*/ Object.assign(astroExtractorFactory, astroExtractorFactory());

/**
 * Lingui extractor factory for `.astro` source files.
 */
function astroExtractorFactory(options?: AstroExtractorOptions): ExtractorType {
  const configResolver = createLinguiConfigResolver({
    loadConfig: loadLinguiConfig,
    config: options?.config,
    missingConfigMessage:
      "lingui-for-astro extractor requires a Lingui config file or explicit config option.",
  });

  return {
    match(filename) {
      return filename.endsWith(".astro");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const resolvedConfigPath = ctx?.linguiConfig.resolvedConfigPath;
      if (resolvedConfigPath != null) {
        configResolver.finalizeResolvedConfigPath(resolvedConfigPath);
      }

      const extractorCtx = createExtractorContext(
        ctx,
        await configResolver.getConfig(),
      );
      const syntheticName = filename.replace(/\.astro$/, ".synthetic.tsx");
      const synthetic = buildAstroSyntheticModule({
        source,
        sourceName: filename,
        syntheticName,
        whitespace: extractorCtx.frameworkConfig.whitespace ?? "astro",
        conventions: createAstroFrameworkConventions(
          extractorCtx.linguiConfig,
          {
            packages: extractorCtx.frameworkConfig.packages,
          },
        ),
      });
      const transformed = lowerAstroExtractProgram(synthetic.source, {
        filename: syntheticName,
        linguiConfig: extractorCtx.linguiConfig,
        inputSourceMap: toBabelSourceMap(
          parseCanonicalSourceMap(synthetic.sourceMapJson),
        ),
      });
      const generatedDescriptors = collectGeneratedMacroDescriptors(
        transformed.ast,
      );

      await runBabelExtractionUnits(
        filename,
        [
          {
            code: transformed.code,
            map: transformed.map,
          },
        ],
        normalizeGeneratedMacroMessageIds(
          generatedDescriptors,
          onMessageExtracted,
        ),
        extractorCtx,
        {
          normalizeSourceMap: normalizeExtractionSourceMap,
        },
      );
    },
  };
}

function normalizeGeneratedMacroMessageIds(
  generatedDescriptors: ReadonlySet<string>,
  onMessageExtracted: (message: ExtractedMessage) => void,
): (message: ExtractedMessage) => void {
  return (message) => {
    if (
      message.message != null &&
      generatedDescriptors.has(
        descriptorKey(message.id, message.message, message.context),
      )
    ) {
      onMessageExtracted({
        ...message,
        id: generateLinguiMessageId(message.message, message.context),
      });
      return;
    }

    onMessageExtracted(message);
  };
}

function generateLinguiMessageId(message: string, context?: string): string {
  return createHash("sha256")
    .update(message + "\u001f" + (context ?? ""))
    .digest("base64")
    .slice(0, 6);
}

function collectGeneratedMacroDescriptors(root: t.Node): Set<string> {
  const generatedDescriptors = new Set<string>();
  const visited = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!isBabelNode(node) || visited.has(node)) {
      return;
    }
    visited.add(node);

    if (t.isObjectExpression(node)) {
      const idProperty = findStringObjectProperty(node, "id");
      const messageProperty = findStringObjectProperty(node, "message");
      const contextProperty = findStringObjectProperty(node, "context");

      if (
        idProperty != null &&
        messageProperty != null &&
        idProperty.loc == null
      ) {
        generatedDescriptors.add(
          descriptorKey(
            idProperty.value.value,
            messageProperty.value.value,
            contextProperty?.value.value,
          ),
        );
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === "loc" ||
        key === "leadingComments" ||
        key === "trailingComments"
      ) {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        visit(value);
      }
    }
  };

  visit(root);
  return generatedDescriptors;
}

function findStringObjectProperty(
  node: t.ObjectExpression,
  name: string,
): (t.ObjectProperty & { value: t.StringLiteral }) | undefined {
  return node.properties.find((property) => {
    if (!t.isObjectProperty(property) || !t.isStringLiteral(property.value)) {
      return false;
    }
    if (t.isIdentifier(property.key)) {
      return property.key.name === name;
    }
    return t.isStringLiteral(property.key) && property.key.value === name;
  }) as (t.ObjectProperty & { value: t.StringLiteral }) | undefined;
}

function descriptorKey(
  id: string,
  message: string,
  context: string | undefined,
): string {
  return `${id}\u{1f}${message}\u{1f}${context ?? ""}`;
}

function isBabelNode(node: unknown): node is t.Node {
  return (
    typeof node === "object" &&
    node != null &&
    "type" in node &&
    typeof (node as { type?: unknown }).type === "string"
  );
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  loaded: {
    linguiConfig: LinguiConfigNormalized;
    frameworkConfig: LinguiAstroFrameworkConfig;
  },
): ExtractorCtx & {
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiAstroFrameworkConfig;
} {
  return { ...ctx, ...loaded };
}

function normalizeExtractionSourceMap(
  map: CanonicalSourceMap,
): CanonicalSourceMap {
  return {
    ...map,
    file: map.file != null ? stripQuery(map.file) : map.file,
    sources: (map.sources as string[] | undefined)?.map(stripQuery) ?? [],
  };
}
