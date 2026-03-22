import type { PluginObj } from "@babel/core";
import { transformSync } from "@babel/core";
import * as t from "@babel/types";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_TRANSLATE_METHOD,
  toBabelInputSourceMap,
} from "lingui-for-shared/compiler";

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
              statement.source.value !== LINGUI_CORE_PACKAGE
            ) {
              return;
            }

            statement.specifiers.forEach((specifier) => {
              if (
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported, { name: LINGUI_I18N_EXPORT })
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
              statement.source.value !== LINGUI_CORE_PACKAGE
            ) {
              return [statement];
            }

            statement.specifiers = statement.specifiers.filter((specifier) => {
              return !(
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported, {
                  name: LINGUI_I18N_EXPORT,
                }) &&
                state.runtimeI18nLocals.has(specifier.local.name)
              );
            });

            return statement.specifiers.length > 0 ? [statement] : [];
          });
        },
      },
      CallExpression(path, state) {
        if (request.translationMode !== "astro-context") {
          return;
        }

        if (
          !t.isMemberExpression(path.node.callee) ||
          path.node.callee.computed ||
          !t.isIdentifier(path.node.callee.object) ||
          !state.runtimeI18nLocals.has(path.node.callee.object.name) ||
          !t.isIdentifier(path.node.callee.property, {
            name: LINGUI_TRANSLATE_METHOD,
          })
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
  const extract = request.translationMode === "extract";
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
          extract,
          linguiConfig: request.linguiConfig,
          stripMessageField: extract ? false : undefined,
        },
      ],
      createAstroContextPostprocessPlugin(request),
    ],
    inputSourceMap: request.inputSourceMap
      ? toBabelInputSourceMap(request.inputSourceMap)
      : undefined,
    sourceMaps: true,
  });

  if (!result?.ast || result.code == null) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: (result.map as EncodedSourceMap | null | undefined) ?? null,
  };
}
