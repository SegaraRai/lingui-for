import type { RawSourceMap } from "source-map";

import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  buildGeneratedSnippetMap,
  buildPrefixedSnippetMap,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { RUNTIME_BINDING_I18N } from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  EXPR_PREFIX,
  WRAPPED_SUFFIX,
  createSyntheticMacroImports,
} from "../extract/common.ts";
import { transformProgram } from "../transform/babel-transform.ts";
import type { LoweredSnippet, LoweringSourceMapOptions } from "./common.ts";

export function lowerTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    sourceMapOptions?: LoweringSourceMapOptions;
  },
): LoweredSnippet {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;
  const transformed = transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: loweringOptions.extract,
    filename: `${options.filename}${loweringOptions.extract ? "?extract-expression" : "?expression"}`,
    inputSourceMap: buildPrefixedSnippetMap(
      loweringOptions.sourceMapOptions?.fullSource ?? source,
      options.filename,
      loweringOptions.sourceMapOptions?.sourceStart ?? 0,
      prefix,
      source.length,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: loweringOptions.extract ? "extract" : "astro-context",
    runtimeBinding: loweringOptions.extract ? undefined : RUNTIME_BINDING_I18N,
  });

  if (loweringOptions.extract) {
    return {
      code: transformed.code,
      map: transformed.map,
    };
  }

  const program = transformed.ast.program;
  const declaration = program.body.find(
    (statement): statement is t.VariableDeclaration =>
      t.isVariableDeclaration(statement) &&
      statement.declarations.length === 1 &&
      t.isIdentifier(statement.declarations[0]?.id, { name: "__expr" }),
  );

  if (!declaration?.declarations[0]?.init) {
    throw new Error("Failed to lower Astro expression");
  }

  const generated = generate(
    declaration.declarations[0].init,
    {
      comments: true,
      jsescOption: { minimal: true },
      retainLines: false,
      sourceMaps: true,
      sourceFileName: options.filename,
    },
    transformed.code,
  );

  return {
    code: generated.code,
    map: loweringOptions.sourceMapOptions
      ? buildGeneratedSnippetMap(
          loweringOptions.sourceMapOptions.fullSource,
          options.filename,
          loweringOptions.sourceMapOptions.sourceStart,
          generated.code,
          source.length,
        )
      : ((generated.map as RawSourceMap | null | undefined) ?? null),
  };
}
