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
    },
  };
}
