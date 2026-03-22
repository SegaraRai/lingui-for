import {
  createMappedOutput,
  splitSyntheticDeclarations as splitSyntheticDeclarationsShared,
} from "lingui-for-shared/compiler";

import type { SveltePlan } from "../plan/svelte-plan.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "../shared/constants.ts";
import type { MacroBindings } from "../shared/macro-bindings.ts";
import { transformProgram } from "./babel-transform.ts";
import type {
  MappedCodeFragment,
  ProgramTransform,
  RuntimeBindingsForTransform,
} from "./types.ts";

function splitSyntheticDeclarations(
  transformed: ProgramTransform,
  runtimeTransComponentName = "L4sRuntimeTrans",
): {
  script: MappedCodeFragment;
  expressionReplacements: Map<number, MappedCodeFragment>;
  componentReplacements: Map<number, MappedCodeFragment>;
} {
  return splitSyntheticDeclarationsShared(transformed, {
    runtimePackageName: PACKAGE_RUNTIME,
    runtimeTransComponentName,
    syntheticExpressionPrefix: SYNTHETIC_PREFIX_EXPRESSION,
    syntheticComponentPrefix: SYNTHETIC_PREFIX_COMPONENT,
    shouldRemoveRuntimeTransImport: (localName) =>
      localName === runtimeTransComponentName,
  });
}

export function createSyntheticMacroImports(
  macroBindings: MacroBindings,
): string {
  if (macroBindings.allImports.size === 0) {
    return "";
  }

  const specifiers = [...macroBindings.allImports.entries()]
    .map(([localName, importedName]) =>
      localName === importedName
        ? importedName
        : `${importedName} as ${localName}`,
    )
    .join(", ");

  return `import { ${specifiers} } from "${PACKAGE_MACRO}";\n`;
}

export function lowerTemplateExpression(
  source: string,
  start: number,
  plan: SveltePlan,
  options: {
    extract: boolean;
    runtimeBindings?: RuntimeBindingsForTransform;
  },
): MappedCodeFragment {
  const translationMode: "extract" | "svelte-context" = options.extract
    ? "extract"
    : "svelte-context";
  const lowered = lowerScriptLikeExpression(source, start, plan, {
    extract: options.extract,
    translationMode,
    filenameSuffix: options.extract ? "?extract-expression" : "?expression",
    ...(options.runtimeBindings
      ? { runtimeBindings: options.runtimeBindings }
      : {}),
  });

  return options.extract
    ? lowered
    : {
        code: indentMultilineReplacement(
          lowered.code,
          getSourceLineIndent(plan.source, start),
        ),
        map: null,
      };
}

export function lowerScriptExpression(
  source: string,
  start: number,
  plan: SveltePlan,
  options: {
    extract: boolean;
    translationMode: "extract" | "raw" | "svelte-context";
    runtimeBindings?: RuntimeBindingsForTransform;
    filenameSuffix: string;
    macroBindings?: MacroBindings;
  },
): MappedCodeFragment {
  const lowered = lowerScriptLikeExpression(source, start, plan, options);

  return options.extract
    ? lowered
    : {
        code: indentMultilineReplacement(
          lowered.code,
          getSourceLineIndent(plan.source, start),
        ),
        map: null,
      };
}

function lowerScriptLikeExpression(
  source: string,
  start: number,
  plan: SveltePlan,
  options: {
    extract: boolean;
    translationMode: "extract" | "raw" | "svelte-context";
    runtimeBindings?: RuntimeBindingsForTransform;
    filenameSuffix: string;
    macroBindings?: MacroBindings;
  },
): MappedCodeFragment {
  const prefix = `${createSyntheticMacroImports(options.macroBindings ?? plan.macroBindings)}const ${SYNTHETIC_PREFIX_EXPRESSION}0 = (\n`;
  const transformed = transformProgram(`${prefix}${source}\n);`, {
    extract: options.extract,
    filename: `${plan.filename}${options.filenameSuffix}`,
    lang: plan.expressionLang,
    linguiConfig: plan.linguiConfig,
    translationMode: options.translationMode,
    runtimeBindings: options.runtimeBindings,
  });

  if (options.extract) {
    const split = splitSyntheticDeclarations(
      transformed,
      RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
    );
    const replacement = split.expressionReplacements.get(0);
    const code = replacement
      ? `const ${SYNTHETIC_PREFIX_EXPRESSION}0 = ${replacement.code};`
      : transformed.code;

    return { code, map: null };
  }

  const split = splitSyntheticDeclarations(
    transformed,
    RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  );

  const fragment = split.expressionReplacements.get(0);
  if (fragment == null) {
    return { code: source, map: null };
  }

  return { code: fragment.code, map: null };
}

export function lowerComponentMacro(
  source: string,
  start: number,
  plan: SveltePlan,
  options: {
    extract: boolean;
    runtimeBindings?: RuntimeBindingsForTransform;
    runtimeTransComponentName?: string;
  },
): MappedCodeFragment {
  const prefix = `${createSyntheticMacroImports(plan.macroBindings)}const ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n`;
  const transformed = transformProgram(`${prefix}${source}\n);`, {
    extract: options.extract,
    filename: `${plan.filename}${options.extract ? "?extract-component" : "?component"}`,
    lang: plan.expressionLang,
    linguiConfig: plan.linguiConfig,
    translationMode: options.extract ? "extract" : "svelte-context",
    runtimeBindings: options.runtimeBindings,
  });

  if (options.extract) {
    const replacement = findSyntheticExpression(
      transformed,
      SYNTHETIC_PREFIX_COMPONENT,
    );
    const code = replacement
      ? `const ${SYNTHETIC_PREFIX_COMPONENT}0 = ${replacement.code};`
      : transformed.code;

    return { code, map: null };
  }

  const split = splitSyntheticDeclarations(
    transformed,
    options.runtimeTransComponentName ??
      RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  );
  const replacement = split.componentReplacements.get(0);

  if (!replacement) {
    return { code: source, map: null };
  }

  return {
    code: indentMultilineReplacement(
      replacement.code,
      getSourceLineIndent(plan.source, start),
    ),
    map: null,
  };
}

function getSourceLineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  let index = lineStart;

  while (source[index] === " " || source[index] === "\t") {
    index += 1;
  }

  return source.slice(lineStart, index);
}

function indentMultilineReplacement(code: string, indent: string): string {
  if (indent.length === 0 || !code.includes("\n")) {
    return code;
  }

  const lines = code.split("\n");
  return lines
    .map((line, index) =>
      index === 0 || line.length === 0 ? line : `${indent}${line}`,
    )
    .join("\n");
}

function findSyntheticExpression(
  transformed: ProgramTransform,
  syntheticPrefix: string,
): MappedCodeFragment | null {
  for (const statement of transformed.ast.program.body) {
    if (
      statement.type !== "VariableDeclaration" ||
      statement.declarations.length !== 1
    ) {
      continue;
    }

    const [declaration] = statement.declarations;
    if (
      declaration?.id.type === "Identifier" &&
      declaration.id.name.startsWith(syntheticPrefix) &&
      declaration.init
    ) {
      return createMappedOutput(declaration.init, transformed);
    }
  }

  return null;
}
