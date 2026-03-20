import type { NodePath, PluginObj } from "@babel/core";
import * as t from "@babel/types";

import {
  EAGER_TRANSLATION_WRAPPER,
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  REACTIVE_TRANSLATION_WRAPPER,
} from "../shared/constants.ts";
import { collectMacroImportLocals } from "../shared/macro-bindings.ts";
import type { ProgramTransformRequest } from "./types.ts";

type MacroRewriteState = {
  descriptorContainerLocals: ReadonlySet<string>;
  directStringLocals: ReadonlySet<string>;
  runtimeTImports: Set<string>;
  tLocals: ReadonlySet<string>;
  reactiveStringLocals: ReadonlySet<string>;
  runtimeI18nLocals: ReadonlySet<string>;
};

function createInitialState(): MacroRewriteState {
  return {
    descriptorContainerLocals: new Set<string>(),
    directStringLocals: new Set<string>(),
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

function isMacroImportBinding(
  binding: ReturnType<NodePath<t.Identifier>["scope"]["getBinding"]>,
  allowedLocals: ReadonlySet<string>,
): boolean {
  if (!binding || !allowedLocals.has(binding.identifier.name)) {
    return false;
  }

  if (!binding.path.isImportSpecifier()) {
    return false;
  }

  const importDeclaration = binding.path.parentPath;
  return (
    importDeclaration?.isImportDeclaration() === true &&
    importDeclaration.node.source.value === PACKAGE_MACRO
  );
}

function getImportedMacroLocalName(
  expression: NodePath<t.Expression | t.V8IntrinsicIdentifier>,
  allowedLocals: ReadonlySet<string>,
): string | null {
  if (!expression.isIdentifier()) {
    return null;
  }

  const binding = expression.scope.getBinding(expression.node.name);
  return isMacroImportBinding(binding, allowedLocals)
    ? expression.node.name
    : null;
}

function getReactiveLocalName(
  expression: NodePath<t.Expression | t.V8IntrinsicIdentifier>,
  reactiveStringLocals: ReadonlySet<string>,
): string | null {
  if (!expression.isIdentifier()) {
    return null;
  }

  const { name } = expression.node;
  if (!name.startsWith("$") || expression.scope.hasBinding(name)) {
    return null;
  }

  const localName = name.slice(1);
  return isMacroImportBinding(
    expression.scope.getBinding(localName),
    reactiveStringLocals,
  )
    ? localName
    : null;
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

function isWrappedImmediateTranslation(path: NodePath<t.Expression>): boolean {
  return (
    path.parentPath.isCallExpression() &&
    t.isIdentifier(path.parentPath.node.callee, {
      name: EAGER_TRANSLATION_WRAPPER,
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

function wrapImmediateTranslation(node: t.Expression): t.CallExpression {
  return t.callExpression(t.identifier(EAGER_TRANSLATION_WRAPPER), [node]);
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

function getDirectStringLocalName(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  directStringLocals: ReadonlySet<string>,
): string | null {
  if (path.isCallExpression()) {
    return getImportedMacroLocalName(path.get("callee"), directStringLocals);
  }

  return getImportedMacroLocalName(path.get("tag"), directStringLocals);
}

function getEagerDirectStringLocalName(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  directStringLocals: ReadonlySet<string>,
): string | null {
  const member = path.isCallExpression() ? path.get("callee") : path.get("tag");

  if (!member.isMemberExpression() || member.node.computed) {
    return null;
  }

  const property = member.get("property");
  if (!property.isIdentifier({ name: "eager" })) {
    return null;
  }

  const object = member.get("object");
  if (!object.isIdentifier()) {
    return null;
  }

  return getImportedMacroLocalName(object, directStringLocals);
}

function isAllowedDescriptorContext(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  descriptorContainerLocals: ReadonlySet<string>,
): boolean {
  let current: NodePath<t.Node> | null = path.parentPath;

  while (current) {
    if (current.isObjectProperty()) {
      const key = current.get("key");

      if (
        (!current.node.computed && key.isIdentifier({ name: "message" })) ||
        key.isStringLiteral({ value: "message" })
      ) {
        return true;
      }
    }

    if (current.isCallExpression() || current.isTaggedTemplateExpression()) {
      const localName = getDirectStringLocalName(
        current,
        descriptorContainerLocals,
      );

      if (localName) {
        return true;
      }
    }

    current = current.parentPath;
  }

  return false;
}

function assertAllowedDirectStringMacroUsage(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  localName: string,
  state: MacroRewriteState,
): void {
  if (
    localName !== "t" &&
    isAllowedDescriptorContext(path, state.descriptorContainerLocals)
  ) {
    return;
  }

  const reactiveName = `$${localName}`;
  const replacement =
    localName === "t"
      ? `\`$${localName}(...)\`, \`$${localName}\`...\`\`, \`${localName}.eager(...)\`, or \`${localName}.eager\`...\`\``
      : `\`${reactiveName}(...)\` or \`${localName}.eager(...)\``;
  const detail =
    localName === "t"
      ? "Bare `t` in `.svelte` files is not allowed because it loses locale reactivity."
      : `Bare \`${localName}\` in \`.svelte\` files is only allowed when building a descriptor, for example inside \`msg(...)\`, \`defineMessage(...)\`, \`$t(...)\`, or a \`message:\` field.`;

  throw path.buildCodeFrameError(`${detail} Use ${replacement} instead.`);
}

function buildDirectStringMacroFromEager(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  localName: string,
): t.CallExpression | t.TaggedTemplateExpression {
  if (path.isCallExpression()) {
    return t.callExpression(t.identifier(localName), path.node.arguments);
  }

  if (!path.isTaggedTemplateExpression()) {
    throw new Error("Expected an eager direct string macro expression.");
  }

  return t.taggedTemplateExpression(t.identifier(localName), path.node.quasi);
}

function wrapEagerDirectTranslation(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  state: MacroRewriteState,
): boolean {
  const localName = getEagerDirectStringLocalName(
    path,
    state.directStringLocals,
  );
  if (!localName) {
    return false;
  }

  path.replaceWith(
    wrapImmediateTranslation(buildDirectStringMacroFromEager(path, localName)),
  );
  path.skip();
  return true;
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
export function createMacroPreprocessPlugin(
  request: ProgramTransformRequest,
): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-for-svelte-macro-preprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.tLocals = collectMacroImportLocals(path.node, ["t"]);
          state.directStringLocals = collectMacroImportLocals(path.node, [
            "t",
            "plural",
            "select",
            "selectOrdinal",
          ]);
          state.descriptorContainerLocals = collectMacroImportLocals(
            path.node,
            ["t", "msg", "defineMessage", "plural", "select", "selectOrdinal"],
          );
          state.reactiveStringLocals = collectMacroImportLocals(path.node, [
            "t",
            "plural",
            "select",
            "selectOrdinal",
          ]);
        },
      },
      CallExpression(path, state) {
        if (
          isWrappedReactiveCall(path) ||
          isWrappedImmediateTranslation(path)
        ) {
          return;
        }

        if (wrapEagerDirectTranslation(path, state)) {
          return;
        }

        const localName = getReactiveLocalName(
          path.get("callee"),
          state.reactiveStringLocals,
        );
        if (!localName) {
          const directLocalName = getDirectStringLocalName(
            path,
            state.directStringLocals,
          );
          if (directLocalName) {
            assertAllowedDirectStringMacroUsage(path, directLocalName, state);
          }
          return;
        }

        path.replaceWith(wrapReactiveTranslation(path.node, localName));
        path.skip();
      },
      TaggedTemplateExpression(path, state) {
        if (
          isWrappedReactiveCall(path) ||
          isWrappedImmediateTranslation(path)
        ) {
          return;
        }

        if (wrapEagerDirectTranslation(path, state)) {
          return;
        }

        const localName = getReactiveLocalName(
          path.get("tag"),
          state.reactiveStringLocals,
        );
        if (!localName) {
          const directLocalName = getDirectStringLocalName(
            path,
            state.directStringLocals,
          );
          if (directLocalName) {
            assertAllowedDirectStringMacroUsage(path, directLocalName, state);
          }
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
 * rewrites translations into extraction-safe, raw, or Svelte-context forms, and adjusts runtime
 * imports.
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
          t.isIdentifier(path.node.callee, {
            name: EAGER_TRANSLATION_WRAPPER,
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
