import MagicString from "magic-string";

import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  DEFAULT_CONTEXT_BINDING,
  DEFAULT_I18N_BINDING,
  DEFAULT_RUNTIME_TRANS_COMPONENT_BINDING,
  DEFAULT_TRANSLATOR_BINDING,
  GET_LINGUI_CONTEXT_EXPORT,
  RUNTIME_PACKAGE,
} from "../shared/constants.ts";
import { createUniqueNameAllocator } from "../shared/identifier-allocation.ts";
import { createScriptFilename, stripQuery } from "../shared/paths.ts";
import { buildDirectProgramMap } from "../shared/source-map.ts";
import type {
  LinguiSvelteTransformOptions,
  SvelteTransformResult,
} from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import { splitSyntheticDeclarations } from "./runtime-trans-lowering.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult {
  const analysis = analyzeSvelte(source, options.filename);
  const linguiConfig = normalizeLinguiConfig(options.linguiConfig);
  const string = new MagicString(source);
  const runtimeBindings = createRuntimeBindings(
    options.filename,
    analysis.instance?.content ?? "",
    analysis.instance?.lang ?? "ts",
  );

  if (analysis.module) {
    const transformedModule = transformProgram(analysis.module.content, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "module",
        analysis.module.lang,
      ),
      lang: analysis.module.lang,
      linguiConfig,
      translationMode: "raw",
      inputSourceMap: buildDirectProgramMap(
        source,
        options.filename,
        analysis.module.contentStart,
        analysis.module.content,
      ),
    });

    string.overwrite(
      analysis.module.contentStart,
      analysis.module.contentEnd,
      transformedModule.code,
    );
  }

  if (
    analysis.instance ||
    analysis.expressions.length > 0 ||
    analysis.components.length > 0
  ) {
    const combined = buildCombinedProgram(
      source,
      options.filename,
      analysis.instance,
      analysis.expressions,
      analysis.components,
    );
    const transformedInstance = transformProgram(combined.code, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "instance",
        analysis.instance?.lang ?? "ts",
      ),
      lang: analysis.instance?.lang ?? "ts",
      linguiConfig,
      translationMode: "svelte-context",
      runtimeBindings,
      inputSourceMap: combined.map,
    });
    const split = splitSyntheticDeclarations(
      transformedInstance,
      runtimeBindings.transComponent,
    );
    const expressionsCode = Array.from(
      split.expressionReplacements.values(),
    ).join("\n");
    const componentsCode = Array.from(
      split.componentReplacements.values(),
    ).join("\n");
    const needsLinguiContextBindings =
      split.scriptCode.includes(runtimeBindings.i18n) ||
      split.scriptCode.includes(runtimeBindings.translate) ||
      expressionsCode.includes(runtimeBindings.i18n) ||
      expressionsCode.includes(runtimeBindings.translate);
    const needsTransComponentBinding = componentsCode.includes(
      runtimeBindings.transComponent,
    );
    const scriptCode =
      needsLinguiContextBindings || needsTransComponentBinding
        ? injectRuntimeBindings(
            split.scriptCode,
            runtimeBindings,
            needsLinguiContextBindings,
            needsTransComponentBinding,
          )
        : split.scriptCode;

    analysis.expressions
      .slice()
      .sort((left, right) => right.start - left.start)
      .forEach((expression) => {
        const replacement = split.expressionReplacements.get(expression.index);
        if (replacement) {
          string.overwrite(expression.start, expression.end, replacement);
        }
      });

    analysis.components
      .slice()
      .sort((left, right) => right.start - left.start)
      .forEach((component) => {
        const replacement = split.componentReplacements.get(component.index);
        if (replacement) {
          string.overwrite(component.start, component.end, replacement);
        }
      });

    if (analysis.instance) {
      string.overwrite(
        analysis.instance.contentStart,
        analysis.instance.contentEnd,
        scriptCode,
      );
    } else if (scriptCode.trim().length > 0) {
      const block = `<script>\n${scriptCode}\n</script>\n\n`;

      if (analysis.module) {
        string.appendLeft(
          analysis.module.end,
          `\n\n<script>\n${scriptCode}\n</script>`,
        );
      } else {
        string.prepend(block);
      }
    }
  }

  return {
    code: string.toString(),
    map: string.generateMap({
      file: stripQuery(options.filename),
      hires: true,
      includeContent: true,
      source: stripQuery(options.filename),
    }),
  };
}

function createRuntimeBindings(
  filename: string,
  instanceCode: string,
  lang: "js" | "ts",
) {
  const allocateName = createUniqueNameAllocator(instanceCode, {
    filename: createScriptFilename(filename, "instance", lang),
    lang,
  });

  return {
    getLinguiContext: allocateName(GET_LINGUI_CONTEXT_EXPORT),
    context: allocateName(DEFAULT_CONTEXT_BINDING),
    i18n: allocateName(DEFAULT_I18N_BINDING),
    translate: allocateName(DEFAULT_TRANSLATOR_BINDING),
    transComponent: allocateName(DEFAULT_RUNTIME_TRANS_COMPONENT_BINDING),
  };
}

function injectRuntimeBindings(
  code: string,
  runtimeBindings: {
    getLinguiContext: string;
    context: string;
    i18n: string;
    translate: string;
    transComponent: string;
  },
  includeLinguiContext: boolean,
  includeTransComponent: boolean,
): string {
  const prelude: string[] = [];

  if (includeLinguiContext && includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent}, getLinguiContext as ${runtimeBindings.getLinguiContext} } from "${RUNTIME_PACKAGE}";`,
    );
  } else if (includeLinguiContext) {
    prelude.push(
      `import { getLinguiContext as ${runtimeBindings.getLinguiContext} } from "${RUNTIME_PACKAGE}";`,
    );
  } else if (includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent} } from "${RUNTIME_PACKAGE}";`,
    );
  }

  if (includeLinguiContext) {
    prelude.push(
      `const ${runtimeBindings.context} = ${runtimeBindings.getLinguiContext}();`,
      `const ${runtimeBindings.i18n} = ${runtimeBindings.context}.i18n;`,
      `const ${runtimeBindings.translate} = ${runtimeBindings.context}._;`,
    );
  }

  const preludeCode = prelude.join("\n");
  return code.trim().length === 0 ? preludeCode : `${preludeCode}\n${code}`;
}
