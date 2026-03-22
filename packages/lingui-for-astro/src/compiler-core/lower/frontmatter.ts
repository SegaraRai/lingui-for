import type { NodePath } from "@babel/core";
import { parseSync } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  babelTraverse,
  buildOutputWithIndexedMap,
  LINGUI_TRANSLATE_METHOD,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { getParserPlugins, normalizeLinguiConfig } from "../shared/config.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  type AstroRuntimeBindings,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import type { LoweredSnippet } from "./common.ts";

type SourceRange = {
  start: number;
  end: number;
};

export function buildFrontmatterPrelude(
  includeAstroContext: boolean,
  includeRuntimeTrans: boolean,
  bindings: AstroRuntimeBindings,
): string {
  const lines: string[] = [];

  if (includeAstroContext) {
    lines.push(
      `import { createFrontmatterI18n as ${bindings.createI18n} } from "${PACKAGE_RUNTIME}";\n`,
      `const ${bindings.i18n} = ${bindings.createI18n}(Astro.locals);\n`,
    );
  }

  if (includeRuntimeTrans) {
    lines.push(
      `import { RuntimeTrans as ${bindings.runtimeTrans} } from "${PACKAGE_RUNTIME}";\n`,
    );
  }

  return lines.join("");
}

export function lowerFrontmatterMacros(
  source: string,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    runtimeBinding: string;
  },
): LoweredSnippet {
  const runtimeBinding = loweringOptions.runtimeBinding;

  if (loweringOptions.extract) {
    const transformed = transformProgram(source, {
      translationMode: "extract",
      filename: `${options.filename}?frontmatter`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      runtimeBinding: null,
    });
    return { code: transformed.code };
  }

  const transformed = transformProgram(source, {
    translationMode: "astro-context",
    filename: `${options.filename}?frontmatter`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    runtimeBinding,
  });

  return rebuildFrontmatterCode(source, transformed, runtimeBinding);
}

function rebuildFrontmatterCode(
  original: string,
  transformed: { code: string; ast: t.File },
  runtimeBinding: string,
): LoweredSnippet {
  const replacements = createFrontmatterReplacementChunks(
    original,
    transformed,
    runtimeBinding,
  );

  return { code: buildOutputWithIndexedMap(original, "", replacements).code };
}

function createFrontmatterReplacementChunks(
  original: string,
  transformed: { code: string; ast: t.File },
  runtimeBinding: string,
): ReplacementChunk[] {
  const importRanges = collectMacroImportRanges(original);
  const originalMacroRanges = collectOriginalMacroExpressionRanges(original);
  const transformedCalls = collectTransformedRuntimeCallCodes(
    transformed,
    runtimeBinding,
  );

  if (originalMacroRanges.length !== transformedCalls.length) {
    throw new Error(
      `Frontmatter transform replacement count mismatch: expected ${originalMacroRanges.length}, received ${transformedCalls.length}`,
    );
  }

  const replacements: ReplacementChunk[] = [];

  importRanges.forEach((range) => {
    replacements.push({ start: range.start, end: range.end, code: "" });
  });

  originalMacroRanges.forEach((range, index) => {
    const code = transformedCalls[index];

    if (code == null) {
      throw new Error("Missing transformed runtime call for frontmatter macro");
    }

    replacements.push({ start: range.start, end: range.end, code });
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

function collectTransformedRuntimeCallCodes(
  transformed: { code: string; ast: t.File },
  runtimeBinding: string,
): string[] {
  const calls: string[] = [];

  babelTraverse(transformed.ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (
        !t.isMemberExpression(path.node.callee) ||
        path.node.callee.computed ||
        !t.isIdentifier(path.node.callee.object, {
          name: runtimeBinding,
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
