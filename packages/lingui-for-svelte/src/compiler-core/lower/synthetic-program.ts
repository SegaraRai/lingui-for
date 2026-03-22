import {
  GenMapping,
  addMapping,
  setSourceContent,
  toEncodedMap,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";

import {
  addLineMappings,
  createOffsetToPosition,
} from "lingui-for-shared/compiler";

import type {
  MacroComponent,
  MarkupExpression,
  ScriptBlock,
} from "../analysis/types.ts";
import {
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "../shared/constants.ts";

/**
 * Builds a temporary JS/TS module that represents the transformable parts of a `.svelte` file.
 *
 * @param source Original Svelte source text.
 * @param filename Logical filename used for the generated source map.
 * @param script Instance script block, if one exists.
 * @param expressions Template expressions that should be transformed as macros.
 * @param components Template component macros that should be transformed.
 * @returns Synthetic module source code plus a source map back to the original `.svelte` file.
 *
 * The returned module is a Babel/Lingui-friendly view of the Svelte component: instance script
 * content is copied in directly, while relevant markup expressions and component macros are
 * materialized as synthetic variable declarations with stable prefixes and source-map mappings.
 */
export function buildCombinedProgram(
  source: string,
  filename: string,
  script: ScriptBlock | null,
  expressions: readonly MarkupExpression[],
  components: readonly MacroComponent[],
): {
  code: string;
  map: EncodedSourceMap;
} {
  const gen = new GenMapping({ file: filename });
  const toPosition = createOffsetToPosition(source);
  let code = "";

  setSourceContent(gen, filename, source);

  if (script) {
    const generatedLine = code.split("\n").length;
    code += script.content;
    addLineMappings(
      gen,
      filename,
      generatedLine,
      script.content,
      script.contentStart,
      toPosition,
    );

    if (!code.endsWith("\n")) {
      code += "\n";
    }
  }

  expressions.forEach((expression) => {
    const generatedLine = code.split("\n").length;
    const name = `${SYNTHETIC_PREFIX_EXPRESSION}${expression.index}`;

    code += `const ${name} = (\n`;
    addMapping(gen, {
      generated: { line: generatedLine, column: 0 },
      original: toPosition(expression.start),
      source: filename,
    });

    code += expression.source;
    addLineMappings(
      gen,
      filename,
      generatedLine + 1,
      expression.source,
      expression.start,
      toPosition,
    );

    code += "\n);\n";
  });

  components.forEach((component) => {
    const generatedLine = code.split("\n").length;
    const name = `${SYNTHETIC_PREFIX_COMPONENT}${component.index}`;

    code += `const ${name} = (\n`;
    addMapping(gen, {
      generated: { line: generatedLine, column: 0 },
      original: toPosition(component.start),
      source: filename,
    });

    code += component.source;
    addLineMappings(
      gen,
      filename,
      generatedLine + 1,
      component.source,
      component.start,
      toPosition,
    );

    code += "\n);\n";
  });

  return {
    code,
    map: toEncodedMap(gen),
  };
}
