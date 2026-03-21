import type { NodePath } from "@babel/core";
import { parseSync } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  babelTraverse,
  buildDirectProgramMap,
  buildGeneratedSnippetMap,
  buildOutputWithIndexedMap,
  LINGUI_TRANSLATE_METHOD,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { getParserPlugins, normalizeLinguiConfig } from "../shared/config.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_LINGUI_CONTEXT,
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import type { LoweredSnippet, LoweringSourceMapOptions } from "./common.ts";

type SourceRange = {
  start: number;
  end: number;
};

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

export function lowerFrontmatterMacros(
  source: string,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    sourceMapOptions?: LoweringSourceMapOptions;
  },
): LoweredSnippet {
  const transformed = transformProgram(source, {
    extract: loweringOptions.extract,
    filename: `${options.filename}?frontmatter`,
    inputSourceMap: loweringOptions.sourceMapOptions
      ? buildDirectProgramMap(
          loweringOptions.sourceMapOptions.fullSource,
          options.filename,
          loweringOptions.sourceMapOptions.sourceStart,
          source.length,
        )
      : undefined,
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

  return rebuildFrontmatterWithMappings(
    source,
    transformed,
    options.filename,
    loweringOptions.sourceMapOptions?.fullSource ?? source,
    loweringOptions.sourceMapOptions?.sourceStart ?? 0,
  );
}

function rebuildFrontmatterWithMappings(
  original: string,
  transformed: {
    code: string;
    ast: t.File;
  },
  mapFile: string,
  fullSource: string,
  sourceStart: number,
): LoweredSnippet {
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

  babelTraverse(file, {
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

  babelTraverse(file, {
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

  babelTraverse(transformed.ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (
        !t.isMemberExpression(path.node.callee) ||
        path.node.callee.computed ||
        !t.isIdentifier(path.node.callee.object, {
          name: RUNTIME_BINDING_I18N,
        }) ||
        !t.isIdentifier(path.node.callee.property, {
          name: LINGUI_TRANSLATE_METHOD,
        })
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
