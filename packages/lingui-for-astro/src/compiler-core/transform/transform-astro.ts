import { generate } from "@babel/generator";
import * as t from "@babel/types";
import MagicString from "magic-string";

import {
  analyzeAstro,
  initWasmOnce,
  type AstroAnalysis,
  type AstroExpression,
} from "#astro-analyzer-wasm";
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
import {
  expressionUsesMacroBinding,
  parseMacroBindings,
  type MacroBindings,
} from "../shared/macro-bindings.ts";
import type {
  LinguiAstroTransformOptions,
  RawSourceMapLike,
} from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "./runtime-trans-lowering.ts";

/**
 * Result returned by {@link transformAstro}.
 */
export interface AstroTransformResult {
  /**
   * Transformed `.astro` source.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: RawSourceMapLike | null;
  /**
   * Source analysis reused by callers that need structural metadata.
   */
  analysis: AstroAnalysis;
}

/**
 * Transforms one `.astro` source file in place for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source, source map, and the structural analysis used during the transform.
 *
 * This is the main Astro entry point for runtime compilation. It analyzes frontmatter and template
 * expressions, rewrites function macros against the request-scoped `i18n` binding, lowers
 * component macros to `RuntimeTrans`, and injects only the frontmatter prelude actually needed by
 * the rewritten file.
 */
export function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): AstroTransformResult {
  initWasmOnce();

  const analysis = analyzeAstro(source);
  const string = new MagicString(source);
  const frontmatterContent = getFrontmatterContent(source, analysis);
  const macroBindings = parseMacroBindings(frontmatterContent);
  const filteredExpressions = filterExpressions(
    source,
    analysis.expressions,
    macroBindings,
  );
  const filteredComponents = analysis.componentCandidates.filter((candidate) =>
    macroBindings.components.has(candidate.tagName),
  );

  const usesAstroI18n =
    frontmatterContent.includes(PACKAGE_MACRO) ||
    filteredExpressions.length > 0;
  const usesRuntimeTrans = filteredComponents.length > 0;

  filteredExpressions
    .slice()
    .sort((left, right) => right.range.start - left.range.start)
    .forEach((expression) => {
      const transformed = transformTemplateExpression(
        source.slice(expression.innerRange.start, expression.innerRange.end),
        macroBindings.allImports,
        options,
      );
      string.overwrite(
        expression.range.start,
        expression.range.end,
        `{${transformed}}`,
      );
    });

  filteredComponents
    .slice()
    .sort((left, right) => right.range.start - left.range.start)
    .forEach((candidate) => {
      const replacement = transformComponentMacro(
        source.slice(candidate.range.start, candidate.range.end),
        macroBindings.componentImports,
        options,
      );
      string.overwrite(candidate.range.start, candidate.range.end, replacement);
    });

  const transformedFrontmatter = frontmatterContent.includes(PACKAGE_MACRO)
    ? transformFrontmatter(frontmatterContent, options)
    : frontmatterContent;
  const prelude = buildFrontmatterPrelude(usesAstroI18n, usesRuntimeTrans);
  const finalFrontmatter = [prelude, transformedFrontmatter]
    .filter((part) => part.trim().length > 0)
    .join("\n");

  if (analysis.frontmatter) {
    string.overwrite(
      analysis.frontmatter.contentRange.start,
      analysis.frontmatter.contentRange.end,
      finalFrontmatter,
    );
  } else if (finalFrontmatter.trim().length > 0) {
    string.prepend(`---\n${finalFrontmatter}\n---\n`);
  }

  return {
    code: string.toString(),
    map: null,
    analysis,
  };
}

/**
 * Builds extraction-only Babel units for one `.astro` file.
 *
 * @param source Original `.astro` source.
 * @param options Extraction options including filename and optional Lingui config.
 * @returns Babel-extractable code units corresponding to frontmatter, expressions, and component
 * macros that contain Lingui messages.
 *
 * This powers the `.astro` extractor by reusing the same analysis and synthetic-program strategy
 * as the runtime transform while switching Lingui into extraction mode.
 */
export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null }[] {
  initWasmOnce();

  const analysis = analyzeAstro(source);
  const frontmatterContent = getFrontmatterContent(source, analysis);
  const macroBindings = parseMacroBindings(frontmatterContent);
  const units: { code: string; map: RawSourceMapLike | null }[] = [];

  if (frontmatterContent.includes(PACKAGE_MACRO)) {
    const transformedFrontmatter = transformProgram(frontmatterContent, {
      extract: true,
      filename: `${options.filename}?frontmatter`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    });

    if (isExtractionCodeRelevant(transformedFrontmatter.code)) {
      units.push({
        code: transformedFrontmatter.code,
        map: transformedFrontmatter.map,
      });
    }
  }

  const filteredExpressions = filterExpressions(
    source,
    analysis.expressions,
    macroBindings,
  );
  for (const expression of filteredExpressions) {
    const transformed = transformExpressionExtractionUnit(
      source.slice(expression.innerRange.start, expression.innerRange.end),
      macroBindings,
      options,
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  for (const component of analysis.componentCandidates) {
    if (!macroBindings.components.has(component.tagName)) {
      continue;
    }

    const transformed = transformComponentExtractionUnit(
      source.slice(component.range.start, component.range.end),
      macroBindings,
      options,
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  return units;
}

function getFrontmatterContent(
  source: string,
  analysis: AstroAnalysis,
): string {
  if (!analysis.frontmatter) {
    return "";
  }

  return source.slice(
    analysis.frontmatter.contentRange.start,
    analysis.frontmatter.contentRange.end,
  );
}

function filterExpressions(
  source: string,
  expressions: AstroExpression[],
  macroBindings: MacroBindings,
): AstroExpression[] {
  const results: AstroExpression[] = [];

  for (const expression of expressions) {
    const expressionSource = source.slice(
      expression.innerRange.start,
      expression.innerRange.end,
    );
    if (expressionUsesMacroBinding(expressionSource, macroBindings)) {
      results.push(expression);
    }
  }

  return results;
}

function transformFrontmatter(
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

function transformTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}\nconst __expr = (\n${source}\n);`,
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

function transformComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}\nconst ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${source}\n);`,
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

function buildFrontmatterPrelude(
  includeAstroContext: boolean,
  includeRuntimeTrans: boolean,
): string {
  const lines: string[] = [];

  if (includeAstroContext) {
    lines.push(
      `import { getLinguiContext as ${RUNTIME_BINDING_GET_LINGUI_CONTEXT} } from "${PACKAGE_RUNTIME}";`,
      `const ${RUNTIME_BINDING_CONTEXT} = ${RUNTIME_BINDING_GET_LINGUI_CONTEXT}(Astro);`,
      `const ${RUNTIME_BINDING_I18N} = ${RUNTIME_BINDING_CONTEXT}.i18n;`,
    );
  }

  if (includeRuntimeTrans) {
    lines.push(
      `import { RuntimeTrans as ${RUNTIME_BINDING_RUNTIME_TRANS} } from "${PACKAGE_RUNTIME}";`,
    );
  }

  return lines.join("\n");
}

function transformExpressionExtractionUnit(
  source: string,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(
    `${createSyntheticMacroImports(macroBindings.allImports)}\nconst __expr = (\n${source}\n);`,
    {
      extract: true,
      filename: `${options.filename}?extract-expression`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    },
  );
}

function transformComponentExtractionUnit(
  source: string,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(
    `${createSyntheticMacroImports(macroBindings.componentImports)}\nconst ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${source}\n);`,
    {
      extract: true,
      filename: `${options.filename}?extract-component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    },
  );
}

function isExtractionCodeRelevant(code: string): boolean {
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
        ? `import { ${importedName} } from "${PACKAGE_MACRO}";`
        : `import { ${importedName} as ${localName} } from "${PACKAGE_MACRO}";`,
    )
    .join("\n");
}
