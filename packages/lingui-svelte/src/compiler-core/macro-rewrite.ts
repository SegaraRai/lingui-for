import type { NodePath, PluginObj } from "@babel/core";
import * as t from "@babel/types";

import {
  MACRO_PACKAGE,
  REACTIVE_T_WRAPPER,
  RUNTIME_PACKAGE,
} from "./constants.ts";
import type { ProgramTransformRequest } from "./types.ts";

type MacroRewriteState = {
  runtimeTImports: Set<string>;
  tLocals: Set<string>;
};

function createInitialState(): MacroRewriteState {
  return {
    runtimeTImports: new Set<string>(),
    tLocals: new Set<string>(),
  };
}

function collectTLocals(program: t.Program): Set<string> {
  const tLocals = new Set<string>();

  program.body.forEach((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== MACRO_PACKAGE
    ) {
      return;
    }

    statement.specifiers.forEach((specifier) => {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "t" })
      ) {
        tLocals.add(specifier.local.name);
      }
    });
  });

  return tLocals;
}

function getReactiveLocalName(
  expression: t.Expression | t.V8IntrinsicIdentifier,
  tLocals: ReadonlySet<string>,
): string | null {
  if (!t.isIdentifier(expression)) {
    return null;
  }

  for (const localName of tLocals) {
    if (expression.name === `$${localName}`) {
      return localName;
    }
  }

  return null;
}

function isRawTranslation(
  expression: t.Expression | t.V8IntrinsicIdentifier,
  tLocals: ReadonlySet<string>,
): boolean {
  if (
    !t.isMemberExpression(expression) ||
    expression.computed ||
    !t.isIdentifier(expression.property, { name: "raw" }) ||
    !t.isIdentifier(expression.object)
  ) {
    return false;
  }

  return tLocals.has(expression.object.name);
}

function isWrappedReactiveCall(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
): boolean {
  return (
    path.parentPath.isCallExpression() &&
    t.isIdentifier(path.parentPath.node.callee, { name: REACTIVE_T_WRAPPER }) &&
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

  return t.callExpression(t.identifier(REACTIVE_T_WRAPPER), [
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

export function createMacroPreprocessPlugin(): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-svelte-macro-preprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.tLocals = collectTLocals(path.node);
        },
      },
      CallExpression(path, state) {
        if (isWrappedReactiveCall(path)) {
          return;
        }

        if (isRawTranslation(path.node.callee, state.tLocals)) {
          const callee = path.node.callee;
          if (t.isMemberExpression(callee) && t.isIdentifier(callee.object)) {
            path.get("callee").replaceWith(t.identifier(callee.object.name));
          }
          return;
        }

        const localName = getReactiveLocalName(path.node.callee, state.tLocals);
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

        if (isRawTranslation(path.node.tag, state.tLocals)) {
          const tag = path.node.tag;
          if (t.isMemberExpression(tag) && t.isIdentifier(tag.object)) {
            path.get("tag").replaceWith(t.identifier(tag.object.name));
          }
          return;
        }

        const localName = getReactiveLocalName(path.node.tag, state.tLocals);
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
      CallExpression(path, state) {
        if (!t.isIdentifier(path.node.callee, { name: REACTIVE_T_WRAPPER })) {
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

        state.runtimeTImports.add(localName);

        if (request.translationMode === "svelte-store") {
          path.replaceWith(
            t.callExpression(t.identifier(`$${localName}`), [
              t.cloneNode(descriptor),
            ]),
          );
          return;
        }

        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.identifier(localName), t.identifier("raw")),
            [t.cloneNode(descriptor)],
          ),
        );
      },
      Program: {
        exit(path, state) {
          if (request.translationMode === "extract") {
            return;
          }

          state.runtimeTImports.forEach((localName) => {
            ensureRuntimeTImport(path.node, localName);
          });
        },
      },
    },
  };
}
