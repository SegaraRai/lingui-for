import { parseSync, type NodePath } from "@babel/core";
import type * as t from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";

import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import type { ScriptBlock, SvelteAnalysis } from "../analysis/types.ts";
import { getBabelTraverse } from "../shared/babel-traverse.ts";
import { getParserPlugins, normalizeLinguiConfig } from "../shared/config.ts";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import {
  parseMacroBindings,
  type MacroBindings,
} from "../shared/macro-bindings.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";

export type ScriptMacroImport = {
  start: number;
  end: number;
};

export type ScriptMacroExpression = {
  start: number;
  end: number;
  source: string;
  requiresLinguiContext: boolean;
};

export type ScriptMacroPlan = {
  imports: ScriptMacroImport[];
  expressions: ScriptMacroExpression[];
};

export type SveltePlan = {
  source: string;
  filename: string;
  linguiConfig: LinguiConfigNormalized;
  analysis: SvelteAnalysis;
  macroBindings: MacroBindings;
  moduleBindings: MacroBindings;
  instanceBindings: MacroBindings;
  expressionLang: "js" | "ts";
  moduleMacros: ScriptMacroPlan;
  instanceMacros: ScriptMacroPlan;
  usesLinguiContextBindings: boolean;
  usesRuntimeTrans: boolean;
};

function isMacroImportIdentifier(
  path:
    | NodePath<t.Identifier>
    | NodePath<t.Expression | t.V8IntrinsicIdentifier>
    | NodePath<t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName>,
  bindings: MacroBindings,
): path is NodePath<t.Identifier> {
  if (!path.isIdentifier() || !bindings.allImports.has(path.node.name)) {
    return false;
  }

  const binding = path.scope.getBinding(path.node.name);
  return (
    binding?.path.isImportSpecifier() === true &&
    binding.path.parentPath.isImportDeclaration() &&
    binding.path.parentPath.node.source.value === PACKAGE_MACRO
  );
}

function getMacroLocalName(
  path: NodePath<t.CallExpression | t.TaggedTemplateExpression>,
  bindings: MacroBindings,
): string | null {
  const getReactiveLocalName = (
    expression:
      | NodePath<t.Expression | t.V8IntrinsicIdentifier>
      | NodePath<t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName>,
  ): string | null => {
    if (!expression.isIdentifier()) {
      return null;
    }

    const { name } = expression.node;
    if (!name.startsWith("$") || expression.scope.hasBinding(name)) {
      return null;
    }

    const localName = name.slice(1);
    const binding = expression.scope.getBinding(localName);
    return bindings.reactiveStrings.has(localName) &&
      binding?.path.isImportSpecifier() === true &&
      binding.path.parentPath.isImportDeclaration() &&
      binding.path.parentPath.node.source.value === PACKAGE_MACRO
      ? localName
      : null;
  };

  if (path.isCallExpression()) {
    const callee = path.get("callee");
    const reactiveLocalName = getReactiveLocalName(callee);
    if (reactiveLocalName) {
      return reactiveLocalName;
    }

    if (isMacroImportIdentifier(callee, bindings)) {
      return callee.node.name;
    }

    if (!callee.isMemberExpression() || callee.node.computed) {
      return null;
    }

    const property = callee.get("property");
    const object = callee.get("object");
    if (
      property.isIdentifier({ name: "eager" }) &&
      object.isIdentifier() &&
      isMacroImportIdentifier(object, bindings) &&
      bindings.reactiveStrings.has(object.node.name)
    ) {
      return object.node.name;
    }

    return null;
  }

  const tag = path.get("tag");
  const reactiveLocalName = getReactiveLocalName(tag);
  if (reactiveLocalName) {
    return reactiveLocalName;
  }

  if (isMacroImportIdentifier(tag, bindings)) {
    return tag.node.name;
  }

  if (!tag.isMemberExpression() || tag.node.computed) {
    return null;
  }

  const property = tag.get("property");
  const object = tag.get("object");
  if (
    property.isIdentifier({ name: "eager" }) &&
    object.isIdentifier() &&
    isMacroImportIdentifier(object, bindings) &&
    bindings.reactiveStrings.has(object.node.name)
  ) {
    return object.node.name;
  }

  return null;
}

function collectScriptMacros(
  filename: string,
  script: ScriptBlock | null,
): ScriptMacroPlan {
  if (!script) {
    return {
      imports: [],
      expressions: [],
    };
  }

  const bindings = parseMacroBindings(script.content, script.lang);
  if (bindings.allImports.size === 0) {
    return {
      imports: [],
      expressions: [],
    };
  }

  const ast = parseSync(script.content, {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    filename: `${filename}?script`,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(script.lang),
    },
  });

  if (!ast) {
    return {
      imports: [],
      expressions: [],
    };
  }

  const traverse = getBabelTraverse();
  const imports: ScriptMacroImport[] = [];
  const expressions: ScriptMacroExpression[] = [];

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== PACKAGE_MACRO) {
        return;
      }

      if (path.node.start == null || path.node.end == null) {
        return;
      }

      let start = path.node.start;
      const lineStart =
        script.content.lastIndexOf("\n", path.node.start - 1) + 1;
      const leading = script.content.slice(lineStart, path.node.start);
      if (/^[ \t]*$/.test(leading)) {
        start = lineStart;
      }

      let end = path.node.end;
      if (script.content[end] === "\r" && script.content[end + 1] === "\n") {
        end += 2;
      } else if (script.content[end] === "\n") {
        end += 1;
      }

      let blankLineStart = end;
      while (
        script.content[blankLineStart] === " " ||
        script.content[blankLineStart] === "\t"
      ) {
        blankLineStart += 1;
      }
      if (
        (script.content[blankLineStart] === "\r" &&
          script.content[blankLineStart + 1] === "\n") ||
        script.content[blankLineStart] === "\n"
      ) {
        end = blankLineStart;
        if (
          script.content[blankLineStart] === "\r" &&
          script.content[blankLineStart + 1] === "\n"
        ) {
          end += 2;
        } else {
          end += 1;
        }
      }

      imports.push({
        start: script.contentStart + start,
        end: script.contentStart + end,
      });
    },
    CallExpression(path) {
      const localName = getMacroLocalName(path, bindings);
      if (!localName || path.node.start == null || path.node.end == null) {
        return;
      }

      expressions.push({
        start: script.contentStart + path.node.start,
        end: script.contentStart + path.node.end,
        source: script.content.slice(path.node.start, path.node.end),
        requiresLinguiContext: bindings.reactiveStrings.has(localName),
      });
      path.skip();
    },
    TaggedTemplateExpression(path) {
      const localName = getMacroLocalName(path, bindings);
      if (!localName || path.node.start == null || path.node.end == null) {
        return;
      }

      expressions.push({
        start: script.contentStart + path.node.start,
        end: script.contentStart + path.node.end,
        source: script.content.slice(path.node.start, path.node.end),
        requiresLinguiContext: bindings.reactiveStrings.has(localName),
      });
      path.skip();
    },
  });

  expressions.sort((left, right) => left.start - right.start);
  imports.sort((left, right) => left.start - right.start);

  return {
    imports,
    expressions,
  };
}

export function createSveltePlan(
  source: string,
  options: LinguiSvelteTransformOptions,
): SveltePlan {
  const analysis = analyzeSvelte(source, options.filename);
  const expressionLang =
    analysis.instance?.lang ?? analysis.module?.lang ?? "ts";
  const moduleBindings = analysis.module
    ? parseMacroBindings(analysis.module.content, analysis.module.lang)
    : parseMacroBindings("", expressionLang);
  const instanceBindings = analysis.instance
    ? parseMacroBindings(analysis.instance.content, analysis.instance.lang)
    : parseMacroBindings("", expressionLang);
  const moduleMacros = collectScriptMacros(options.filename, analysis.module);
  const instanceMacros = collectScriptMacros(
    options.filename,
    analysis.instance,
  );

  return {
    source,
    filename: options.filename,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    analysis,
    macroBindings: instanceBindings,
    moduleBindings,
    instanceBindings,
    expressionLang,
    moduleMacros,
    instanceMacros,
    usesLinguiContextBindings:
      instanceMacros.expressions.some(
        (expression) => expression.requiresLinguiContext,
      ) || analysis.expressions.length > 0,
    usesRuntimeTrans: analysis.components.length > 0,
  };
}
