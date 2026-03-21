import { generate } from "@babel/generator";
import * as t from "@babel/types";

import { LINGUI_RUNTIME_TRANS_EXPORT } from "./lingui-constants.ts";

export type ProgramTransformLike<TMap> = {
  code: string;
  ast: t.File;
  map: TMap | null;
};

export type MappedCodeFragment<TMap> = {
  code: string;
  map: TMap | null;
};

type SplitSyntheticDeclarationsOptions = {
  runtimePackageName: string;
  runtimeTransComponentName: string;
  syntheticExpressionPrefix: string;
  syntheticComponentPrefix: string;
  shouldRemoveRuntimeTransImport: (localName: string) => boolean;
};

const GENERATE_OPTIONS = {
  comments: true,
  jsescOption: { minimal: true },
  retainLines: false,
} as const;

const COMPACT_GENERATE_OPTIONS = {
  comments: false,
  compact: true,
  jsescOption: { minimal: true },
  retainLines: false,
} as const;

function getGenerateOptions(compact: boolean) {
  return compact ? COMPACT_GENERATE_OPTIONS : GENERATE_OPTIONS;
}

export function splitSyntheticDeclarations<TMap>(
  transformed: ProgramTransformLike<TMap>,
  options: SplitSyntheticDeclarationsOptions,
): {
  script: MappedCodeFragment<TMap>;
  expressionReplacements: Map<number, MappedCodeFragment<TMap>>;
  componentReplacements: Map<number, MappedCodeFragment<TMap>>;
} {
  const retained: t.Statement[] = [];
  const expressionReplacements = new Map<number, MappedCodeFragment<TMap>>();
  const componentReplacements = new Map<number, MappedCodeFragment<TMap>>();
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

    if (declaration.id.name.startsWith(options.syntheticExpressionPrefix)) {
      const index = Number(
        declaration.id.name.slice(options.syntheticExpressionPrefix.length),
      );

      if (Number.isFinite(index) && declaration.init) {
        expressionReplacements.set(index, {
          code: generate(declaration.init, GENERATE_OPTIONS).code,
          map: null,
        });
        return;
      }
    }

    if (declaration.id.name.startsWith(options.syntheticComponentPrefix)) {
      const index = Number(
        declaration.id.name.slice(options.syntheticComponentPrefix.length),
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
        componentReplacements.set(index, {
          code: convertRuntimeTransJsxToMarkup(
            declaration.init,
            options.runtimeTransComponentName,
          ),
          map: null,
        });
        return;
      }
    }

    retained.push(statement);
  });

  const script = createMappedOutput(
    t.file(
      t.program(
        removeRuntimeTransImports(
          retained,
          options.runtimePackageName,
          (localName) =>
            runtimeTransLocalsToRemove.has(localName) ||
            options.shouldRemoveRuntimeTransImport(localName),
        ),
        [],
        "module",
      ),
    ),
    transformed,
  );

  Array.from(expressionReplacements.keys()).forEach((index) => {
    const declaration = findSyntheticDeclaration(
      transformed.ast.program.body,
      `${options.syntheticExpressionPrefix}${index}`,
    );

    if (declaration?.init) {
      expressionReplacements.set(
        index,
        createMappedOutput(declaration.init, transformed),
      );
    }
  });

  return {
    script,
    expressionReplacements,
    componentReplacements,
  };
}

export function lowerSyntheticComponentDeclaration<TMap>(
  transformed: ProgramTransformLike<TMap>,
  runtimeTransComponentName: string,
  syntheticComponentPrefix: string,
  options: {
    compact?: boolean;
  } = {},
): string {
  for (const statement of transformed.ast.program.body) {
    if (
      !t.isVariableDeclaration(statement) ||
      statement.declarations.length !== 1
    ) {
      continue;
    }

    const [declaration] = statement.declarations;
    if (
      !declaration ||
      !t.isIdentifier(declaration.id) ||
      !declaration.id.name.startsWith(syntheticComponentPrefix) ||
      !declaration.init ||
      !t.isJSXElement(declaration.init)
    ) {
      continue;
    }

    return convertRuntimeTransJsxToMarkup(
      declaration.init,
      runtimeTransComponentName,
      options.compact ?? false,
    );
  }

  throw new Error("Expected a lowered RuntimeTrans JSX declaration");
}

export function stripRuntimeTransImports(
  program: t.Program,
  runtimePackageName: string,
  shouldRemoveRuntimeTransImport: (localName: string) => boolean = () => true,
): void {
  program.body = removeRuntimeTransImports(
    program.body,
    runtimePackageName,
    shouldRemoveRuntimeTransImport,
  );
}

export function createMappedOutput<TMap>(
  node: t.Node,
  transformed: ProgramTransformLike<TMap>,
): MappedCodeFragment<TMap> {
  const generated = generate(
    node,
    {
      comments: true,
      jsescOption: { minimal: true },
      retainLines: false,
      sourceMaps: true,
      sourceFileName: getSourceFileName(transformed.map) ?? "input.js",
    },
    transformed.code,
  );

  return {
    code: generated.code,
    map: (generated.map as TMap | null | undefined) ?? null,
  };
}

export function convertRuntimeTransJsxToMarkup(
  node: t.JSXElement,
  runtimeTransComponentName: string,
  compact = false,
): string {
  const opening = node.openingElement;
  const attributes = opening.attributes
    .map((attribute) => convertRuntimeTransAttribute(attribute, compact))
    .join("");

  return `<${runtimeTransComponentName}${attributes} />`;
}

function convertRuntimeTransAttribute(
  attribute: t.JSXAttribute | t.JSXSpreadAttribute,
  compact: boolean,
): string {
  if (t.isJSXSpreadAttribute(attribute)) {
    return ` {...${generate(convertRuntimeTransSpreadArgument(attribute.argument), getGenerateOptions(compact)).code}}`;
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
  return ` ${name}={${generate(expression, getGenerateOptions(compact)).code}}`;
}

function convertRuntimeTransSpreadArgument(
  argument: t.Expression,
): t.Expression {
  if (!t.isObjectExpression(argument)) {
    return argument;
  }

  const loweredProperties: (t.ObjectProperty | t.SpreadElement)[] = [];

  argument.properties.forEach((property) => {
    if (t.isSpreadElement(property)) {
      loweredProperties.push(t.spreadElement(property.argument));
      return;
    }

    if (!t.isObjectProperty(property)) {
      throw new Error(
        "Unsupported object method in runtime Trans spread props",
      );
    }

    if (getObjectPropertyName(property.key) === "components") {
      loweredProperties.push(
        t.objectProperty(
          property.key,
          t.isExpression(property.value)
            ? convertComponentsExpression(property.value)
            : convertRichTextComponentValue(property.value),
          property.computed,
        ),
      );
      return;
    }

    loweredProperties.push(property);
  });

  const lowered = t.objectExpression(loweredProperties);
  t.inheritsComments(lowered, argument);
  return lowered;
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

function getRuntimeTransLocalName(node: t.JSXElement): string | null {
  const name = node.openingElement.name;
  return t.isJSXIdentifier(name) ? name.name : null;
}

function findSyntheticDeclaration(
  statements: readonly t.Statement[],
  name: string,
): t.VariableDeclarator | null {
  for (const statement of statements) {
    if (
      !t.isVariableDeclaration(statement) ||
      statement.declarations.length !== 1
    ) {
      continue;
    }

    const declaration = statement.declarations[0];

    if (t.isIdentifier(declaration?.id, { name })) {
      return declaration;
    }
  }

  return null;
}

function removeRuntimeTransImports(
  statements: t.Statement[],
  runtimePackageName: string,
  shouldRemoveRuntimeTransImport: (localName: string) => boolean,
): t.Statement[] {
  return statements.flatMap((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== runtimePackageName
    ) {
      return [statement];
    }

    statement.specifiers = statement.specifiers.filter((specifier) => {
      return !(
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, {
          name: LINGUI_RUNTIME_TRANS_EXPORT,
        }) &&
        shouldRemoveRuntimeTransImport(specifier.local.name)
      );
    });

    return statement.specifiers.length > 0 ? [statement] : [];
  });
}

function getSourceFileName<TMap>(map: TMap | null): string | null {
  if (!map || typeof map !== "object") {
    return null;
  }

  const candidate = map as {
    file?: string;
    sources?: string[];
  };

  return candidate.file ?? candidate.sources?.[0] ?? null;
}
