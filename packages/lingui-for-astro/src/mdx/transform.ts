import { generate } from "@babel/generator";
import * as t from "@babel/types";
import MagicString from "magic-string";

import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";
import {
  PACKAGE_MACRO,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_GET_LINGUI_CONTEXT,
  RUNTIME_BINDING_I18N,
  SYNTHETIC_PREFIX_COMPONENT,
} from "../compiler-core/shared/constants.ts";
import type { MacroBindings } from "../compiler-core/shared/macro-bindings.ts";
import { expressionUsesMacroBinding } from "../compiler-core/shared/macro-bindings.ts";
import type {
  LinguiAstroTransformOptions,
  RawSourceMapLike,
} from "../compiler-core/shared/types.ts";
import { transformProgram } from "../compiler-core/transform/babel-transform.ts";
import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "../compiler-core/transform/runtime-trans-lowering.ts";
import { MDX_RUNTIME_TRANS_BINDING } from "./constants.ts";
import { stripMdxFrontmatter } from "./frontmatter.ts";
import {
  getMdxNodeRange,
  parseMdxDocument,
  type MdxAttributeExpressionNode,
  type MdxChildNode,
  type MdxEsmNode,
  type MdxExpressionNode,
  type MdxJsxElementNode,
} from "./parse.ts";

const INLINE_GENERATE_OPTIONS = {
  comments: false,
  compact: true,
  jsescOption: { minimal: true },
  retainLines: false,
} as const;

export async function transformMdxSource(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<{ code: string; map: null }> {
  const { frontmatter, content } = stripMdxFrontmatter(source);
  const parsed = await parseMdxDocument(content);
  const string = new MagicString(content);
  const combinedEsmSource = parsed.esmNodes
    .map((node) => node.value)
    .join("\n");
  const needsAstroI18n =
    parsed.expressionNodes.length > 0 ||
    parsed.attributeExpressionNodes.length > 0 ||
    parsed.componentNodes.length > 0;
  const needsRuntimeTrans = parsed.componentNodes.length > 0;
  const componentRanges = parsed.componentNodes.map(getMdxNodeRange);

  for (const node of [...parsed.attributeExpressionNodes]
    .filter(
      (attributeExpression) =>
        !isRangeInsideAny(attributeExpression.range, componentRanges),
    )
    .sort(byDescendingRange)) {
    string.overwrite(
      node.range.start,
      node.range.end,
      transformMdxExpression(
        node.expression.value,
        parsed.macroBindings,
        options,
      ),
    );
  }

  for (const node of [...parsed.expressionNodes].sort(byDescendingRange)) {
    const range = getMdxNodeRange(node);
    string.overwrite(
      range.start,
      range.end,
      `{${transformMdxExpression(node.value, parsed.macroBindings, options)}}`,
    );
  }

  for (const node of [...parsed.componentNodes].sort(byDescendingRange)) {
    const range = getMdxNodeRange(node);
    const importedName =
      node.name === null
        ? null
        : (parsed.macroBindings.componentImports.get(node.name) ?? null);
    if (!importedName || node.name === null) {
      continue;
    }
    string.overwrite(
      range.start,
      range.end,
      await transformMdxComponent(
        node,
        importedName,
        parsed.macroBindings,
        options,
      ),
    );
  }

  for (const node of [...parsed.esmNodes].sort(byDescendingRange)) {
    const range = getMdxNodeRange(node);
    string.remove(range.start, range.end);
  }

  const transformedEsm = combinedEsmSource.includes(PACKAGE_MACRO)
    ? transformMdxEsm(combinedEsmSource, options)
    : combinedEsmSource.trim();
  const modulePrelude = [
    buildMdxPrelude(needsAstroI18n, needsRuntimeTrans),
    transformedEsm,
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");

  if (modulePrelude.length > 0) {
    string.prepend(`${modulePrelude}\n\n`);
  }

  return {
    code: frontmatter
      ? `${frontmatter}${string.toString()}`
      : string.toString(),
    map: null,
  };
}

export async function createMdxExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<{ code: string; map: RawSourceMapLike | null }[]> {
  const { content } = stripMdxFrontmatter(source);
  const parsed = await parseMdxDocument(content);
  const combinedEsmSource = parsed.esmNodes
    .map((node) => node.value)
    .join("\n");
  const componentRanges = parsed.componentNodes.map(getMdxNodeRange);
  const units: { code: string; map: RawSourceMapLike | null }[] = [];

  if (combinedEsmSource.includes(PACKAGE_MACRO)) {
    const transformed = transformProgram(combinedEsmSource, {
      extract: true,
      filename: `${options.filename}?mdx-esm`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "extract",
    });

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  for (const node of parsed.expressionNodes) {
    const transformed = transformProgram(
      `${createSyntheticMacroImports(parsed.macroBindings.allImports)}\nconst __expr = (\n${node.value}\n);`,
      {
        extract: true,
        filename: `${options.filename}?mdx-expression`,
        linguiConfig: normalizeLinguiConfig(options.linguiConfig),
        translationMode: "extract",
      },
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  for (const node of parsed.attributeExpressionNodes) {
    if (isRangeInsideAny(node.range, componentRanges)) {
      continue;
    }

    const transformed = transformProgram(
      `${createSyntheticMacroImports(parsed.macroBindings.allImports)}\nconst __expr = (\n${node.expression.value}\n);`,
      {
        extract: true,
        filename: `${options.filename}?mdx-attribute`,
        linguiConfig: normalizeLinguiConfig(options.linguiConfig),
        translationMode: "extract",
      },
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  for (const node of parsed.componentNodes) {
    const importedName =
      node.name === null
        ? null
        : (parsed.macroBindings.componentImports.get(node.name) ?? null);
    if (!importedName || node.name === null) {
      continue;
    }
    const transformed = transformProgram(
      `${createSyntheticMacroImports(
        new Map([[node.name, importedName]]),
      )}\nconst ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${await serializeMdxComponentNode(
        node,
        parsed.macroBindings,
        options,
      )}\n);`,
      {
        extract: true,
        filename: `${options.filename}?mdx-component`,
        linguiConfig: normalizeLinguiConfig(options.linguiConfig),
        translationMode: "extract",
      },
    );

    if (isExtractionCodeRelevant(transformed.code)) {
      units.push(transformed);
    }
  }

  return units;
}

function transformMdxEsm(
  source: string,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(source, {
    extract: false,
    filename: `${options.filename}?mdx-esm`,
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: "raw",
  });

  if (transformed.code.includes(`from "@lingui/core"`)) {
    throw new Error(
      `lingui-for-astro MDX does not support translating macros outside rendered JSX content. Use msg/defineMessage in ESM and render them inside JSX instead (${options.filename}).`,
    );
  }

  return transformed.code.trim();
}

function transformMdxExpression(
  source: string,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): string {
  const transformed = transformProgram(
    `${createSyntheticMacroImports(macroBindings.allImports)}\nconst __expr = (\n${source}\n);`,
    {
      extract: false,
      filename: `${options.filename}?mdx-expression`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "astro-context",
      runtimeBinding: RUNTIME_BINDING_I18N,
    },
  );
  const init = extractSyntheticExpressionInit(transformed.ast.program);
  return inlineMdxAstroContext(generate(init, INLINE_GENERATE_OPTIONS).code);
}

async function transformMdxComponent(
  node: MdxJsxElementNode,
  importedName: string,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): Promise<string> {
  const localName = node.name;
  if (!localName) {
    throw new Error("Expected MDX component macro node to have a local name");
  }

  const transformed = transformProgram(
    `${createSyntheticMacroImports(
      new Map([[localName, importedName]]),
    )}\nconst ${SYNTHETIC_PREFIX_COMPONENT}0 = (\n${await serializeMdxComponentNode(
      node,
      macroBindings,
      options,
    )}\n);`,
    {
      extract: false,
      filename: `${options.filename}?mdx-component`,
      linguiConfig: normalizeLinguiConfig(options.linguiConfig),
      translationMode: "astro-context",
      runtimeBinding: RUNTIME_BINDING_I18N,
    },
  );

  stripRuntimeTransImports(transformed.ast.program);
  return inlineMdxAstroContext(
    lowerSyntheticComponentDeclaration(transformed, MDX_RUNTIME_TRANS_BINDING, {
      compact: true,
    }),
  );
}

function extractSyntheticExpressionInit(program: t.Program): t.Expression {
  for (const statement of program.body) {
    if (
      !t.isVariableDeclaration(statement) ||
      statement.declarations.length !== 1
    ) {
      continue;
    }

    const declaration = statement.declarations[0];
    if (
      declaration &&
      t.isIdentifier(declaration.id, { name: "__expr" }) &&
      declaration.init &&
      t.isExpression(declaration.init)
    ) {
      return declaration.init;
    }
  }

  throw new Error("Failed to lower MDX expression macro");
}

function buildMdxPrelude(
  includeAstroContext: boolean,
  includeRuntimeTrans: boolean,
): string {
  const lines: string[] = [];

  if (includeAstroContext) {
    lines.push(
      `import { getMdxLinguiContext as ${RUNTIME_BINDING_GET_LINGUI_CONTEXT} } from "${PACKAGE_RUNTIME}";`,
    );
  }

  if (includeRuntimeTrans) {
    lines.push(
      `import { RuntimeTrans as ${MDX_RUNTIME_TRANS_BINDING} } from "${PACKAGE_RUNTIME}";`,
    );
  }

  return lines.join("\n");
}

function createSyntheticMacroImports(
  bindings: ReadonlyMap<string, string>,
): string {
  if (bindings.size === 0) {
    return "";
  }

  return [...bindings.entries()]
    .map(([localName, importedName]) =>
      importedName === localName
        ? `import { ${importedName} } from "${PACKAGE_MACRO}";`
        : `import { ${importedName} as ${localName} } from "${PACKAGE_MACRO}";`,
    )
    .join("\n");
}

async function serializeMdxComponentNode(
  node: MdxJsxElementNode,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): Promise<string> {
  if (!node.name) {
    throw new Error("Expected MDX JSX element to have a name");
  }

  return `<${node.name}${await serializeMdxAttributes(
    node.attributes,
    macroBindings,
    options,
  )}>${await serializeMdxChildren(
    normalizeTransChildren(node),
    macroBindings,
    options,
  )}</${node.name}>`;
}

function normalizeTransChildren(
  node: MdxJsxElementNode,
): readonly MdxChildNode[] {
  if (node.name !== "Trans") {
    return node.children;
  }

  if (node.children.length === 1 && node.children[0]?.type === "paragraph") {
    return node.children[0].children;
  }

  return node.children;
}

async function serializeMdxAttributes(
  attributes: readonly {
    type: "mdxJsxAttribute";
    name: string;
    value?:
      | string
      | { type: "mdxJsxAttributeValueExpression"; value: string }
      | null;
  }[],
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): Promise<string> {
  const rendered = await Promise.all(
    attributes.map(async (attribute) => {
      if (typeof attribute.value === "string") {
        return ` ${attribute.name}=${JSON.stringify(attribute.value)}`;
      }

      if (!attribute.value) {
        return ` ${attribute.name}`;
      }

      const expression = (await expressionUsesMacroBinding(
        attribute.value.value,
        macroBindings,
      ))
        ? transformMdxExpression(attribute.value.value, macroBindings, options)
        : attribute.value.value;

      return ` ${attribute.name}={${expression}}`;
    }),
  );

  return rendered.join("");
}

async function serializeMdxChildren(
  children: readonly MdxChildNode[],
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): Promise<string> {
  const rendered = await Promise.all(
    children.map((child) => serializeMdxChild(child, macroBindings, options)),
  );
  return rendered.join("");
}

async function serializeMdxChild(
  node: MdxChildNode,
  macroBindings: MacroBindings,
  options: LinguiAstroTransformOptions,
): Promise<string> {
  switch (node.type) {
    case "text":
      return node.value;
    case "inlineCode":
      return `<code>${escapeHtmlText(node.value)}</code>`;
    case "break":
      return "<br />";
    case "paragraph":
      return serializeMdxChildren(node.children, macroBindings, options);
    case "link": {
      const title = node.title ? ` title=${JSON.stringify(node.title)}` : "";
      return `<a href=${JSON.stringify(node.url)}${title}>${await serializeMdxChildren(
        node.children,
        macroBindings,
        options,
      )}</a>`;
    }
    case "emphasis":
      return `<em>${await serializeMdxChildren(node.children, macroBindings, options)}</em>`;
    case "strong":
      return `<strong>${await serializeMdxChildren(node.children, macroBindings, options)}</strong>`;
    case "mdxTextExpression":
    case "mdxFlowExpression":
      return `{${node.value}}`;
    case "mdxJsxTextElement":
    case "mdxJsxFlowElement":
      return serializeMdxComponentNode(node, macroBindings, options);
    default: {
      const exhaustive: never = node;
      throw new Error(
        `Unsupported MDX Trans child node "${(exhaustive as { type?: string }).type ?? "unknown"}"`,
      );
    }
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type ComparableRangeNode =
  | MdxEsmNode
  | MdxExpressionNode
  | MdxJsxElementNode
  | MdxAttributeExpressionNode;

function byDescendingRange(
  left: ComparableRangeNode,
  right: ComparableRangeNode,
): number {
  return getComparableRange(right).start - getComparableRange(left).start;
}

function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}

function inlineMdxAstroContext(code: string): string {
  return code.replaceAll(
    `${RUNTIME_BINDING_I18N}._(`,
    `${RUNTIME_BINDING_GET_LINGUI_CONTEXT}(props).i18n._(`,
  );
}

function getComparableRange(node: ComparableRangeNode) {
  return "range" in node ? node.range : getMdxNodeRange(node);
}

function isRangeInsideAny(
  range: { start: number; end: number },
  containers: readonly { start: number; end: number }[],
): boolean {
  return containers.some(
    (container) => range.start >= container.start && range.end <= container.end,
  );
}
