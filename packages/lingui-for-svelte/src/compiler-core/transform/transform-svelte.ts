import {
  buildOutputWithIndexedMap,
  createUniqueNameAllocator as createSharedUniqueNameAllocator,
  stripQuery,
  type ReplacementChunk,
} from "lingui-for-shared/compiler";

import { createSveltePlan } from "../plan/index.ts";
import {
  EXPORT_CREATE_LINGUI_ACCESSORS,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_I18N,
  RUNTIME_BINDING_TRANSLATE,
} from "../shared/constants.ts";
import { getParserPlugins } from "../shared/config.ts";
import { createScriptFilename } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import {
  lowerComponentMacro,
  lowerScriptExpression,
  lowerTemplateExpression,
} from "../lower/index.ts";
import type { SvelteTransformResult } from "./types.ts";

type RuntimeBindingsForInjection = {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
  transComponent: string;
};

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult {
  const plan = createSveltePlan(source, options);
  const { analysis } = plan;
  const runtimeBindings = createRuntimeBindings(
    plan.filename,
    analysis.instance?.content ?? "",
    analysis.instance?.lang ?? "ts",
  );
  const mapFile = stripQuery(plan.filename);
  const replacements: ReplacementChunk[] = [];

  const moduleExpressions = plan.moduleMacros.expressions.map(
    (expression, index) =>
      lowerScriptExpression(expression.source, expression.start, plan, {
        extract: false,
        translationMode: "raw",
        filenameSuffix: `?module-expression-${index}`,
        macroBindings: plan.moduleBindings,
      }),
  );
  const instanceExpressions = plan.instanceMacros.expressions.map(
    (expression, index) =>
      lowerScriptExpression(expression.source, expression.start, plan, {
        extract: false,
        translationMode: "svelte-context",
        runtimeBindings,
        filenameSuffix: `?instance-expression-${index}`,
        macroBindings: plan.instanceBindings,
      }),
  );
  const templateExpressions = analysis.expressions.map((expression) =>
    lowerTemplateExpression(expression.source, expression.start, plan, {
      extract: false,
      runtimeBindings,
    }),
  );
  const components = analysis.components.map((component) =>
    lowerComponentMacro(component.source, component.start, plan, {
      extract: false,
      runtimeBindings,
      runtimeTransComponentName: runtimeBindings.transComponent,
    }),
  );

  plan.moduleMacros.imports.forEach((range) => {
    replacements.push({
      start: range.start,
      end: range.end,
      code: "",
      map: null,
    });
  });

  plan.moduleMacros.expressions.forEach((expression, index) => {
    const replacement = moduleExpressions[index];
    if (!replacement) {
      return;
    }

    replacements.push({
      start: expression.start,
      end: expression.end,
      code: replacement.code,
      map: replacement.map,
    });
  });

  if (analysis.instance) {
    plan.instanceMacros.imports.forEach((range) => {
      replacements.push({
        start: range.start,
        end: range.end,
        code: "",
        map: null,
      });
    });

    plan.instanceMacros.expressions.forEach((expression, index) => {
      const replacement = instanceExpressions[index];
      if (!replacement) {
        return;
      }

      replacements.push({
        start: expression.start,
        end: expression.end,
        code: replacement.code,
        map: replacement.map,
      });
    });
  }

  analysis.expressions.forEach((expression, index) => {
    const replacement = templateExpressions[index];
    if (!replacement) {
      return;
    }

    replacements.push({
      start: expression.start,
      end: expression.end,
      code: replacement.code,
      map: replacement.map,
    });
  });

  analysis.components.forEach((component, index) => {
    const replacement = components[index];
    if (!replacement) {
      return;
    }

    replacements.push({
      start: component.start,
      end: component.end,
      code: replacement.code,
      map: replacement.map,
    });
  });
  const needsLinguiContextBindings = plan.usesLinguiContextBindings;
  const needsTransComponentBinding = plan.usesRuntimeTrans;

  if (analysis.instance) {
    const injections =
      needsLinguiContextBindings || needsTransComponentBinding
        ? createRuntimeBindingInsertions(
            analysis.instance.content,
            runtimeBindings,
            needsLinguiContextBindings,
            needsTransComponentBinding,
          )
        : { prelude: "", suffix: "" };

    if (injections.prelude.length > 0) {
      replacements.push({
        start: getScriptInsertionStart(source, analysis.instance.contentStart),
        end: getScriptInsertionStart(source, analysis.instance.contentStart),
        code: injections.prelude,
        map: null,
      });
    }

    if (injections.suffix.length > 0) {
      replacements.push({
        start: analysis.instance.contentEnd,
        end: analysis.instance.contentEnd,
        code: injections.suffix,
        map: null,
      });
    }
  } else if (needsLinguiContextBindings || needsTransComponentBinding) {
    const injected = createRuntimeBindingInsertions(
      "",
      runtimeBindings,
      needsLinguiContextBindings,
      needsTransComponentBinding,
    );
    const block = `<script>\n${injected.prelude}${injected.suffix}</script>`;
    const insertionStart = analysis.module ? analysis.module.end : 0;

    replacements.push({
      start: insertionStart,
      end: insertionStart,
      code: analysis.module ? `\n\n${block}` : `${block}\n\n`,
      map: null,
    });
  }

  return buildOutputWithIndexedMap(source, mapFile, replacements);
}

function createRuntimeBindings(
  filename: string,
  instanceCode: string,
  lang: "js" | "ts",
): RuntimeBindingsForInjection {
  const allocateName = createSharedUniqueNameAllocator(instanceCode, {
    filename: createScriptFilename(filename, "instance", lang),
    parserPlugins: getParserPlugins(lang),
  });

  return {
    createLinguiAccessors: allocateName(EXPORT_CREATE_LINGUI_ACCESSORS),
    context: allocateName(RUNTIME_BINDING_CONTEXT),
    getI18n: allocateName(RUNTIME_BINDING_GET_I18N),
    translate: allocateName(RUNTIME_BINDING_TRANSLATE),
    transComponent: allocateName(RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS),
  };
}

function createRuntimeBindingInsertions(
  originalScriptContent: string,
  runtimeBindings: RuntimeBindingsForInjection,
  includeLinguiContext: boolean,
  includeTransComponent: boolean,
): {
  prelude: string;
  suffix: string;
} {
  const prelude: string[] = [];
  const suffix: string[] = [];

  if (includeLinguiContext && includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent}, createLinguiAccessors as ${runtimeBindings.createLinguiAccessors} } from "${PACKAGE_RUNTIME}";\n`,
    );
  } else if (includeLinguiContext) {
    prelude.push(
      `import { createLinguiAccessors as ${runtimeBindings.createLinguiAccessors} } from "${PACKAGE_RUNTIME}";\n`,
    );
  } else if (includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent} } from "${PACKAGE_RUNTIME}";\n`,
    );
  }

  if (includeLinguiContext) {
    prelude.push(
      `const ${runtimeBindings.context} = ${runtimeBindings.createLinguiAccessors}();\n`,
      `const ${runtimeBindings.getI18n} = ${runtimeBindings.context}.getI18n;\n`,
      `const ${runtimeBindings.translate} = ${runtimeBindings.context}._;\n`,
    );
    suffix.push(`${runtimeBindings.context}.prime();\n`);
  }

  const indent = detectScriptIndent(originalScriptContent);

  return {
    prelude:
      prelude.length > 0
        ? formatInsertedScript(prelude.join(""), indent, {
            leadingNewline: false,
            trailingBlankLine: false,
          })
        : "",
    suffix:
      suffix.length > 0
        ? formatInsertedScript(suffix.join(""), indent, {
            leadingNewline: true,
          })
        : "",
  };
}
function detectScriptIndent(content: string): string {
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0];
    if (indent != null) {
      return indent;
    }
  }

  return "";
}

function getScriptInsertionStart(source: string, contentStart: number): number {
  if (source[contentStart] === "\r" && source[contentStart + 1] === "\n") {
    return contentStart + 2;
  }

  if (source[contentStart] === "\n") {
    return contentStart + 1;
  }

  return contentStart;
}

function formatInsertedScript(
  code: string,
  indent: string,
  options: {
    leadingNewline?: boolean;
    trailingBlankLine?: boolean;
  } = {},
): string {
  const body = code
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
  const leading = options.leadingNewline ? "\n" : "";
  const trailing = options.trailingBlankLine ? "\n\n" : "\n";

  return `${leading}${body}${trailing}`;
}
