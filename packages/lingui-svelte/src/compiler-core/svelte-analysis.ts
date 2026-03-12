import { parse, type AST } from "svelte/compiler";

import { EXPRESSION_KEYS } from "./constants.ts";
import type {
  MarkupExpression,
  RangeNode,
  ScriptBlock,
  ScriptKind,
  ScriptLang,
  SvelteAnalysis,
} from "./types.ts";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function hasRange(value: unknown): value is RangeNode {
  return (
    isRecord(value) &&
    typeof value.start === "number" &&
    typeof value.end === "number"
  );
}

function getLang(script: AST.Script | null): ScriptLang {
  const langAttribute = script?.attributes.find(
    (attribute) => attribute.name === "lang",
  );

  if (!langAttribute || !Array.isArray(langAttribute.value)) {
    return "js";
  }

  const [value] = langAttribute.value;
  return value?.type === "Text" && value.data === "ts" ? "ts" : "js";
}

function toScriptBlock(
  script: AST.Script | null,
  kind: ScriptKind,
  source: string,
): ScriptBlock | null {
  if (!script) {
    return null;
  }

  const openTagEnd = source.indexOf(">", script.start);
  const closeTagStart = source.lastIndexOf("</script", script.end);
  const contentStart = openTagEnd === -1 ? script.start : openTagEnd + 1;
  const contentEnd = closeTagStart === -1 ? script.end : closeTagStart;

  return {
    kind,
    start: script.start,
    end: script.end,
    contentStart,
    contentEnd,
    content: source.slice(contentStart, contentEnd),
    lang: getLang(script),
    attributes: script.attributes,
  };
}

function collectExpressions(
  source: string,
  fragment: AST.Fragment,
): MarkupExpression[] {
  const seen = new Set<string>();
  const expressions: MarkupExpression[] = [];

  const visit = (node: unknown): void => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.type === "Fragment" && Array.isArray(node.nodes)) {
      visit(node.nodes);
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (key === "instance" || key === "module" || key === "content") {
        return;
      }

      if (EXPRESSION_KEYS.has(key) && hasRange(value)) {
        const identity = `${value.start}:${value.end}`;

        if (!seen.has(identity)) {
          seen.add(identity);
          expressions.push({
            index: expressions.length,
            start: value.start,
            end: value.end,
            source: source.slice(value.start, value.end),
          });
        }
        return;
      }

      visit(value);
    });
  };

  visit(fragment);
  return expressions;
}

export function analyzeSvelte(
  source: string,
  filename?: string,
): SvelteAnalysis {
  const ast = parse(source, { filename, modern: true });

  return {
    instance: toScriptBlock(ast.instance, "instance", source),
    module: toScriptBlock(ast.module, "module", source),
    expressions: collectExpressions(source, ast.fragment),
  };
}
