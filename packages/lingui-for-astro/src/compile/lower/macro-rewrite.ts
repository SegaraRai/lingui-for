import {
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_TRANSLATE_METHOD,
} from "@lingui-for/framework-core/compile";
import type { PluginObj } from "@lingui-for/framework-core/vendor/babel-core";
import * as t from "@lingui-for/framework-core/vendor/babel-types";

export type AstroMacroPostprocessRequest =
  | {
      translationMode: "extract";
    }
  | {
      translationMode: "contextual";
      runtimeBinding: string;
    };

interface MacroRewriteState {
  runtimeI18nLocals: Set<string>;
}

const ASTRO_COMMENT_MARKER = "__astro_cm";
const ASTRO_FRAGMENT_MARKER = "__astro_frag";

function createInitialState(): MacroRewriteState {
  return {
    runtimeI18nLocals: new Set<string>(),
  };
}

function collectRuntimeI18nLocals(program: t.Program): Set<string> {
  const locals = new Set<string>();

  program.body.forEach((statement) => {
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
        locals.add(specifier.local.name);
      }
    });
  });

  return locals;
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
      statement.source.value !== LINGUI_CORE_PACKAGE
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

function objectPropertyName(
  property: t.Node | null | undefined,
): string | undefined {
  if (!t.isObjectProperty(property)) {
    return undefined;
  }
  const key = property.key;
  if (t.isIdentifier(key)) {
    return key.name;
  }
  if (t.isStringLiteral(key)) {
    return key.value;
  }
  if (t.isNumericLiteral(key)) {
    return String(key.value);
  }
  return undefined;
}

function stripAstroNullMarkerComponents(node: t.ObjectExpression): void {
  const messageProperty = node.properties.find((property) => {
    return objectPropertyName(property) === "message";
  });
  const componentsProperty = node.properties.find((property) => {
    return objectPropertyName(property) === "components";
  });

  if (
    !t.isObjectProperty(messageProperty) ||
    !t.isStringLiteral(messageProperty.value) ||
    !t.isObjectProperty(componentsProperty) ||
    !t.isObjectExpression(componentsProperty.value)
  ) {
    return;
  }

  const removedKeys = new Set<string>();
  const transparentKeys = new Set<string>();
  componentsProperty.value.properties =
    componentsProperty.value.properties.filter((property) => {
      const key = objectPropertyName(property);
      if (key == null || !t.isObjectProperty(property)) {
        return true;
      }
      if (t.isNullLiteral(property.value)) {
        removedKeys.add(key);
        return false;
      }
      if (
        t.isUnaryExpression(property.value, { operator: "void" }) &&
        t.isNumericLiteral(property.value.argument, { value: 0 })
      ) {
        transparentKeys.add(key);
        return false;
      }
      return true;
    });

  if (removedKeys.size === 0 && transparentKeys.size === 0) {
    return;
  }

  let message = messageProperty.value.value;
  for (const key of removedKeys) {
    message = message
      .split(`<${key}/>`)
      .join("")
      .split(`<${key}></${key}>`)
      .join("");
  }
  for (const key of transparentKeys) {
    message = message.split(`<${key}>`).join("").split(`</${key}>`).join("");
  }
  message = renumberComponentPlaceholders(componentsProperty.value, message);
  messageProperty.value.value = message;

  if (componentsProperty.value.properties.length === 0) {
    node.properties = node.properties.filter(
      (property) => property !== componentsProperty,
    );
  }
}

function renumberComponentPlaceholders(
  components: t.ObjectExpression,
  message: string,
): string {
  const keyedProperties = components.properties
    .map((property) => ({ property, key: objectPropertyName(property) }))
    .filter(
      (entry): entry is { property: t.ObjectProperty; key: string } =>
        t.isObjectProperty(entry.property) && entry.key != null,
    )
    .sort((left, right) => Number(left.key) - Number(right.key));

  const keyMap = new Map<string, string>();
  keyedProperties.forEach(({ key }, index) => {
    keyMap.set(key, String(index));
  });

  for (const { property, key } of keyedProperties) {
    const next = keyMap.get(key);
    if (next == null || next === key) {
      continue;
    }
    property.key = t.numericLiteral(Number(next));
  }

  let renumbered = message;
  for (const [oldKey, newKey] of keyMap) {
    if (oldKey === newKey) {
      continue;
    }
    renumbered = renumbered
      .split(`<${oldKey}>`)
      .join(`<__lf_astro_ph_${newKey}__>`)
      .split(`</${oldKey}>`)
      .join(`</__lf_astro_ph_${newKey}__>`)
      .split(`<${oldKey}/>`)
      .join(`<__lf_astro_ph_${newKey}__/>`);
  }
  for (const [, newKey] of keyMap) {
    renumbered = renumbered
      .split(`<__lf_astro_ph_${newKey}__>`)
      .join(`<${newKey}>`)
      .split(`</__lf_astro_ph_${newKey}__>`)
      .join(`</${newKey}>`)
      .split(`<__lf_astro_ph_${newKey}__/>`)
      .join(`<${newKey}/>`);
  }

  return renumbered;
}

function jsxElementName(node: t.JSXElement): string | undefined {
  const name = node.openingElement.name;
  return t.isJSXIdentifier(name) ? name.name : undefined;
}

function isJsxChildPath(path: {
  node: t.JSXElement;
  parentPath: unknown;
  container: unknown;
}): boolean {
  const parentPath = path.parentPath as
    | {
        node?: t.Node & { children?: unknown[] };
        isJSXElement?: () => boolean;
        isJSXFragment?: () => boolean;
      }
    | undefined;
  if (parentPath?.node?.children?.some((child) => child === path.node)) {
    return true;
  }
  if (parentPath?.isJSXElement?.() || parentPath?.isJSXFragment?.()) {
    return Array.isArray(path.container);
  }

  return (
    Array.isArray(path.container) &&
    (t.isJSXElement(parentPath?.node) || t.isJSXFragment(parentPath?.node))
  );
}

/**
 * Removes Astro-only JSX markers before Lingui's macro sees the synthetic TSX.
 *
 * Rust emits these markers to keep Astro fragments and HTML comments parseable as
 * JSX nodes with source mappings. They are framework syntax carriers, not user
 * message content, so Lingui should not turn them into catalog placeholders.
 */
export function createAstroMacroPreprocessPlugin(): PluginObj {
  return {
    name: "lingui-for-astro-macro-preprocess",
    visitor: {
      JSXElement: {
        exit(path) {
          const name = jsxElementName(path.node);
          if (name === ASTRO_COMMENT_MARKER) {
            if (isJsxChildPath(path)) {
              path.remove();
            } else {
              path.replaceWith(t.nullLiteral());
            }
            return;
          }

          if (name !== ASTRO_FRAGMENT_MARKER) {
            return;
          }

          path.replaceWithMultiple(path.node.children);
        },
      },
    },
  };
}

/**
 * Rewrites Lingui's Babel macro output into Astro's runtime shape.
 *
 * The synthetic source already isolates frontmatter, so this step only needs to
 * retarget runtime i18n reads and drop the temporary `@lingui/core` i18n import
 * when Astro binds translations through its own context local.
 */
export function createAstroMacroPostprocessPlugin(
  request: AstroMacroPostprocessRequest,
): PluginObj<MacroRewriteState> {
  return {
    name: "lingui-for-astro-macro-postprocess",
    pre() {
      Object.assign(this, createInitialState());
    },
    visitor: {
      Program: {
        enter(path, state) {
          if (request.translationMode !== "contextual") {
            return;
          }

          state.runtimeI18nLocals = collectRuntimeI18nLocals(path.node);
        },
        exit(path, state) {
          if (request.translationMode !== "contextual") {
            return;
          }

          removeRuntimeI18nImports(path.node, state.runtimeI18nLocals);
        },
      },
      CallExpression(path, state) {
        if (request.translationMode !== "contextual") {
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
      ObjectExpression: {
        exit(path) {
          stripAstroNullMarkerComponents(path.node);
        },
      },
    },
  };
}
