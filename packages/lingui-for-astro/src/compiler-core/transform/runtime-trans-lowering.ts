import { generate } from "@babel/generator";
import * as t from "@babel/types";

import {
  PACKAGE_RUNTIME,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../shared/constants.ts";
import type { ProgramTransform } from "./types.ts";

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

export function lowerSyntheticComponentDeclaration(
  transformed: ProgramTransform,
  runtimeTransComponentName: string,
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
      !declaration.id.name.startsWith(SYNTHETIC_PREFIX_COMPONENT) ||
      !declaration.init ||
      !t.isJSXElement(declaration.init)
    ) {
      continue;
    }

    return convertRuntimeTransJsxToAstro(
      declaration.init,
      runtimeTransComponentName,
      options.compact ?? false,
    );
  }

  throw new Error("Expected a lowered RuntimeTrans JSX declaration");
}

function convertRuntimeTransJsxToAstro(
  node: t.JSXElement,
  runtimeTransComponentName: string,
  compact: boolean,
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
      "Unsupported namespaced JSX attribute in RuntimeTrans lowering",
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

  return t.objectExpression(
    argument.properties.map((property) => {
      if (t.isSpreadElement(property)) {
        return t.spreadElement(property.argument);
      }

      if (!t.isObjectProperty(property)) {
        throw new Error(
          "Unsupported object method in RuntimeTrans spread props",
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
    throw new Error(`Unsupported JSX attribute value for "${name}"`);
  }

  if (name === "components") {
    return convertComponentsExpression(value.expression);
  }

  if (!t.isExpression(value.expression)) {
    throw new Error(`Unsupported JSX expression value for "${name}"`);
  }

  return value.expression;
}

function convertComponentsExpression(
  expression: t.Expression | t.JSXEmptyExpression,
): t.Expression {
  if (!t.isObjectExpression(expression)) {
    throw new Error(
      "RuntimeTrans components must lower from an object expression",
    );
  }

  return t.objectExpression(
    expression.properties.map((property) => {
      if (t.isSpreadElement(property)) {
        return t.spreadElement(property.argument);
      }

      if (!t.isObjectProperty(property)) {
        throw new Error("Unsupported object method in RuntimeTrans components");
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
    throw new Error("Unsupported RuntimeTrans component value");
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
    throw new Error("JSX namespaced elements are not supported");
  }

  if (t.isJSXIdentifier(name)) {
    if (/^[a-z]/.test(name.name)) {
      return { kind: "element", name: name.name };
    }

    return { kind: "component", expression: t.identifier(name.name) };
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
        throw new Error("Unsupported namespaced JSX attribute");
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
    throw new Error("Unsupported JSX attribute value");
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

export function stripRuntimeTransImports(program: t.Program): void {
  program.body = program.body.flatMap((statement) => {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== PACKAGE_RUNTIME
    ) {
      return [statement];
    }

    statement.specifiers = statement.specifiers.filter((specifier) => {
      return !(
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "RuntimeTrans" })
      );
    });

    return statement.specifiers.length > 0 ? [statement] : [];
  });
}
