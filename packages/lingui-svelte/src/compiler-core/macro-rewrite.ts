import type { NodePath, PluginObj } from "@babel/core";
import * as t from "@babel/types";

import {
  MACRO_PACKAGE,
  REACTIVE_TRANSLATION_WRAPPER,
  RUNTIME_PACKAGE,
  SYNTHETIC_EXPRESSION_PREFIX,
} from "./constants.ts";
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

function collectMacroLocals(
  program: t.Program,
  importedNames: readonly string[],
): Set<string> {
  const locals = new Set<string>();

  program.body.forEach((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== MACRO_PACKAGE
    ) {
      return;
    }

    statement.specifiers.forEach((specifier) => {
      if (!t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) {
        return;
      }

      if (importedNames.includes(specifier.imported.name)) {
        locals.add(specifier.local.name);
      }
    });
  });

  return locals;
}

function collectRuntimeI18nLocals(program: t.Program): Set<string> {
  const locals = new Set<string>();

  program.body.forEach((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== RUNTIME_PACKAGE
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
      statement.source.value === RUNTIME_PACKAGE,
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
    t.stringLiteral(RUNTIME_PACKAGE),
  );

  if (firstImportIndex === -1) {
    program.body.unshift(importDeclaration);
    return;
  }

  program.body.splice(firstImportIndex, 0, importDeclaration);
}

function isRuntimeI18nCall(
  node: t.CallExpression,
  runtimeI18nLocals: ReadonlySet<string>,
): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.object) &&
    runtimeI18nLocals.has(node.callee.object.name) &&
    t.isIdentifier(node.callee.property, { name: "_" })
  );
}

function isInsideSyntheticExpression(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
): boolean {
  const declarator = path.findParent((ancestor) => ancestor.isVariableDeclarator());

  return (
    declarator?.isVariableDeclarator() === true &&
    t.isIdentifier(declarator.node.id) &&
    declarator.node.id.name.startsWith(SYNTHETIC_EXPRESSION_PREFIX)
  );
}

function removeRuntimeI18nImports(
  program: t.Program,
  runtimeI18nLocals: ReadonlySet<string>,
): void {
  if (runtimeI18nLocals.size === 0) {
    return;
  }

  program.body = program.body.flatMap((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== RUNTIME_PACKAGE
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

export function createMacroPreprocessPlugin(): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-svelte-macro-preprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.tLocals = collectMacroLocals(path.node, ["t"]);
          state.reactiveStringLocals = collectMacroLocals(path.node, [
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

export function createMacroPostprocessPlugin(
  request: ProgramTransformRequest,
): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-svelte-macro-postprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.runtimeI18nLocals = collectRuntimeI18nLocals(path.node);
        },
        exit(path, state) {
          if (request.translationMode === "svelte-context") {
            removeRuntimeI18nImports(path.node, state.runtimeI18nLocals);
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
          isRuntimeI18nCall(path.node, state.runtimeI18nLocals)
        ) {
          if (t.isMemberExpression(path.node.callee)) {
            path.node.callee.object = t.identifier(request.runtimeBindings.i18n);
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

        if (request.translationMode === "svelte-context" && request.runtimeBindings) {
          const reactiveCall = t.callExpression(
            t.identifier(`$${request.runtimeBindings.translate}`),
            [t.cloneNode(descriptor)],
          );

          path.replaceWith(
            isInsideSyntheticExpression(path)
              ? reactiveCall
              : t.callExpression(t.identifier("$derived"), [reactiveCall]),
          );
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
