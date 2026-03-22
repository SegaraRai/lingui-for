import { generate } from "@babel/generator";
import * as t from "@babel/types";

import { normalizeLinguiConfig } from "../shared/config.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import {
  createSyntheticMacroImports,
  EXPR_PREFIX,
  type LoweredSnippet,
  WRAPPED_SUFFIX,
} from "./common.ts";
import { transformProgram } from "./babel-transform.ts";

export function lowerTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    runtimeBinding: string;
  },
): LoweredSnippet {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;

  if (loweringOptions.extract) {
    const transformed = transformProgram(
      `${prefix}${source}${WRAPPED_SUFFIX}`,
      {
        translationMode: "extract",
        filename: `${options.filename}?extract-expression`,
        linguiConfig: normalizeLinguiConfig(options.linguiConfig),
        runtimeBinding: null,
      },
    );

    return { code: transformed.code };
  }

  const transformed = transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    translationMode: "astro-context",
    filename: `${options.filename}?expression`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    runtimeBinding: loweringOptions.runtimeBinding,
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
    },
    transformed.code,
  );

  return { code: generated.code };
}
