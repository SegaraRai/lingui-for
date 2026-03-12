import { transformSync, type PluginItem } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { SourceMapGenerator, type RawSourceMap } from "source-map";

import { getParserPlugins } from "./config.ts";
import {
  MACRO_PACKAGE,
  SYNTHETIC_EXPRESSION_PREFIX,
  SYNTHETIC_MACRO_IMPORT,
} from "./constants.ts";
import { addLineMappings, createOffsetToPosition } from "./source-map.ts";
import type {
  MarkupExpression,
  ProgramTransform,
  ProgramTransformRequest,
  ScriptBlock,
} from "./types.ts";

function isMacroImportPresent(script: ScriptBlock | null): boolean {
  return script?.content.includes(MACRO_PACKAGE) ?? false;
}

export function buildCombinedProgram(
  source: string,
  filename: string,
  script: ScriptBlock | null,
  expressions: readonly MarkupExpression[],
): { code: string; map: RawSourceMap } {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  let code = "";

  generator.setSourceContent(filename, source);

  if (!isMacroImportPresent(script) && expressions.length > 0) {
    code += SYNTHETIC_MACRO_IMPORT;
  }

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

  return {
    code,
    map: generator.toJSON() as RawSourceMap,
  };
}

export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
): ProgramTransform {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap: request.inputSourceMap,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(request.lang),
    },
    plugins: [
      [
        linguiMacroPlugin as unknown as PluginItem,
        {
          extract: request.extract,
          linguiConfig: request.linguiConfig,
          stripMessageField: request.extract ? false : undefined,
        },
      ],
    ],
    sourceMaps: true,
  });

  if (!result?.ast || !result.code) {
    throw new Error(`Failed to transform ${request.filename}`);
  }

  return {
    code: result.code,
    ast: result.ast,
    map: (result.map as RawSourceMap | null | undefined) ?? null,
  };
}

function createProgramCode(body: t.Statement[]): string {
  if (body.length === 0) {
    return "";
  }

  return generate(t.file(t.program(body, [], "module")), {
    comments: true,
    jsescOption: { minimal: true },
    retainLines: false,
  }).code;
}

export function splitSyntheticDeclarations(transformed: ProgramTransform): {
  scriptCode: string;
  expressionReplacements: Map<number, string>;
} {
  const retained: t.Statement[] = [];
  const expressionReplacements = new Map<number, string>();

  transformed.ast.program.body.forEach((statement) => {
    if (
      !t.isVariableDeclaration(statement) ||
      statement.declarations.length !== 1
    ) {
      retained.push(statement);
      return;
    }

    const [declaration] = statement.declarations;

    if (
      !t.isIdentifier(declaration?.id) ||
      !declaration.id.name.startsWith(SYNTHETIC_EXPRESSION_PREFIX)
    ) {
      retained.push(statement);
      return;
    }

    {
      const index = Number(
        declaration.id.name.slice(SYNTHETIC_EXPRESSION_PREFIX.length),
      );

      if (Number.isFinite(index) && declaration.init) {
        expressionReplacements.set(
          index,
          generate(declaration.init, {
            comments: true,
            jsescOption: { minimal: true },
            retainLines: false,
          }).code,
        );
      }
    }
  });

  return {
    scriptCode: createProgramCode(retained),
    expressionReplacements,
  };
}
