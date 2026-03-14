import { transformSync, type PluginItem } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { SourceMapGenerator, type RawSourceMap } from "source-map";

import { getParserPlugins } from "./config.ts";
import {
  RUNTIME_PACKAGE,
  SYNTHETIC_COMPONENT_PREFIX,
  SYNTHETIC_EXPRESSION_PREFIX,
} from "./constants.ts";
import {
  createMacroPostprocessPlugin,
  createMacroPreprocessPlugin,
} from "./macro-rewrite.ts";
import { addLineMappings, createOffsetToPosition } from "./source-map.ts";
import type {
  MacroComponent,
  MarkupExpression,
  ProgramTransform,
  ProgramTransformRequest,
  ScriptBlock,
} from "./types.ts";

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

export function transformProgram(
  code: string,
  request: ProgramTransformRequest,
): ProgramTransform {
  const preprocessed = transformSync(code, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap: request.inputSourceMap,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(request.lang),
    },
    plugins: [createMacroPreprocessPlugin()],
    sourceMaps: true,
  });

  if (!preprocessed?.code) {
    throw new Error(`Failed to preprocess ${request.filename}`);
  }

  const result = transformSync(preprocessed.code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: request.filename,
    inputSourceMap:
      (preprocessed.map as RawSourceMap | null | undefined) ??
      request.inputSourceMap,
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
      createMacroPostprocessPlugin(request),
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

export function splitSyntheticDeclarations(
  transformed: ProgramTransform,
  runtimeTransComponentName = "L4sRuntimeTrans",
): {
  scriptCode: string;
  expressionReplacements: Map<number, string>;
  componentReplacements: Map<number, string>;
} {
  const retained: t.Statement[] = [];
  const expressionReplacements = new Map<number, string>();
  const componentReplacements = new Map<number, string>();
  const runtimeTransLocalsToRemove = new Set<string>();

  transformed.ast.program.body.forEach((statement) => {
    if (
      !t.isVariableDeclaration(statement) ||
      statement.declarations.length !== 1
    ) {
      retained.push(statement);
      return;
    }

    const [declaration] = statement.declarations;

    if (!t.isIdentifier(declaration?.id)) {
      retained.push(statement);
      return;
    }

    if (declaration.id.name.startsWith(SYNTHETIC_EXPRESSION_PREFIX)) {
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
        return;
      }
    }

    if (declaration.id.name.startsWith(SYNTHETIC_COMPONENT_PREFIX)) {
      const index = Number(
        declaration.id.name.slice(SYNTHETIC_COMPONENT_PREFIX.length),
      );

      if (
        Number.isFinite(index) &&
        declaration.init &&
        t.isJSXElement(declaration.init)
      ) {
        const runtimeTransLocal = getRuntimeTransLocalName(declaration.init);
        if (runtimeTransLocal) {
          runtimeTransLocalsToRemove.add(runtimeTransLocal);
        }
        componentReplacements.set(
          index,
          convertRuntimeTransJsxToSvelte(
            declaration.init,
            runtimeTransComponentName,
          ),
        );
        return;
      }
    }

    retained.push(statement);
  });

  return {
    scriptCode: createProgramCode(
      removeRuntimeTransImports(retained, runtimeTransLocalsToRemove),
    ),
    expressionReplacements,
    componentReplacements,
  };
}

function convertRuntimeTransJsxToSvelte(
  node: t.JSXElement,
  runtimeTransComponentName: string,
): string {
  const opening = node.openingElement;
  const attributes = opening.attributes
    .map(convertRuntimeTransAttribute)
    .join("");

  return `<${runtimeTransComponentName}${attributes} />`;
}

function convertRuntimeTransAttribute(
  attribute: t.JSXAttribute | t.JSXSpreadAttribute,
): string {
  if (t.isJSXSpreadAttribute(attribute)) {
    return ` {...${generate(convertRuntimeTransSpreadArgument(attribute.argument), GENERATE_OPTIONS).code}}`;
  }

  if (!t.isJSXIdentifier(attribute.name)) {
    throw new Error(
      "Unsupported namespaced JSX attribute in runtime Trans lowering",
    );
  }

  const name = attribute.name.name;

  if (!attribute.value) {
    return ` ${name}={true}`;
  }

  const expression = convertRuntimeTransAttributeValue(name, attribute.value);
  return ` ${name}={${generate(expression, GENERATE_OPTIONS).code}}`;
}

function convertRuntimeTransSpreadArgument(
  argument: t.Expression,
): t.Expression {
  if (!t.isObjectExpression(argument)) {
    return argument;
  }

  return t.objectExpression(
    argument.properties.map((property) => {
      if (t.isSpreadElement(property)) {
        return t.spreadElement(property.argument);
      }

      if (!t.isObjectProperty(property)) {
        throw new Error(
          "Unsupported object method in runtime Trans spread props",
        );
      }

      if (getObjectPropertyName(property.key) === "components") {
        return t.objectProperty(
          property.key,
          t.isExpression(property.value)
            ? convertComponentsExpression(property.value)
            : convertRichTextComponentValue(property.value),
          property.computed,
        );
      }

      return property;
    }),
  );
}

function convertRuntimeTransAttributeValue(
  name: string,
  value: t.JSXAttribute["value"],
): t.Expression {
  if (t.isStringLiteral(value)) {
    return t.stringLiteral(value.value);
  }

  if (!t.isJSXExpressionContainer(value)) {
    throw new Error(
      `Unsupported JSX attribute value for runtime Trans prop "${name}"`,
    );
  }

  if (name === "components") {
    return convertComponentsExpression(value.expression);
  }

  if (!t.isExpression(value.expression)) {
    throw new Error(
      `Unsupported JSX expression value for runtime Trans prop "${name}"`,
    );
  }

  return value.expression;
}

function convertComponentsExpression(
  expression: t.Expression | t.JSXEmptyExpression,
): t.Expression {
  if (!t.isObjectExpression(expression)) {
    throw new Error(
      "Runtime Trans components must lower from an object expression",
    );
  }

  return t.objectExpression(
    expression.properties.map((property) => {
      if (t.isSpreadElement(property)) {
        return t.spreadElement(property.argument);
      }

      if (!t.isObjectProperty(property)) {
        throw new Error(
          "Unsupported object method in runtime Trans components",
        );
      }

      return t.objectProperty(
        property.key,
        convertRichTextComponentValue(property.value),
        property.computed,
      );
    }),
  );
}

function getObjectPropertyName(
  key: t.Expression | t.Identifier | t.PrivateName,
): string | null {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key)) {
    return key.value;
  }

  if (t.isNumericLiteral(key)) {
    return String(key.value);
  }

  return null;
}

function convertRichTextComponentValue(
  value: t.Expression | t.PatternLike,
): t.Expression {
  if (t.isJSXElement(value)) {
    return convertJsxElementDescriptor(value);
  }

  if (t.isJSXFragment(value)) {
    throw new Error(
      "JSX fragments are not supported in Trans embedded components",
    );
  }

  if (!t.isExpression(value)) {
    throw new Error("Unsupported runtime Trans component value");
  }

  return value;
}

function convertJsxElementDescriptor(
  element: t.JSXElement,
): t.ObjectExpression {
  const tagName = getJsxTagName(element.openingElement.name);
  const props = convertJsxAttributesToObject(element.openingElement.attributes);

  if (tagName.kind === "element") {
    return t.objectExpression([
      t.objectProperty(t.identifier("kind"), t.stringLiteral("element")),
      t.objectProperty(t.identifier("tag"), t.stringLiteral(tagName.name)),
      t.objectProperty(t.identifier("props"), props),
    ]);
  }

  return t.objectExpression([
    t.objectProperty(t.identifier("kind"), t.stringLiteral("component")),
    t.objectProperty(t.identifier("component"), tagName.expression),
    t.objectProperty(t.identifier("props"), props),
  ]);
}

function getJsxTagName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
):
  | { kind: "element"; name: string }
  | { kind: "component"; expression: t.Expression } {
  if (t.isJSXNamespacedName(name)) {
    throw new Error(
      "JSX namespaced elements are not supported in Trans embedded components",
    );
  }

  if (t.isJSXIdentifier(name)) {
    if (/^[a-z]/.test(name.name)) {
      return {
        kind: "element",
        name: name.name,
      };
    }

    return {
      kind: "component",
      expression: t.identifier(name.name),
    };
  }

  return {
    kind: "component",
    expression: convertJsxMemberExpression(name),
  };
}

function convertJsxMemberExpression(
  expression: t.JSXMemberExpression,
): t.Expression {
  const object = t.isJSXIdentifier(expression.object)
    ? t.identifier(expression.object.name)
    : convertJsxMemberExpression(expression.object);

  return t.memberExpression(object, t.identifier(expression.property.name));
}

function convertJsxAttributesToObject(
  attributes: readonly (t.JSXAttribute | t.JSXSpreadAttribute)[],
): t.ObjectExpression {
  return t.objectExpression(
    attributes.map((attribute) => {
      if (t.isJSXSpreadAttribute(attribute)) {
        return t.spreadElement(attribute.argument);
      }

      if (!t.isJSXIdentifier(attribute.name)) {
        throw new Error(
          "Unsupported namespaced JSX attribute in Trans embedded components",
        );
      }

      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attribute.name.name)
        ? t.identifier(attribute.name.name)
        : t.stringLiteral(attribute.name.name);

      return t.objectProperty(
        key,
        jsxAttributeValueToExpression(attribute.value),
      );
    }),
  );
}

function jsxAttributeValueToExpression(
  value: t.JSXAttribute["value"],
): t.Expression {
  if (!value) {
    return t.booleanLiteral(true);
  }

  if (t.isStringLiteral(value)) {
    return t.stringLiteral(value.value);
  }

  if (t.isJSXElement(value)) {
    return convertJsxElementDescriptor(value);
  }

  if (!t.isJSXExpressionContainer(value) || !t.isExpression(value.expression)) {
    throw new Error(
      "Unsupported JSX attribute value in Trans embedded components",
    );
  }

  return value.expression;
}

const GENERATE_OPTIONS = {
  comments: true,
  jsescOption: { minimal: true },
  retainLines: false,
} as const;

function getRuntimeTransLocalName(node: t.JSXElement): string | null {
  const name = node.openingElement.name;
  return t.isJSXIdentifier(name) ? name.name : null;
}

function removeRuntimeTransImports(
  statements: t.Statement[],
  runtimeTransLocalsToRemove: ReadonlySet<string>,
): t.Statement[] {
  if (runtimeTransLocalsToRemove.size === 0) {
    return statements;
  }

  return statements.flatMap((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== RUNTIME_PACKAGE
    ) {
      return [statement];
    }

    statement.specifiers = statement.specifiers.filter((specifier) => {
      return !(
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "RuntimeTrans" }) &&
        runtimeTransLocalsToRemove.has(specifier.local.name)
      );
    });

    return statement.specifiers.length > 0 ? [statement] : [];
  });
}
