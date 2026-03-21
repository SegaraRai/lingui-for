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
import { transformProgram } from "./babel-transform.ts";
import type { MappedSnippet } from "./common.ts";

export function transformTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;
  const transformed = transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: false,
    filename: `${options.filename}?expression`,
    inputSourceMap: buildPrefixedSnippetMap(
      sourceMapOptions?.fullSource ?? source,
      options.filename,
      sourceMapOptions?.sourceStart ?? 0,
      prefix,
      source.length,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "astro-context",
    runtimeBinding: RUNTIME_BINDING_I18N,
  });
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
    map: sourceMapOptions
      ? buildGeneratedSnippetMap(
          sourceMapOptions.fullSource,
          options.filename,
          sourceMapOptions.sourceStart,
          generated.code,
          source.length,
        )
      : ((generated.map as RawSourceMap | null | undefined) ?? null),
  };
}
