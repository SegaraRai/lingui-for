import MagicString from "magic-string";

import { stripQuery } from "lingui-for-shared/compiler";

import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  EXPORT_CREATE_LINGUI_ACCESSORS,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_I18N,
  RUNTIME_BINDING_TRANSLATE,
} from "../shared/constants.ts";
import { createScriptFilename } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import { createUniqueNameAllocator } from "./identifier-allocation.ts";
import { splitSyntheticDeclarations } from "./runtime-trans-lowering.ts";
import { buildDirectProgramMap } from "./source-map.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";
import type { SvelteTransformResult } from "./types.ts";

/**
 * Runtime bindings injected into transformed Svelte code when the transform detects they are needed.
 */
type RuntimeBindingsForInjection = {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
  transComponent: string;
};

/**
 * Transforms a `.svelte` file into rewritten Svelte source and source map.
 *
 * @param source Original Svelte component source.
 * @param options Filename and optional Lingui config.
 * @returns A {@link SvelteTransformResult} containing transformed Svelte code and a source map.
 *
 * This is the main Svelte entry point for the compiler core. It transforms the module script
 * independently, lifts instance/template content into a synthetic program, runs the Babel/Lingui
 * transform in Svelte-context mode, lowers synthetic declarations back into Svelte source, and
 * injects hidden runtime bindings only when the rewritten output actually needs them.
 */
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
      split.scriptCode.includes(runtimeBindings.getI18n) ||
      split.scriptCode.includes(runtimeBindings.translate) ||
      expressionsCode.includes(runtimeBindings.getI18n) ||
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
): RuntimeBindingsForInjection {
  const allocateName = createUniqueNameAllocator(instanceCode, {
    filename: createScriptFilename(filename, "instance", lang),
    lang,
  });

  return {
    createLinguiAccessors: allocateName(EXPORT_CREATE_LINGUI_ACCESSORS),
    context: allocateName(RUNTIME_BINDING_CONTEXT),
    getI18n: allocateName(RUNTIME_BINDING_GET_I18N),
    translate: allocateName(RUNTIME_BINDING_TRANSLATE),
    transComponent: allocateName(RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS),
  };
}

function injectRuntimeBindings(
  code: string,
  runtimeBindings: RuntimeBindingsForInjection,
  includeLinguiContext: boolean,
  includeTransComponent: boolean,
): string {
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

  const preludeCode = prelude.join("");
  const suffixCode = suffix.join("");

  if (code.trim().length === 0) {
    return `${preludeCode}${suffixCode}`;
  }

  return `${preludeCode}\n${code}\n${suffixCode}`;
}
