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

export type MdxJsxAttribute = {
  type: "mdxJsxAttribute";
  name: string;
  value?: string | MdxJsxAttributeValueExpression | null;
};

export type MdxTextNode = MdxNodeBase & {
  type: "text";
  value: string;
};

export type MdxInlineCodeNode = MdxNodeBase & {
  type: "inlineCode";
  value: string;
};

export type MdxBreakNode = MdxNodeBase & {
  type: "break";
};

export type MdxParagraphNode = MdxNodeBase & {
  type: "paragraph";
  children: MdxChildNode[];
};

export type MdxLinkNode = MdxNodeBase & {
  type: "link";
  url: string;
  title?: string | null;
  children: MdxChildNode[];
};

export type MdxEmphasisNode = MdxNodeBase & {
  type: "emphasis" | "strong";
  children: MdxChildNode[];
};

export type MdxEsmNode = MdxNodeBase & {
  type: "mdxjsEsm";
  value: string;
};

export type MdxExpressionNode = MdxNodeBase & {
  type: "mdxTextExpression" | "mdxFlowExpression";
  value: string;
};

export type MdxJsxElementNode = MdxNodeBase & {
  type: "mdxJsxTextElement" | "mdxJsxFlowElement";
  name: string | null;
  attributes: MdxJsxAttribute[];
  children: MdxChildNode[];
};

type PositionedNode = MdxEsmNode | MdxExpressionNode | MdxJsxElementNode;

export type MdxChildNode =
  | MdxTextNode
  | MdxInlineCodeNode
  | MdxBreakNode
  | MdxParagraphNode
  | MdxLinkNode
  | MdxEmphasisNode
  | MdxExpressionNode
  | MdxJsxElementNode;

export type MdxRange = {
  start: number;
  end: number;
};

export interface ParsedMdxDocument {
  root: Root;
  esmNodes: MdxEsmNode[];
  expressionNodes: MdxExpressionNode[];
  attributeExpressionNodes: MdxAttributeExpressionNode[];
  componentNodes: MdxJsxElementNode[];
  macroBindings: MacroBindings;
}

export interface MdxAttributeExpressionNode {
  parent: MdxJsxElementNode;
  attribute: MdxJsxAttribute;
  expression: MdxJsxAttributeValueExpression;
  range: MdxRange;
}

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
