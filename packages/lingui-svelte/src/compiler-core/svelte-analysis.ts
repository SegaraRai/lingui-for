import { parse, type AST } from "svelte/compiler";

import { COMPONENT_MACRO_NAMES, EXPRESSION_KEYS } from "./constants.ts";
import type {
  MacroComponent,
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
): {
  expressions: MarkupExpression[];
  components: MacroComponent[];
} {
  const seen = new Set<string>();
  const expressions: MarkupExpression[] = [];
  const components: MacroComponent[] = [];

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

    if (
      node.type === "Component" &&
      typeof node.name === "string" &&
      COMPONENT_MACRO_NAMES.has(node.name) &&
      typeof node.start === "number" &&
      typeof node.end === "number"
    ) {
      components.push({
        index: components.length,
        name: node.name,
        start: node.start,
        end: node.end,
        source: source.slice(node.start, node.end),
      });
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
  return {
    expressions,
    components,
  };
}

export function analyzeSvelte(
  source: string,
  filename?: string,
): SvelteAnalysis {
  const ast = parse(source, { filename, modern: true });
  const { expressions, components } = collectExpressions(source, ast.fragment);

  return {
    instance: toScriptBlock(ast.instance, "instance", source),
    module: toScriptBlock(ast.module, "module", source),
    expressions,
    components,
  };
}
