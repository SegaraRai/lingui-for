import { parseSync, transformSync, type NodePath } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";
import MagicString from "magic-string";
import type { RawSourceMap } from "source-map";

import {
  buildOutputWithIndexedMap,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { getBabelTraverse } from "../shared/babel-traverse.ts";
import { getParserPlugins, normalizeLinguiConfig } from "../shared/config.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_LINGUI_CONTEXT,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "./runtime-trans-lowering.ts";
import {
  buildDirectProgramMap,
  buildPrefixedSnippetMap,
  buildGeneratedSnippetMap,
} from "./source-map.ts";

const EXPR_PREFIX = "const __expr = (\n";
const WRAPPED_SUFFIX = "\n);";

type MappedSnippet = {
  code: string;
  map: RawSourceMap | null;
};

export function transformFrontmatter(
  source: string,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  const transformed = transformProgram(source, {
    extract: false,
    filename: `${options.filename}?frontmatter`,
    inputSourceMap: sourceMapOptions
      ? buildDirectProgramMap(
          sourceMapOptions.fullSource,
          stripQuery(options.filename),
          sourceMapOptions.sourceStart,
          source.length,
        )
      : undefined,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "astro-context",
    runtimeBinding: RUNTIME_BINDING_I18N,
  });

  const rebuilt = rebuildFrontmatterWithMappings(
    source,
    transformed,
    stripQuery(options.filename).split(/[\\/]/).at(-1) ??
      stripQuery(options.filename),
    sourceMapOptions?.fullSource ?? source,
    sourceMapOptions?.sourceStart ?? 0,
  );

  return {
    code: rebuilt.code,
    map: rebuilt.map,
  };
}

export function transformTemplateExpression(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  const originalFilename = stripQuery(options.filename);
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}${source}${WRAPPED_SUFFIX}`,
    {
      extract: false,
      filename: `${options.filename}?expression`,
      inputSourceMap: buildPrefixedSnippetMap(
        sourceMapOptions?.fullSource ?? source,
        originalFilename,
        sourceMapOptions?.sourceStart ?? 0,
        `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`,
        source.length,
      ),
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

  const generated = generate(
    declaration.declarations[0].init,
    {
      comments: true,
      jsescOption: { minimal: true },
      retainLines: false,
      sourceMaps: true,
      sourceFileName: originalFilename,
    },
    transformed.code,
  );

  return {
    code: generated.code,
    map: sourceMapOptions
      ? buildGeneratedSnippetMap(
          sourceMapOptions.fullSource,
          originalFilename,
          sourceMapOptions.sourceStart,
          generated.code,
          source.length,
        )
      : ((generated.map as RawSourceMap | null | undefined) ?? null),
  };
}

export function transformComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
  const originalFilename = stripQuery(options.filename);
  const rewrittenSource = rewriteNestedComponentMacroExpressions(
    source,
    macroImports,
    options,
    sourceMapOptions,
  );
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${rewrittenSource.code}${WRAPPED_SUFFIX}`,
    {
      extract: false,
      filename: `${options.filename}?component`,
      inputSourceMap: buildPrefixedSnippetMap(
        sourceMapOptions?.fullSource ?? source,
        originalFilename,
        sourceMapOptions?.sourceStart ?? 0,
        `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n`,
        source.length,
      ),
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "astro-context",
      runtimeBinding: RUNTIME_BINDING_I18N,
    },
  );

  stripRuntimeTransImports(transformed.ast.program);
  const code = lowerSyntheticComponentDeclaration(
    transformed,
    RUNTIME_BINDING_RUNTIME_TRANS,
  );
  return {
    code,
    map: buildGeneratedSnippetMap(
      sourceMapOptions?.fullSource ?? source,
      originalFilename,
      sourceMapOptions?.sourceStart ?? 0,
      code,
      source.length,
    ),
  };
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
): { code: string; map: RawSourceMap | null } {
  return transformProgram(source, {
    extract: true,
    filename: `${options.filename}?frontmatter`,
    inputSourceMap: buildDirectProgramMap(
      fullSource,
      options.filename,
      sourceStart,
      source.length,
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
): { code: string; map: RawSourceMap | null } {
  const prefix = `${createSyntheticMacroImports(macroImports)}${EXPR_PREFIX}`;
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-expression`,
    inputSourceMap: buildPrefixedSnippetMap(
      fullSource,
      options.filename,
      sourceStart,
      prefix,
      source.length,
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
): { code: string; map: RawSourceMap | null } {
  const prefix = `${createSyntheticMacroImports(macroImports)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n`;
  return transformProgram(`${prefix}${source}${WRAPPED_SUFFIX}`, {
    extract: true,
    filename: `${options.filename}?extract-component`,
    inputSourceMap: buildPrefixedSnippetMap(
      fullSource,
      options.filename,
      sourceStart,
      prefix,
      source.length,
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
  sourceMapOptions?: {
    fullSource: string;
    sourceStart: number;
  },
): MappedSnippet {
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

      const expressionSource = source.slice(start, end);
      const transformed = transformTemplateExpression(
        expressionSource,
        macroImports,
        options,
        sourceMapOptions
          ? {
              fullSource: sourceMapOptions.fullSource,
              sourceStart: sourceMapOptions.sourceStart + start,
            }
          : {
              fullSource: source,
              sourceStart: start,
            },
      );

      if (transformed.code !== expressionSource) {
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

  const output = buildOutputWithIndexedMap(
    source,
    stripQuery(options.filename).split(/[\\/]/).at(-1) ??
      stripQuery(options.filename),
    replacements,
  );

  return output;
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

type SourceRange = {
  start: number;
  end: number;
};

function rebuildFrontmatterWithMappings(
  original: string,
  transformed: {
    code: string;
    ast: t.File;
  },
  mapFile: string,
  fullSource: string,
  sourceStart: number,
): MappedSnippet {
  const replacements = createFrontmatterReplacementChunks(
    original,
    transformed,
    fullSource,
    mapFile,
    sourceStart,
  );

  return buildOutputWithIndexedMap(original, mapFile, replacements);
}

function createFrontmatterReplacementChunks(
  original: string,
  transformed: {
    code: string;
    ast: t.File;
  },
  fullSource: string,
  mapFile: string,
  sourceStart: number,
): ReplacementChunk[] {
  const importRanges = collectMacroImportRanges(original);
  const originalMacroRanges = collectOriginalMacroExpressionRanges(original);
  const transformedCalls = collectTransformedRuntimeCallCodes(transformed);

  if (originalMacroRanges.length !== transformedCalls.length) {
    throw new Error(
      `Frontmatter transform replacement count mismatch: expected ${originalMacroRanges.length}, received ${transformedCalls.length}`,
    );
  }

  const replacements: ReplacementChunk[] = [];

  importRanges.forEach((range) => {
    replacements.push({
      start: range.start,
      end: range.end,
      code: "",
      map: null,
    });
  });

  originalMacroRanges.forEach((range, index) => {
    const code = transformedCalls[index];

    if (code == null) {
      throw new Error("Missing transformed runtime call for frontmatter macro");
    }

    replacements.push({
      start: range.start,
      end: range.end,
      code,
      map: buildGeneratedSnippetMap(
        fullSource,
        mapFile,
        sourceStart + range.start,
        code,
        range.end - range.start,
      ),
    });
  });

  return replacements.filter(
    (replacement) =>
      replacement.start !== replacement.end || replacement.code.length > 0,
  );
}

function collectMacroImportRanges(source: string): SourceRange[] {
  const file = parseSync(source, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
    },
  });

  if (!file || !t.isFile(file)) {
    return [];
  }

  const ranges: SourceRange[] = [];
  const traverse = getBabelTraverse();

  traverse(file, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const start = path.node.start;
      const end = path.node.end;

      if (
        path.node.source.value !== PACKAGE_MACRO ||
        start == null ||
        end == null
      ) {
        return;
      }

      let nextEnd = end;
      while (
        nextEnd < source.length &&
        (source[nextEnd] === "\n" || source[nextEnd] === "\r")
      ) {
        nextEnd += 1;
      }

      ranges.push({ start, end: nextEnd });
    },
  });

  return ranges;
}

function collectOriginalMacroExpressionRanges(source: string): SourceRange[] {
  const file = parseSync(source, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
    },
  });

  if (!file || !t.isFile(file)) {
    return [];
  }

  const ranges: SourceRange[] = [];
  const traverse = getBabelTraverse();

  traverse(file, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isOriginalMacroExpression(path)) {
        return;
      }

      const start = path.node.start;
      const end = path.node.end;
      if (start == null || end == null) {
        return;
      }

      ranges.push({ start, end });
      path.skip();
    },
    TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>) {
      if (!isOriginalMacroExpression(path)) {
        return;
      }

      const start = path.node.start;
      const end = path.node.end;
      if (start == null || end == null) {
        return;
      }

      ranges.push({ start, end });
      path.skip();
    },
  });

  return ranges.toSorted((left, right) => left.start - right.start);
}

function isOriginalMacroExpression(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
): boolean {
  const callee = path.isCallExpression() ? path.get("callee") : path.get("tag");

  if (!callee.isIdentifier()) {
    return false;
  }

  const binding = callee.scope.getBinding(callee.node.name);
  if (!binding?.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === PACKAGE_MACRO
  );
}

function collectTransformedRuntimeCallCodes(transformed: {
  code: string;
  ast: t.File;
}): string[] {
  const calls: string[] = [];
  const traverse = getBabelTraverse();

  traverse(transformed.ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (
        !t.isMemberExpression(path.node.callee) ||
        path.node.callee.computed ||
        !t.isIdentifier(path.node.callee.object, {
          name: RUNTIME_BINDING_I18N,
        }) ||
        !t.isIdentifier(path.node.callee.property, { name: "_" })
      ) {
        return;
      }

      calls.push(
        generate(path.node, {
          comments: true,
          jsescOption: { minimal: true },
          retainLines: false,
        }).code,
      );
      path.skip();
    },
  });

  return calls;
}
