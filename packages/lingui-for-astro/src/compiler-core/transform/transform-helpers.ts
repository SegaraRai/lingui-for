import { transformSync, type NodePath } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";
import MagicString from "magic-string";

import { getBabelTraverse } from "../shared/babel-traverse.ts";
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
import { buildDirectProgramMap, buildWrappedSnippetMap } from "./source-map.ts";

const EXPR_PREFIX = "const __expr = (\n";
const WRAPPED_SUFFIX = "\n);";

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
    `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}${source}${WRAPPED_SUFFIX}`,
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
  const rewrittenSource = rewriteNestedComponentMacroExpressions(
    source,
    macroImports,
    options,
  );
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${rewrittenSource}${WRAPPED_SUFFIX}`,
    {
      extract: false,
      filename: `${options.filename}?component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "astro-context",
      runtimeBinding: RUNTIME_BINDING_I18N,
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
  fullSource: string,
  source: string,
  sourceStart: number,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  return transformProgram(source, {
    extract: true,
    filename: `${options.filename}?frontmatter`,
    inputSourceMap: buildDirectProgramMap(
      fullSource,
      options.filename,
      sourceStart,
      source,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}

export function transformExpressionExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-expression`,
    inputSourceMap: buildWrappedSnippetMap(
      fullSource,
      options.filename,
      sourceStart,
      prefix,
      source,
      WRAPPED_SUFFIX,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}

export function transformComponentExtractionUnit(
  fullSource: string,
  source: string,
  sourceStart: number,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): { code: string; map: RawSourceMapLike | null } {
  const prefix = `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n`;
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-component`,
    inputSourceMap: buildWrappedSnippetMap(
      fullSource,
      options.filename,
      sourceStart,
      prefix,
      source,
      WRAPPED_SUFFIX,
    ),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "extract",
  });
}

export function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}

function rewriteNestedComponentMacroExpressions(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
): string {
  if (macroImports.size === 0) {
    return source;
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
    return source;
  }

  const string = new MagicString(source);
  const offset = prefix.length;
  const replacements: Array<{ start: number; end: number; code: string }> = [];

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

      const expressionSource = source.slice(start, end);
      const transformed = transformTemplateExpression(
        expressionSource,
        macroImports,
        options,
      );

      if (transformed !== expressionSource) {
        replacements.push({ start, end, code: transformed });
      }
    },
  });

  replacements
    .toSorted((left, right) => right.start - left.start)
    .forEach(({ start, end, code }) => {
      string.overwrite(start, end, code);
    });

  return string.toString();
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
