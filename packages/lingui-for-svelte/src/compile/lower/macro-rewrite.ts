import type { NodePath, PluginObj } from "@babel/core";
import * as t from "@babel/types";

import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_TRANSLATE_METHOD,
} from "@lingui-for/internal-shared-compile";

import { PACKAGE_RUNTIME } from "../common/constants.ts";

export interface WrapperBindingsForTransform {
  reactiveTranslationWrapper: string;
  eagerTranslationWrapper: string;
}

export interface RuntimeBindingsForTransform extends WrapperBindingsForTransform {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
}

export type SvelteMacroPostprocessRequest =
  | {
      translationMode: "extract" | "lowered";
      wrapperBindings: WrapperBindingsForTransform;
    }
  | {
      translationMode: "contextual";
      runtimeBindings: RuntimeBindingsForTransform;
    };

interface MacroRewriteState {
  runtimeI18nLocals: ReadonlySet<string>;
}

function createInitialState(): MacroRewriteState {
  return {
    runtimeI18nLocals: new Set<string>(),
  };
}

function collectRuntimeI18nLocals(program: t.Program): Set<string> {
  const locals = new Set<string>();
  const runtimeSources = new Set([PACKAGE_RUNTIME, LINGUI_CORE_PACKAGE]);

  program.body.forEach((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      !runtimeSources.has(statement.source.value)
    ) {
      return;
    }

    statement.specifiers.forEach((specifier) => {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: LINGUI_I18N_EXPORT })
      ) {
        locals.add(specifier.local.name);
      }
    });
  });

  return locals;
}

function extractDescriptorArgument(
  expression: t.Expression | t.SpreadElement | t.ArgumentPlaceholder,
  localName: string,
): t.Expression | null {
  if (
    t.isCallExpression(expression) &&
    t.isIdentifier(expression.callee, { name: localName })
  ) {
    const directDescriptor = expression.arguments[0];
    return directDescriptor && t.isExpression(directDescriptor)
      ? directDescriptor
      : null;
  }

  if (
    !t.isCallExpression(expression) ||
    !t.isMemberExpression(expression.callee) ||
    expression.callee.computed ||
    !t.isIdentifier(expression.callee.property, {
      name: LINGUI_TRANSLATE_METHOD,
    })
  ) {
    return null;
  }

  const descriptor = expression.arguments[0];
  return descriptor && t.isExpression(descriptor) ? descriptor : null;
}

function isRuntimeI18nCall(path: NodePath<t.CallExpression>): boolean {
  const callee = path.get("callee");
  if (!callee.isMemberExpression() || callee.node.computed) {
    return false;
  }

  const object = callee.get("object");
  const property = callee.get("property");
  if (
    !object.isIdentifier() ||
    !property.isIdentifier({ name: LINGUI_TRANSLATE_METHOD })
  ) {
    return false;
  }

  const binding = object.scope.getBinding(object.node.name);
  if (!binding?.path.isImportSpecifier()) {
    return false;
  }

  const importSpecifier = binding.path.node;
  if (
    !t.isIdentifier(importSpecifier.imported, { name: LINGUI_I18N_EXPORT }) ||
    !binding.path.parentPath.isImportDeclaration()
  ) {
    return false;
  }

  return (
    binding.path.parentPath.node.source.value === PACKAGE_RUNTIME ||
    binding.path.parentPath.node.source.value === LINGUI_CORE_PACKAGE
  );
}

function removeRuntimeI18nImports(
  program: t.Program,
  runtimeI18nLocals: ReadonlySet<string>,
): void {
  if (runtimeI18nLocals.size === 0) {
    return;
  }

  const runtimeSources = new Set([PACKAGE_RUNTIME, LINGUI_CORE_PACKAGE]);

  program.body = program.body.flatMap((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      !runtimeSources.has(statement.source.value)
    ) {
      return [statement];
    }

    statement.specifiers = statement.specifiers.filter((specifier) => {
      return !(
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: LINGUI_I18N_EXPORT }) &&
        t.isIdentifier(specifier.local) &&
        runtimeI18nLocals.has(specifier.local.name)
      );
    });

    return statement.specifiers.length > 0 ? [statement] : [];
  });
}

/**
 * Creates the Babel postprocessing plugin that adapts Lingui's output to this project's target mode.
 *
 * Rust prepares the synthetic source before Babel runs. This plugin only unwraps the
 * stable wrapper calls that survive Lingui and rewrites runtime access into the final
 * Svelte-oriented form.
 */
export function createSvelteMacroPostprocessPlugin(
  request: SvelteMacroPostprocessRequest,
): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-for-svelte-macro-postprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        exit(path, state) {
          if (request.translationMode === "contextual") {
            state.runtimeI18nLocals = collectRuntimeI18nLocals(path.node);
            removeRuntimeI18nImports(path.node, state.runtimeI18nLocals);
          }
        },
      },
      CallExpression(path) {
        if (
          request.translationMode === "contextual" &&
          isRuntimeI18nCall(path)
        ) {
          if (t.isMemberExpression(path.node.callee)) {
            path.node.callee.object = t.callExpression(
              t.identifier(request.runtimeBindings.getI18n),
              [],
            );
          }
        }

        if (
          t.isIdentifier(path.node.callee, {
            name:
              request.translationMode === "contextual"
                ? request.runtimeBindings.eagerTranslationWrapper
                : request.wrapperBindings.eagerTranslationWrapper,
          })
        ) {
          const [translated] = path.node.arguments;
          if (translated && t.isExpression(translated)) {
            path.replaceWith(t.cloneNode(translated));
          }
          return;
        }

        if (
          !t.isIdentifier(path.node.callee, {
            name:
              request.translationMode === "contextual"
                ? request.runtimeBindings.reactiveTranslationWrapper
                : request.wrapperBindings.reactiveTranslationWrapper,
          })
        ) {
          return;
        }

        const [translated, localNameArgument] = path.node.arguments;
        if (
          !translated ||
          !localNameArgument ||
          !t.isStringLiteral(localNameArgument)
        ) {
          return;
        }

        const localName = localNameArgument.value;
        const descriptor = extractDescriptorArgument(translated, localName);
        if (!descriptor) {
          return;
        }

        if (request.translationMode === "extract") {
          path.replaceWith(t.cloneNode(translated));
          return;
        }

        if (request.translationMode === "contextual") {
          path.replaceWith(
            t.callExpression(
              t.identifier(`$${request.runtimeBindings.translate}`),
              [t.cloneNode(descriptor)],
            ),
          );
        }
      },
    },
  };
}
