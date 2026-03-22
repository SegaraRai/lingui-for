import type { RawSourceMap } from "source-map";

import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  buildAnchoredGeneratedSnippetMap,
  buildGeneratedSnippetMap,
  buildPrefixedSnippetMap,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { RUNTIME_BINDING_I18N } from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  createSyntheticMacroImports,
  EXPR_PREFIX,
  type LoweredSnippet,
  type LoweringSourceMapOptions,
  WRAPPED_SUFFIX,
} from "./common.ts";
import { transformProgram } from "./babel-transform.ts";

export function lowerTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    sourceMapOptions?: LoweringSourceMapOptions;
    runtimeBinding?: string;
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
    runtimeBinding: loweringOptions.extract
      ? undefined
      : (loweringOptions.runtimeBinding ?? RUNTIME_BINDING_I18N),
  });

  if (loweringOptions.extract) {
    const originalStart =
      (loweringOptions.sourceMapOptions?.sourceStart ?? 0) +
      getLeadingWhitespaceLength(source);

    return {
      code: transformed.code,
      map: buildAnchoredGeneratedSnippetMap(
        loweringOptions.sourceMapOptions?.fullSource ?? source,
        options.filename,
        originalStart,
        transformed.code,
        getTrimmedSourceLength(source),
        getExtractionDescriptorAnchorOffset(transformed.code),
      ),
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
          loweringOptions.sourceMapOptions.sourceStart +
            getLeadingWhitespaceLength(source),
          generated.code,
          getTrimmedSourceLength(source),
        )
      : ((generated.map as RawSourceMap | null | undefined) ?? null),
  };
}

function getExtractionDescriptorAnchorOffset(code: string): number {
  const commentStart = code.indexOf("/*i18n*/");
  if (commentStart < 0) {
    return 0;
  }

  const descriptorStart = code.indexOf("{", commentStart);
  return descriptorStart >= 0 ? descriptorStart : commentStart;
}

function getLeadingWhitespaceLength(source: string): number {
  const match = source.match(/^\s*/);
  return match?.[0].length ?? 0;
}

function getTrimmedSourceLength(source: string): number {
  const trimmed = source.trim();
  return Math.max(trimmed.length, 1);
}
