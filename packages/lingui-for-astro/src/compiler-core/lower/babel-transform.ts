import type { PluginObj } from "@babel/core";
import { transformSync } from "@babel/core";
import * as t from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import type { SourceMap } from "lingui-for-shared/compiler";

import { getParserPlugins } from "../shared/config.ts";
import type { ProgramTransform, ProgramTransformRequest } from "./types.ts";

function createAstroContextPostprocessPlugin(
  request: ProgramTransformRequest,
): PluginObj<{ runtimeI18nLocals: Set<string> }> {
  return {
    name: "lingui-for-astro-postprocess",
    pre() {
      this.runtimeI18nLocals = new Set<string>();
    },
    visitor: {
      Program: {
        enter(path, state) {
          path.node.body.forEach((statement) => {
            if (
              !t.isImportDeclaration(statement) ||
              statement.source.value !== "@lingui/core"
            ) {
              return;
            }

            statement.specifiers.forEach((specifier) => {
              if (
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported, { name: "i18n" })
              ) {
                state.runtimeI18nLocals.add(specifier.local.name);
              }
            });
          });
        },
        exit(path, state) {
          if (request.translationMode !== "astro-context") {
            return;
          }

          path.node.body = path.node.body.flatMap((statement) => {
            if (
              !t.isImportDeclaration(statement) ||
              statement.source.value !== "@lingui/core"
            ) {
              return [statement];
            }

            statement.specifiers = statement.specifiers.filter((specifier) => {
              return !(
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported, { name: "i18n" }) &&
                state.runtimeI18nLocals.has(specifier.local.name)
              );
            });

            return statement.specifiers.length > 0 ? [statement] : [];
          });
        },
      },
      CallExpression(path, state) {
        if (
          request.translationMode !== "astro-context" ||
          !request.runtimeBinding
        ) {
          return;
        }

        if (
          !t.isMemberExpression(path.node.callee) ||
          path.node.callee.computed ||
          !t.isIdentifier(path.node.callee.object) ||
          !state.runtimeI18nLocals.has(path.node.callee.object.name) ||
          !t.isIdentifier(path.node.callee.property, { name: "_" })
        ) {
          return;
        }

        path.node.callee.object = t.identifier(request.runtimeBinding);
      },
    },
  };
}

export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
): ProgramTransform {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    sourceFileName: request.filename,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(),
    },
    plugins: [
      [
        linguiMacroPlugin,
        {
          extract: request.extract,
          linguiConfig: request.linguiConfig,
          stripMessageField: request.extract ? false : undefined,
        },
      ],
      createAstroContextPostprocessPlugin(request),
    ],
    inputSourceMap: request.inputSourceMap,
    sourceMaps: true,
  });

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: (result.map as SourceMap | null | undefined) ?? null,
  };
}
