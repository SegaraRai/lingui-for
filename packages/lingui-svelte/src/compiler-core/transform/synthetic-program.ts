import { SourceMapGenerator, type RawSourceMap } from "source-map";

import {
  SYNTHETIC_COMPONENT_PREFIX,
  SYNTHETIC_EXPRESSION_PREFIX,
} from "../shared/constants.ts";
import {
  addLineMappings,
  createOffsetToPosition,
} from "../shared/source-map.ts";
import type {
  MacroComponent,
  MarkupExpression,
  ScriptBlock,
} from "../shared/types.ts";

export function buildCombinedProgram(
  source: string,
  filename: string,
  script: ScriptBlock | null,
  expressions: readonly MarkupExpression[],
  components: readonly MacroComponent[],
): {
  code: string;
  map: RawSourceMap;
} {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  let code = "";

  generator.setSourceContent(filename, source);

  if (script) {
    const generatedLine = code.split("\n").length;
    code += script.content;
    addLineMappings(
      generator,
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
    const name = `${SYNTHETIC_EXPRESSION_PREFIX}${expression.index}`;

    code += `const ${name} = (\n`;
    generator.addMapping({
      generated: { line: generatedLine, column: 0 },
      original: toPosition(expression.start),
      source: filename,
    });

    code += expression.source;
    addLineMappings(
      generator,
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
    const name = `${SYNTHETIC_COMPONENT_PREFIX}${component.index}`;

    code += `const ${name} = (\n`;
    generator.addMapping({
      generated: { line: generatedLine, column: 0 },
      original: toPosition(component.start),
      source: filename,
    });

    code += component.source;
    addLineMappings(
      generator,
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
    map: generator.toJSON(),
  };
}
