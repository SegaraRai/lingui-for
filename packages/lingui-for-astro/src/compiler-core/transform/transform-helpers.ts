import { generate } from "@babel/generator";
import * as t from "@babel/types";

import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_LINGUI_CONTEXT,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";
import type {
  LinguiAstroTransformOptions,
  RawSourceMapLike,
} from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "./runtime-trans-lowering.ts";

export function transformFrontmatter(
  source: string,
  options: LinguiAstroTransformOptions,
): string {
  return transformProgram(source, {
    extract: false,
    filename: `${options.filename}?frontmatter`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "astro-context",
    runtimeBinding: RUNTIME_BINDING_I18N,
  }).code;
}

export function transformTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}const __expr = (\n${source}\n);`,
    {
      extract: false,
      filename: `${options.filename}?expression`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "astro-context",
      runtimeBinding: RUNTIME_BINDING_I18N,
    },
  );
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

  return generate(declaration.declarations[0].init, {
    comments: true,
    jsescOption: { minimal: true },
    retainLines: false,
  }).code;
}

export function transformComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${source}\n);`,
    {
      extract: false,
      filename: `${options.filename}?component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "raw",
    },
  );

  stripRuntimeTransImports(transformed.ast.program);
  return lowerSyntheticComponentDeclaration(
    transformed,
    RUNTIME_BINDING_RUNTIME_TRANS,
  );
}

export function buildFrontmatterPrelude(
  includeAstroContext: boolean,
  includeRuntimeTrans: boolean,
): string {
  const lines: string[] = [];

  if (includeAstroContext) {
    lines.push(
      `import { getLinguiContext as ${RUNTIME_BINDING_GET_LINGUI_CONTEXT} } from "${PACKAGE_RUNTIME}";\n`,
      `const ${RUNTIME_BINDING_CONTEXT} = ${RUNTIME_BINDING_GET_LINGUI_CONTEXT}(Astro);\n`,
      `const ${RUNTIME_BINDING_I18N} = ${RUNTIME_BINDING_CONTEXT}.i18n;\n`,
    );
  }

  if (includeRuntimeTrans) {
    lines.push(
      `import { RuntimeTrans as ${RUNTIME_BINDING_RUNTIME_TRANS} } from "${PACKAGE_RUNTIME}";\n`,
    );
  }

  return lines.join("");
}

export function transformFrontmatterExtractionUnit(
  source: string,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(source, {
    extract: true,
    filename: `${options.filename}?frontmatter`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}

export function transformExpressionExtractionUnit(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(
    `${createSyntheticMacroImports(macroImports)}const __expr = (\n${source}\n);`,
    {
      extract: true,
      filename: `${options.filename}?extract-expression`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    },
  );
}

export function transformComponentExtractionUnit(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(
    `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${source}\n);`,
    {
      extract: true,
      filename: `${options.filename}?extract-component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    },
  );
}

export function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}

function createSyntheticMacroImports(
  bindings: ReadonlyMap<string, string>,
): string {
  if (bindings.size === 0) {
    return "";
  }

  return [...bindings.entries()]
    .map(([localName, importedName]) =>
      importedName === localName
        ? `import { ${importedName} } from "${PACKAGE_MACRO}";\n`
        : `import { ${importedName} as ${localName} } from "${PACKAGE_MACRO}";\n`,
    )
    .join("");
}
