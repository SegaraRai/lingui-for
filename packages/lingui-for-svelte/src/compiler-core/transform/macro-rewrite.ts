import type { NodePath, PluginObj } from "@babel/core";
import * as t from "@babel/types";

import {
  PACKAGE_RUNTIME,
  REACTIVE_TRANSLATION_WRAPPER,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "../shared/constants.ts";
import { collectMacroImportLocals } from "../shared/macro-bindings.ts";
import type { ProgramTransformRequest } from "./types.ts";

type MacroRewriteState = {
  runtimeTImports: Set<string>;
  tLocals: Set<string>;
  reactiveStringLocals: Set<string>;
  runtimeI18nLocals: Set<string>;
};

function createInitialState(): MacroRewriteState {
  return {
    runtimeTImports: new Set<string>(),
    tLocals: new Set<string>(),
    reactiveStringLocals: new Set<string>(),
    runtimeI18nLocals: new Set<string>(),
  };
}

function collectRuntimeI18nLocals(program: t.Program): Set<string> {
  const locals = new Set<string>();
  const runtimeSources = new Set([PACKAGE_RUNTIME, "@lingui/core"]);

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
        t.isIdentifier(specifier.imported, { name: "i18n" })
      ) {
        locals.add(specifier.local.name);
      }
    });
  });

  return locals;
}

function getReactiveLocalName(
  expression: t.Expression | t.V8IntrinsicIdentifier,
  reactiveStringLocals: ReadonlySet<string>,
): string | null {
  if (!t.isIdentifier(expression)) {
    return null;
  }

  for (const localName of reactiveStringLocals) {
    if (expression.name === `$${localName}`) {
      return localName;
    }
  }

  return null;
}

function isWrappedReactiveCall(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
): boolean {
  return (
    path.parentPath.isCallExpression() &&
    t.isIdentifier(path.parentPath.node.callee, {
      name: REACTIVE_TRANSLATION_WRAPPER,
    }) &&
    path.parentPath.node.arguments[0] === path.node
  );
}

function wrapReactiveTranslation(
  node: t.CallExpression | t.TaggedTemplateExpression,
  localName: string,
): t.CallExpression {
  const inner = t.isCallExpression(node)
    ? t.callExpression(t.identifier(localName), node.arguments)
    : t.taggedTemplateExpression(t.identifier(localName), node.quasi);

  return t.callExpression(t.identifier(REACTIVE_TRANSLATION_WRAPPER), [
    inner,
    t.stringLiteral(localName),
  ]);
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
    !t.isIdentifier(expression.callee.property, { name: "_" })
  ) {
    return null;
  }

  const descriptor = expression.arguments[0];
  return descriptor && t.isExpression(descriptor) ? descriptor : null;
}

function ensureRuntimeTImport(program: t.Program, localName: string): void {
  const runtimeImport = program.body.find(
    (statement): statement is t.ImportDeclaration =>
      t.isImportDeclaration(statement) &&
      statement.source.value === PACKAGE_RUNTIME,
  );

  const specifier = t.importSpecifier(
    t.identifier(localName),
    t.identifier("t"),
  );

  if (runtimeImport) {
    const hasSpecifier = runtimeImport.specifiers.some(
      (existing) =>
        t.isImportSpecifier(existing) &&
        t.isIdentifier(existing.imported, { name: "t" }) &&
        t.isIdentifier(existing.local, { name: localName }),
    );

    if (!hasSpecifier) {
      runtimeImport.specifiers.push(specifier);
    }

    return;
  }

  const firstImportIndex = program.body.findIndex((statement) =>
    t.isImportDeclaration(statement),
  );

  const importDeclaration = t.importDeclaration(
    [specifier],
    t.stringLiteral(PACKAGE_RUNTIME),
  );

  if (firstImportIndex === -1) {
    program.body.unshift(importDeclaration);
    return;
  }

  program.body.splice(firstImportIndex, 0, importDeclaration);
}

function isRuntimeI18nCall(path: NodePath<t.CallExpression>): boolean {
  const callee = path.get("callee");
  if (!callee.isMemberExpression() || callee.node.computed) {
    return false;
  }

  const object = callee.get("object");
  const property = callee.get("property");
  if (!object.isIdentifier() || !property.isIdentifier({ name: "_" })) {
    return false;
  }

  const binding = object.scope.getBinding(object.node.name);
  if (!binding?.path.isImportSpecifier()) {
    return false;
  }

  const importSpecifier = binding.path.node;
  if (
    !t.isIdentifier(importSpecifier.imported, { name: "i18n" }) ||
    !binding.path.parentPath.isImportDeclaration()
  ) {
    return false;
  }

  return (
    binding.path.parentPath.node.source.value === PACKAGE_RUNTIME ||
    binding.path.parentPath.node.source.value === "@lingui/core"
  );
}

function isDerivedCall(node: t.Expression): boolean {
  return (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee, { name: "$derived" })
  );
}

function isReactiveTranslatorCall(
  node: t.CallExpression,
  translateBinding: string,
): boolean {
  return t.isIdentifier(node.callee, { name: `$${translateBinding}` });
}

function isTopLevelVariableDeclarator(
  path: NodePath<t.VariableDeclarator>,
): boolean {
  const variableDeclaration = path.parentPath;
  if (!variableDeclaration.isVariableDeclaration()) {
    return false;
  }

  const statement = variableDeclaration.parentPath;
  return (
    statement.isProgram() ||
    (statement.isExportNamedDeclaration() &&
      statement.parentPath?.isProgram() === true)
  );
}

function initializerContainsReactiveTranslation(
  init: NodePath<t.Expression>,
  translateBinding: string,
): boolean {
  if (
    init.isCallExpression() &&
    isReactiveTranslatorCall(init.node, translateBinding)
  ) {
    return true;
  }

  if (init.isFunctionExpression() || init.isArrowFunctionExpression()) {
    return false;
  }

  let containsReactiveTranslation = false;

  init.traverse({
    Function(path) {
      path.skip();
    },
    CallExpression(path) {
      if (isReactiveTranslatorCall(path.node, translateBinding)) {
        containsReactiveTranslation = true;
        path.stop();
      }
    },
  });

  return containsReactiveTranslation;
}

function wrapTopLevelReactiveInitializers(
  programPath: NodePath<t.Program>,
  translateBinding: string,
): void {
  programPath.traverse({
    Function(path) {
      path.skip();
    },
    VariableDeclarator(path) {
      if (!isTopLevelVariableDeclarator(path)) {
        return;
      }

      if (
        t.isIdentifier(path.node.id) &&
        path.node.id.name.startsWith(SYNTHETIC_PREFIX_EXPRESSION)
      ) {
        return;
      }

      const init = path.get("init");
      if (!init.node || !init.isExpression() || isDerivedCall(init.node)) {
        return;
      }

      if (!initializerContainsReactiveTranslation(init, translateBinding)) {
        return;
      }

      init.replaceWith(
        t.callExpression(t.identifier("$derived"), [t.cloneNode(init.node)]),
      );
    },
  });
}

function removeRuntimeI18nImports(
  program: t.Program,
  runtimeI18nLocals: ReadonlySet<string>,
): void {
  if (runtimeI18nLocals.size === 0) {
    return;
  }

  const runtimeSources = new Set([PACKAGE_RUNTIME, "@lingui/core"]);

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
        t.isIdentifier(specifier.imported, { name: "i18n" }) &&
        t.isIdentifier(specifier.local) &&
        runtimeI18nLocals.has(specifier.local.name)
      );
    });

    return statement.specifiers.length > 0 ? [statement] : [];
  });
}

/**
 * Creates the Babel preprocessing plugin that marks reactive Lingui calls before the official
 * Lingui macro transform runs.
 *
 * @returns A Babel plugin object operating on the current program.
 *
 * The plugin collects imported reactive string macro locals such as `t`, `plural`, `select`,
 * and `selectOrdinal`, then rewrites `$t(...)` / `$t\`...\`` and friends into a temporary
 * wrapper call so the following Lingui pass can preserve enough information for postprocessing.
 */
export function createMacroPreprocessPlugin(): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-for-svelte-macro-preprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.tLocals = collectMacroImportLocals(path.node, ["t"]);
          state.reactiveStringLocals = collectMacroImportLocals(path.node, [
            "t",
            "plural",
            "select",
            "selectOrdinal",
          ]);
        },
      },
      CallExpression(path, state) {
        if (isWrappedReactiveCall(path)) {
          return;
        }

        const localName = getReactiveLocalName(
          path.node.callee,
          state.reactiveStringLocals,
        );
        if (!localName) {
          return;
        }

        path.replaceWith(wrapReactiveTranslation(path.node, localName));
        path.skip();
      },
      TaggedTemplateExpression(path, state) {
        if (isWrappedReactiveCall(path)) {
          return;
        }

        const localName = getReactiveLocalName(
          path.node.tag,
          state.reactiveStringLocals,
        );
        if (!localName) {
          return;
        }

        path.replaceWith(wrapReactiveTranslation(path.node, localName));
        path.skip();
      },
    },
  };
}

/**
 * Creates the Babel postprocessing plugin that adapts Lingui's output to this project's target mode.
 *
 * @param request Transform request describing extraction/raw/Svelte-context mode and runtime bindings.
 * @returns A Babel plugin object operating on the transformed program.
 *
 * Depending on `request.translationMode`, this plugin unwraps the temporary reactive wrapper,
 * rewrites translations into extraction-safe, raw, or Svelte-context forms, adjusts runtime
 * imports, and wraps eligible top-level reactive initializers for Svelte output.
 */
export function createMacroPostprocessPlugin(
  request: ProgramTransformRequest,
): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-for-svelte-macro-postprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        exit(path, state) {
          if (request.translationMode === "svelte-context") {
            state.runtimeI18nLocals = collectRuntimeI18nLocals(path.node);
            removeRuntimeI18nImports(path.node, state.runtimeI18nLocals);
            if (request.runtimeBindings) {
              wrapTopLevelReactiveInitializers(
                path,
                request.runtimeBindings.translate,
              );
            }
          }

          if (request.translationMode === "extract") {
            return;
          }

          state.runtimeTImports.forEach((localName) => {
            ensureRuntimeTImport(path.node, localName);
          });
        },
      },
      CallExpression(path, state) {
        if (
          request.translationMode === "svelte-context" &&
          request.runtimeBindings &&
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
          !t.isIdentifier(path.node.callee, {
            name: REACTIVE_TRANSLATION_WRAPPER,
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

        if (
          request.translationMode === "svelte-context" &&
          request.runtimeBindings
        ) {
          const reactiveCall = t.callExpression(
            t.identifier(`$${request.runtimeBindings.translate}`),
            [t.cloneNode(descriptor)],
          );

          path.replaceWith(reactiveCall);
          return;
        }

        state.runtimeTImports.add(localName);

        path.replaceWith(
          t.callExpression(t.identifier(localName), [t.cloneNode(descriptor)]),
        );
      },
    },
  };
}
