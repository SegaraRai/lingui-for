import type { Root } from "mdast";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visitParents } from "unist-util-visit-parents";

import {
  expressionUsesMacroBinding,
  parseMacroBindings,
  type MacroBindings,
} from "../compiler-core/shared/macro-bindings.ts";

type MdxPosition = {
  start: {
    offset?: number | null;
  };
  end: {
    offset?: number | null;
  };
};

type MdxNodeBase = {
  type: string;
  position?: MdxPosition | null;
};

/**
 * Expression-valued MDX JSX attribute such as `title={t\`...\`}`.
 */
export type MdxJsxAttributeValueExpression = {
  type: "mdxJsxAttributeValueExpression";
  value: string;
  data?: {
    estree?: {
      body?: Array<{
        expression?: {
          range?: [number, number];
          start?: number;
          end?: number;
        };
      }>;
    };
  };
};

/**
 * MDX JSX attribute extracted from an inline or block JSX element.
 */
export type MdxJsxAttribute = {
  type: "mdxJsxAttribute";
  name: string;
  value?: string | MdxJsxAttributeValueExpression | null;
};

/**
 * Plain text child node in MDX content.
 */
export type MdxTextNode = MdxNodeBase & {
  type: "text";
  value: string;
};

/**
 * Inline code child node in MDX content.
 */
export type MdxInlineCodeNode = MdxNodeBase & {
  type: "inlineCode";
  value: string;
};

/**
 * Hard line-break child node in MDX content.
 */
export type MdxBreakNode = MdxNodeBase & {
  type: "break";
};

/**
 * Paragraph child node in MDX content.
 */
export type MdxParagraphNode = MdxNodeBase & {
  type: "paragraph";
  children: MdxChildNode[];
};

/**
 * Link child node in MDX content.
 */
export type MdxLinkNode = MdxNodeBase & {
  type: "link";
  url: string;
  title?: string | null;
  children: MdxChildNode[];
};

/**
 * Emphasis or strong child node in MDX content.
 */
export type MdxEmphasisNode = MdxNodeBase & {
  type: "emphasis" | "strong";
  children: MdxChildNode[];
};

/**
 * Top-level MDX ESM block.
 */
export type MdxEsmNode = MdxNodeBase & {
  type: "mdxjsEsm";
  value: string;
};

/**
 * Inline or flow expression node in MDX content.
 */
export type MdxExpressionNode = MdxNodeBase & {
  type: "mdxTextExpression" | "mdxFlowExpression";
  value: string;
};

/**
 * Inline or flow JSX element node in MDX content.
 */
export type MdxJsxElementNode = MdxNodeBase & {
  type: "mdxJsxTextElement" | "mdxJsxFlowElement";
  name: string | null;
  attributes: MdxJsxAttribute[];
  children: MdxChildNode[];
};

type PositionedNode = MdxEsmNode | MdxExpressionNode | MdxJsxElementNode;

/**
 * Child node supported by the MDX `<Trans>` serialization pipeline.
 */
export type MdxChildNode =
  | MdxTextNode
  | MdxInlineCodeNode
  | MdxBreakNode
  | MdxParagraphNode
  | MdxLinkNode
  | MdxEmphasisNode
  | MdxExpressionNode
  | MdxJsxElementNode;

/**
 * Byte-based half-open range within the original MDX source.
 */
export type MdxRange = {
  /**
   * Inclusive start offset.
   */
  start: number;
  /**
   * Exclusive end offset.
   */
  end: number;
};

/**
 * Parsed MDX document plus the Lingui-relevant nodes extracted from it.
 */
export interface ParsedMdxDocument {
  /**
   * Full mdast root returned by the parser.
   */
  root: Root;
  /**
   * Top-level ESM blocks found in the document.
   */
  esmNodes: MdxEsmNode[];
  /**
   * Expression nodes that reference imported Lingui macros.
   */
  expressionNodes: MdxExpressionNode[];
  /**
   * Attribute expressions that reference imported Lingui macros.
   */
  attributeExpressionNodes: MdxAttributeExpressionNode[];
  /**
   * JSX element nodes that correspond to imported component macros such as `Trans`.
   */
  componentNodes: MdxJsxElementNode[];
  /**
   * Macro import summary extracted from the document's ESM blocks.
   */
  macroBindings: MacroBindings;
}

/**
 * Attribute expression site that matched a Lingui macro binding.
 */
export interface MdxAttributeExpressionNode {
  /**
   * JSX element that owns the attribute.
   */
  parent: MdxJsxElementNode;
  /**
   * Original MDX attribute node.
   */
  attribute: MdxJsxAttribute;
  /**
   * Expression-valued attribute payload.
   */
  expression: MdxJsxAttributeValueExpression;
  /**
   * Source range of the inner JavaScript expression.
   */
  range: MdxRange;
}

/**
 * Parses an MDX document and extracts the nodes relevant to Lingui transforms.
 *
 * @param source Original MDX source without frontmatter.
 * @returns The parsed root plus Lingui-relevant ESM blocks, expressions, attribute expressions,
 * component macro nodes, and macro import bindings.
 *
 * This is the source-level MDX analysis entry point used by both runtime transforms and
 * extraction. It intentionally tracks only the node kinds currently supported by the Lingui MDX
 * pipeline.
 */
export async function parseMdxDocument(
  source: string,
): Promise<ParsedMdxDocument> {
  const root = unified().use(remarkParse).use(remarkMdx).parse(source);
  const esmNodes = root.children.reduce<MdxEsmNode[]>((collected, node) => {
    if (isMdxEsmNode(node)) {
      collected.push(node);
    }
    return collected;
  }, []);
  const macroBindings = await parseMacroBindings(
    esmNodes.map((node) => node.value).join("\n"),
  );
  const allExpressionNodes: MdxExpressionNode[] = [];
  const allJsxNodes: MdxJsxElementNode[] = [];

  visitParents(root, (node) => {
    if (isMdxExpressionNode(node)) {
      allExpressionNodes.push(node);
      return;
    }

    if (isMdxJsxElementNode(node)) {
      allJsxNodes.push(node);
    }
  });

  const expressionNodes: MdxExpressionNode[] = [];
  const attributeExpressionNodes: MdxAttributeExpressionNode[] = [];
  for (const node of allExpressionNodes) {
    if (await expressionUsesMacroBinding(node.value, macroBindings)) {
      expressionNodes.push(node);
    }
  }

  for (const node of allJsxNodes) {
    for (const attribute of node.attributes) {
      if (!isMdxJsxAttributeValueExpression(attribute.value)) {
        continue;
      }

      if (
        await expressionUsesMacroBinding(attribute.value.value, macroBindings)
      ) {
        attributeExpressionNodes.push({
          parent: node,
          attribute,
          expression: attribute.value,
          range: getMdxAttributeExpressionRange(attribute.value),
        });
      }
    }
  }

  const componentNodes = allJsxNodes.filter(
    (node) => node.name !== null && macroBindings.components.has(node.name),
  );

  return {
    root,
    esmNodes,
    expressionNodes,
    attributeExpressionNodes,
    componentNodes,
    macroBindings,
  };
}

/**
 * Reads the byte range for a positioned MDX node.
 *
 * @param node Positioned ESM, expression, or JSX node.
 * @returns The node's half-open source range.
 */
export function getMdxNodeRange(node: PositionedNode): MdxRange {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;

  if (typeof start !== "number" || typeof end !== "number") {
    throw new TypeError(`Expected MDX node offsets for "${node.type}"`);
  }

  return { start, end };
}

function isMdxEsmNode(node: unknown): node is MdxEsmNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    (node as { type?: unknown }).type === "mdxjsEsm" &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

function isMdxExpressionNode(node: unknown): node is MdxExpressionNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    ((node as { type?: unknown }).type === "mdxTextExpression" ||
      (node as { type?: unknown }).type === "mdxFlowExpression") &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

function isMdxJsxElementNode(node: unknown): node is MdxJsxElementNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    ((node as { type?: unknown }).type === "mdxJsxTextElement" ||
      (node as { type?: unknown }).type === "mdxJsxFlowElement") &&
    Array.isArray((node as { attributes?: unknown }).attributes)
  );
}

function isMdxJsxAttributeValueExpression(
  value: unknown,
): value is MdxJsxAttributeValueExpression {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "mdxJsxAttributeValueExpression" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

function getMdxAttributeExpressionRange(
  value: MdxJsxAttributeValueExpression,
): MdxRange {
  const expression = value.data?.estree?.body?.[0]?.expression;
  const start = expression?.range?.[0] ?? expression?.start;
  const end = expression?.range?.[1] ?? expression?.end;

  if (typeof start !== "number" || typeof end !== "number") {
    throw new TypeError(
      "Expected MDX JSX attribute expression offsets for Lingui macro support",
    );
  }

  return { start, end };
}
