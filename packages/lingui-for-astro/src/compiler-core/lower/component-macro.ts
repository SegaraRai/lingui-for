import { type NodePath, transformSync } from "@babel/core";
import * as t from "@babel/types";

import {
  babelTraverse,
  buildOutputWithIndexedMap,
  createMappedOutput,
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  type AstroRuntimeBindings,
  PACKAGE_RUNTIME,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import {
  createComponentWrapperPrefix,
  type LoweredSnippet,
  WRAPPED_SUFFIX,
} from "./common.ts";
import { lowerTemplateExpression } from "./template-expression.ts";

export function lowerComponentMacro(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  loweringOptions: {
    extract: boolean;
    runtimeBindings: Pick<AstroRuntimeBindings, "i18n" | "runtimeTrans">;
  },
): LoweredSnippet {
  const bindings = loweringOptions.runtimeBindings;
  const rewrittenSource = rewriteNestedComponentMacroExpressions(
    source,
    macroImports,
    options,
    bindings.i18n,
  );
  const prefix = createComponentWrapperPrefix(macroImports);

  if (loweringOptions.extract) {
    const transformed = transformProgram(
      `${prefix}${rewrittenSource.code}${WRAPPED_SUFFIX}`,
      {
        translationMode: "extract",
        filename: `${options.filename}?extract-component`,
        linguiConfig: normalizeLinguiConfig(options.linguiConfig),
        runtimeBinding: null,
      },
    );
    const syntheticDecl = transformed.ast.program.body.find(
      (stmt): stmt is import("@babel/types").VariableDeclaration =>
        stmt.type === "VariableDeclaration" &&
        stmt.declarations.length === 1 &&
        stmt.declarations[0]?.id.type === "Identifier" &&
        stmt.declarations[0].id.name.startsWith(SYNTHETIC_PREFIX_COMPONENT) &&
        stmt.declarations[0].init != null,
    );
    if (syntheticDecl) {
      const init = syntheticDecl.declarations[0]!.init!;
      const fragment = createMappedOutput(init, transformed);
      return {
        code: `const ${SYNTHETIC_PREFIX_COMPONENT}0 = ${fragment.code};`,
      };
    }
    return { code: transformed.code };
  }

  const transformed = transformProgram(
    `${prefix}${rewrittenSource.code}${WRAPPED_SUFFIX}`,
    {
      translationMode: "astro-context",
      filename: `${options.filename}?component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      runtimeBinding: bindings.i18n,
    },
  );

  stripRuntimeTransImports(transformed.ast.program, PACKAGE_RUNTIME);
  const code = lowerSyntheticComponentDeclaration(
    transformed,
    bindings.runtimeTrans,
    SYNTHETIC_PREFIX_COMPONENT,
  );
  return { code };
}

function rewriteNestedComponentMacroExpressions(
  source: string,
  macroImports: ReadonlyMap<string, string>,
  options: LinguiAstroTransformOptions,
  runtimeBinding: string,
): LoweredSnippet {
  if (macroImports.size === 0) {
    return { code: source };
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
    return { code: source };
  }

  const offset = prefix.length;
  const replacements: ReplacementChunk[] = [];

  babelTraverse(parsed.ast, {
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

      const transformed = lowerTemplateExpression(
        source.slice(start, end),
        macroImports,
        options,
        {
          extract: false,
          runtimeBinding,
        },
      );

      if (transformed.code !== source.slice(start, end)) {
        replacements.push({ start, end, code: transformed.code });
      }
    },
  });

  if (replacements.length === 0) {
    return { code: source };
  }

  return {
    code: buildOutputWithIndexedMap(source, options.filename, replacements)
      .code,
  };
}
