import { transformSync, type NodePath } from "@babel/core";
import * as t from "@babel/types";
import MagicString from "magic-string";

import {
  buildGeneratedSnippetMap,
  buildOutputWithIndexedMap,
  buildPrefixedSnippetMap,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { getBabelTraverse } from "../shared/babel-traverse.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  createComponentWrapperPrefix,
  WRAPPED_SUFFIX,
} from "../extract/common.ts";
import { transformProgram } from "../transform/babel-transform.ts";
import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "../transform/runtime-trans-lowering.ts";
import type { LoweredSnippet, LoweringSourceMapOptions } from "./common.ts";
import { lowerTemplateExpression } from "./template-expression.ts";

export function lowerComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    sourceMapOptions?: LoweringSourceMapOptions;
  },
): LoweredSnippet {
  const rewrittenSource = rewriteNestedComponentMacroExpressions(
    source,
    macroImports,
    options,
    loweringOptions.sourceMapOptions,
  );
  const prefix = createComponentWrapperPrefix(macroImports);
  const transformed = transformProgram(
    `${prefix}${rewrittenSource.code}${WRAPPED_SUFFIX}`,
    {
      extract: loweringOptions.extract,
      filename: `${options.filename}${loweringOptions.extract ? "?extract-component" : "?component"}`,
      inputSourceMap: buildPrefixedSnippetMap(
        loweringOptions.sourceMapOptions?.fullSource ?? source,
        options.filename,
        loweringOptions.sourceMapOptions?.sourceStart ?? 0,
        prefix,
        source.length,
      ),
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: loweringOptions.extract ? "extract" : "astro-context",
      runtimeBinding: loweringOptions.extract
        ? undefined
        : RUNTIME_BINDING_I18N,
    },
  );

  if (loweringOptions.extract) {
    return {
      code: transformed.code,
      map: transformed.map,
    };
  }

  stripRuntimeTransImports(transformed.ast.program);
  const code = lowerSyntheticComponentDeclaration(
    transformed,
    RUNTIME_BINDING_RUNTIME_TRANS,
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

  const traverse = getBabelTraverse();

  traverse(parsed.ast, {
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
