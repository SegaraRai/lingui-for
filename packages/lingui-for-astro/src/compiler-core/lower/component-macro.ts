import { type NodePath, transformSync } from "@babel/core";
import * as t from "@babel/types";
import MagicString from "magic-string";

import {
  babelTraverse,
  buildAnchoredGeneratedSnippetMap,
  buildGeneratedSnippetMap,
  buildOutputWithIndexedMap,
  buildPrefixedMappedSnippetMap,
  buildPrefixedSnippetMap,
  lowerSyntheticComponentDeclaration,
  type ReplacementChunk,
  stripRuntimeTransImports,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  DEFAULT_ASTRO_RUNTIME_BINDINGS,
  PACKAGE_RUNTIME,
  SYNTHETIC_PREFIX_COMPONENT,
  type AstroRuntimeBindings,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import {
  createComponentWrapperPrefix,
  type LoweredSnippet,
  type LoweringSourceMapOptions,
  WRAPPED_SUFFIX,
} from "./common.ts";
import { lowerTemplateExpression } from "./template-expression.ts";

export function lowerComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    sourceMapOptions?: LoweringSourceMapOptions;
    runtimeBindings?: Pick<AstroRuntimeBindings, "i18n" | "runtimeTrans">;
  },
): LoweredSnippet {
  const bindings =
    loweringOptions.runtimeBindings ?? DEFAULT_ASTRO_RUNTIME_BINDINGS;
  const rewrittenSource = rewriteNestedComponentMacroExpressions(
    source,
    macroImports,
    options,
    loweringOptions.sourceMapOptions,
    bindings.i18n,
  );
  const prefix = createComponentWrapperPrefix(macroImports);
  const inputSourceMap =
    !loweringOptions.extract && rewrittenSource.map != null
      ? buildPrefixedMappedSnippetMap(
          loweringOptions.sourceMapOptions?.fullSource ?? source,
          options.filename,
          loweringOptions.sourceMapOptions?.sourceStart ?? 0,
          prefix,
          rewrittenSource.map,
        )
      : !loweringOptions.extract
        ? buildPrefixedSnippetMap(
            loweringOptions.sourceMapOptions?.fullSource ?? source,
            options.filename,
            loweringOptions.sourceMapOptions?.sourceStart ?? 0,
            prefix,
            source.length,
          )
        : undefined;
  const transformed = transformProgram(
    `${prefix}${rewrittenSource.code}${WRAPPED_SUFFIX}`,
    {
      extract: loweringOptions.extract,
      filename: `${options.filename}${loweringOptions.extract ? "?extract-component" : "?component"}`,
      inputSourceMap,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: loweringOptions.extract ? "extract" : "astro-context",
      runtimeBinding: loweringOptions.extract ? undefined : bindings.i18n,
    },
  );

  if (loweringOptions.extract) {
    return {
      code: transformed.code,
      map: buildAnchoredGeneratedSnippetMap(
        loweringOptions.sourceMapOptions?.fullSource ?? source,
        options.filename,
        loweringOptions.sourceMapOptions?.sourceStart ?? 0,
        transformed.code,
        source.length,
        getComponentExtractionAnchorOffset(transformed.code),
      ),
    };
  }

  stripRuntimeTransImports(transformed.ast.program, PACKAGE_RUNTIME);
  const code = lowerSyntheticComponentDeclaration(
    transformed,
    bindings.runtimeTrans,
    SYNTHETIC_PREFIX_COMPONENT,
  );
  return {
    code,
    map: buildGeneratedSnippetMap(
      loweringOptions.sourceMapOptions?.fullSource ?? source,
      options.filename,
      loweringOptions.sourceMapOptions?.sourceStart ?? 0,
      code,
      source.length,
    ),
  };
}

function rewriteNestedComponentMacroExpressions(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions: LoweringSourceMapOptions | undefined,
  runtimeBinding: string,
): LoweredSnippet {
  if (macroImports.size === 0) {
    return { code: source, map: null };
  }

  const prefix = "const __component = (\n";
  const wrapped = `${prefix}${source}\n);`;
  const parsed = transformSync(wrapped, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    filename: `${options.filename}?component-attrs`,
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    },
  });

  if (!parsed?.ast) {
    return { code: source, map: null };
  }

  const string = new MagicString(source);
  const offset = prefix.length;
  const replacements: ReplacementChunk[] = [];

  babelTraverse(parsed.ast, {
    JSXAttribute(path: NodePath<t.JSXAttribute>) {
      const value = path.node.value;
      if (
        !t.isJSXExpressionContainer(value) ||
        !t.isExpression(value.expression)
      ) {
        return;
      }

      const expressionStart = value.expression.start;
      const expressionEnd = value.expression.end;
      if (expressionStart == null || expressionEnd == null) {
        return;
      }

      const start = expressionStart - offset;
      const end = expressionEnd - offset;
      if (start < 0 || end > source.length) {
        return;
      }

      const transformed = lowerTemplateExpression(
        source.slice(start, end),
        macroImports,
        options,
        {
          extract: false,
          runtimeBinding,
          sourceMapOptions: sourceMapOptions
            ? {
                fullSource: sourceMapOptions.fullSource,
                sourceStart: sourceMapOptions.sourceStart + start,
              }
            : {
                fullSource: source,
                sourceStart: start,
              },
        },
      );

      if (transformed.code !== source.slice(start, end)) {
        replacements.push({
          start,
          end,
          code: transformed.code,
          map: transformed.map,
        });
      }
    },
  });

  replacements
    .toSorted((left, right) => right.start - left.start)
    .forEach(({ start, end, code }) => {
      string.overwrite(start, end, code);
    });

  if (replacements.length === 0) {
    return { code: source, map: null };
  }

  return buildOutputWithIndexedMap(source, options.filename, replacements);
}

function getComponentExtractionAnchorOffset(code: string): number {
  const messageMatch = code.match(/\bmessage:\s*"([^"\\]|\\.)*"/);
  if (!messageMatch || messageMatch.index == null) {
    return getExtractionDescriptorAnchorOffset(code);
  }

  return messageMatch.index + messageMatch[0].length;
}

function getExtractionDescriptorAnchorOffset(code: string): number {
  const commentStart = code.indexOf("/*i18n*/");
  if (commentStart < 0) {
    return 0;
  }

  const descriptorStart = code.indexOf("{", commentStart);
  return descriptorStart >= 0 ? descriptorStart : commentStart;
}
