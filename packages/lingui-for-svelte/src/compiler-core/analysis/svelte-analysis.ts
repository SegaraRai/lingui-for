import { parseSync } from "@babel/core";
import type * as t from "@babel/types";
import { parse, type AST } from "svelte/compiler";

import { babelTraverse } from "lingui-for-shared/compiler";
import { getParserPlugins } from "../shared/config.ts";
import {
  expressionUsesMacroBinding,
  parseMacroBindings,
} from "../shared/macro-bindings.ts";
import { REACTIVE_MACRO_PREFIX } from "../shared/constants.ts";
import type { ScriptKind, ScriptLang } from "../shared/types.ts";
import type {
  MacroComponent,
  MarkupExpression,
  RangeNode,
  ScriptBlock,
  SvelteAnalysis,
} from "./types.ts";

type ElementLike =
  | AST.Component
  | AST.TitleElement
  | AST.SlotElement
  | AST.RegularElement
  | AST.SvelteBody
  | AST.SvelteComponent
  | AST.SvelteDocument
  | AST.SvelteElement
  | AST.SvelteFragment
  | AST.SvelteBoundary
  | AST.SvelteHead
  | AST.SvelteOptionsRaw
  | AST.SvelteSelf
  | AST.SvelteWindow;

type ElementAttribute = AST.Component["attributes"][number];

type TemplateNode = AST.Fragment["nodes"][number];

function hasRange(value: unknown): value is RangeNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}

function toRangeNodes(...values: unknown[]): RangeNode[] {
  return values.filter(hasRange);
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

function collectAttributeValueExpressions(
  value: AST.Attribute["value"],
): RangeNode[] {
  if (value === true) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((part) =>
      part.type === "ExpressionTag" ? toRangeNodes(part.expression) : [],
    );
  }

  return value.type === "ExpressionTag" ? toRangeNodes(value.expression) : [];
}

function getExpressionCandidates(
  node: TemplateNode | ElementAttribute,
): RangeNode[] {
  switch (node.type) {
    case "ExpressionTag":
    case "HtmlTag":
    case "RenderTag":
    case "AttachTag":
    case "SpreadAttribute":
    case "AwaitBlock":
    case "KeyBlock":
    case "SnippetBlock":
      return toRangeNodes(node.expression);

    case "SvelteComponent":
      return toRangeNodes(node.expression);

    case "SvelteElement":
      return toRangeNodes(node.tag);

    case "EachBlock":
      return toRangeNodes(node.expression, node.key);

    case "IfBlock":
      return toRangeNodes(node.test);

    case "ConstTag":
      return toRangeNodes(node.declaration.declarations[0].init);

    case "AnimateDirective":
    case "BindDirective":
    case "ClassDirective":
    case "OnDirective":
    case "TransitionDirective":
    case "UseDirective":
      return toRangeNodes(node.expression);

    case "StyleDirective":
    case "Attribute":
      return collectAttributeValueExpressions(node.value);

    default:
      return [];
  }
}

function visitAttributes(
  attributes: ElementAttribute[],
  visitAttribute: (attribute: ElementAttribute) => void,
): void {
  attributes.forEach(visitAttribute);
}

function visitElementChildren(
  element: ElementLike,
  visitNode: (node: TemplateNode) => void,
  visitAttribute: (attribute: ElementAttribute) => void,
): void {
  visitAttributes(element.attributes, visitAttribute);
  element.fragment.nodes.forEach(visitNode);
}

/**
 * Collects the absolute source ranges for `$`-sigils that must be stripped
 * before passing a template expression to the Lingui macro Babel plugin.
 *
 * Uses Babel's AST to locate `$name` identifiers that are the *tag* of a
 * `TaggedTemplateExpression` or the *callee* of a `CallExpression`. This
 * ensures that `$t()` or `$t\`\`` appearing as **literal text** inside a
 * template literal's string content are never treated as strip targets.
 */
function collectReactiveStripRanges(
  snippet: string,
  snippetOffset: number,
  reactiveStrings: ReadonlySet<string>,
  parserPlugins: ReturnType<typeof getParserPlugins>,
): Array<{ start: number; end: number }> {
  const stripRanges: Array<{ start: number; end: number }> = [];
  // Wrap in `(\n…\n)` so any expression is valid without ASI ambiguity.
  // Positions in the Babel AST are therefore offset by `prefix.length`.
  const prefix = "(\n";
  let file: t.File | null = null;
  try {
    file = parseSync(`${prefix}${snippet}\n)`, {
      parserOpts: { plugins: parserPlugins, strictMode: false },
      configFile: false,
      babelrc: false,
    }) as t.File | null;
  } catch {
    return stripRanges;
  }
  if (!file) return stripRanges;

  babelTraverse(file, {
    TaggedTemplateExpression(path) {
      const tag = path.get("tag");
      if (tag.isIdentifier()) {
        const name = tag.node.name;
        if (
          name.startsWith(REACTIVE_MACRO_PREFIX) &&
          reactiveStrings.has(name.slice(REACTIVE_MACRO_PREFIX.length))
        ) {
          const pos = tag.node.start;
          if (pos != null) {
            const absPos = snippetOffset + pos - prefix.length;
            stripRanges.push({ start: absPos, end: absPos + 1 });
          }
        }
      }
    },
    CallExpression(path) {
      const callee = path.get("callee");
      if (callee.isIdentifier()) {
        const name = callee.node.name;
        if (
          name.startsWith(REACTIVE_MACRO_PREFIX) &&
          reactiveStrings.has(name.slice(REACTIVE_MACRO_PREFIX.length))
        ) {
          const pos = callee.node.start;
          if (pos != null) {
            const absPos = snippetOffset + pos - prefix.length;
            stripRanges.push({ start: absPos, end: absPos + 1 });
          }
        }
      }
    },
  });

  return stripRanges;
}

function applyBoundaryStripRanges(
  start: number,
  end: number,
  stripRanges: ReadonlyArray<{ start: number; end: number }>,
): { normalizedStart: number; normalizedEnd: number } {
  let normalizedStart = start;
  let normalizedEnd = end;

  while (true) {
    const leading = stripRanges.find(
      (range) => range.start === normalizedStart,
    );
    if (!leading) {
      break;
    }
    normalizedStart = leading.end;
  }

  while (true) {
    const trailing = stripRanges.find((range) => range.end === normalizedEnd);
    if (!trailing) {
      break;
    }
    normalizedEnd = trailing.start;
  }

  return { normalizedStart, normalizedEnd };
}

function collectExpressions(
  source: string,
  fragment: AST.Fragment,
  componentBindings: ReadonlySet<string>,
  reactiveStrings: ReadonlySet<string>,
  parserPlugins: ReturnType<typeof getParserPlugins>,
  expressionSourceUsesMacro: (source: string) => boolean,
): {
  expressions: MarkupExpression[];
  components: MacroComponent[];
} {
  const seen = new Set<string>();
  const expressions: MarkupExpression[] = [];
  const components: MacroComponent[] = [];

  const addExpression = (candidate: RangeNode): void => {
    const identity = `${candidate.start}:${candidate.end}`;

    if (
      seen.has(identity) ||
      !expressionSourceUsesMacro(source.slice(candidate.start, candidate.end))
    ) {
      return;
    }

    seen.add(identity);

    // Use Babel's AST to locate only the tag/callee positions that carry a
    // `$`-sigil, so that `$t()` or `$t\`\`` appearing as *literal text* inside
    // a template literal's string content is never incorrectly stripped.
    const stripRanges = collectReactiveStripRanges(
      source.slice(candidate.start, candidate.end),
      candidate.start,
      reactiveStrings,
      parserPlugins,
    );
    const { normalizedStart, normalizedEnd } = applyBoundaryStripRanges(
      candidate.start,
      candidate.end,
      stripRanges,
    );

    expressions.push({
      index: expressions.length,
      start: candidate.start,
      end: candidate.end,
      source: source.slice(candidate.start, candidate.end),
      normalizedStart,
      normalizedEnd,
      stripRanges,
    });
  };

  const visitAttribute = (attribute: ElementAttribute): void => {
    getExpressionCandidates(attribute).forEach(addExpression);

    if (attribute.type === "AttachTag") {
      return;
    }
  };

  const visitNode = (node: TemplateNode): void => {
    if (node.type === "Component" && componentBindings.has(node.name)) {
      components.push({
        index: components.length,
        name: node.name,
        start: node.start,
        end: node.end,
        source: source.slice(node.start, node.end),
      });
      return;
    }

    getExpressionCandidates(node).forEach(addExpression);

    switch (node.type) {
      case "Component":
      case "TitleElement":
      case "SlotElement":
      case "RegularElement":
      case "SvelteBody":
      case "SvelteComponent":
      case "SvelteDocument":
      case "SvelteElement":
      case "SvelteFragment":
      case "SvelteBoundary":
      case "SvelteHead":
      case "SvelteOptions":
      case "SvelteSelf":
      case "SvelteWindow":
        visitElementChildren(node, visitNode, visitAttribute);
        return;

      case "IfBlock":
        node.consequent.nodes.forEach(visitNode);
        node.alternate?.nodes.forEach(visitNode);
        return;

      case "EachBlock":
        node.body.nodes.forEach(visitNode);
        node.fallback?.nodes.forEach(visitNode);
        return;

      case "AwaitBlock":
        node.pending?.nodes.forEach(visitNode);
        node.then?.nodes.forEach(visitNode);
        node.catch?.nodes.forEach(visitNode);
        return;

      case "KeyBlock":
        node.fragment.nodes.forEach(visitNode);
        return;

      case "SnippetBlock":
        node.body.nodes.forEach(visitNode);
        return;
    }
  };

  fragment.nodes.forEach(visitNode);

  return {
    expressions,
    components,
  };
}

/**
 * Parses a Svelte component and extracts the script/template fragments needed by the macro pipeline.
 *
 * @param source Full `.svelte` source text.
 * @param filename Logical filename used for Svelte parsing and downstream source maps.
 * @returns A {@link SvelteAnalysis} containing the module script, instance script, template
 * expressions that reference macro bindings, and component macro nodes.
 *
 * This is the entry point for Svelte-side analysis before synthetic-program construction.
 * It parses the modern Svelte AST, infers the language used for expression probing, collects
 * imported macro bindings from the instance script, and then walks the template AST to keep
 * only expression sites and components that are actually relevant to lingui-for-svelte.
 */
export function analyzeSvelte(
  source: string,
  filename: string,
): SvelteAnalysis {
  const ast = parse(source, { filename, modern: true });
  const instance = toScriptBlock(ast.instance, "instance", source);
  const module = toScriptBlock(ast.module, "module", source);
  const expressionLang = instance?.lang ?? module?.lang ?? "ts";
  const macroBindings = instance
    ? parseMacroBindings(instance.content, instance.lang)
    : parseMacroBindings("", expressionLang);
  const parserPlugins = getParserPlugins(expressionLang);
  const { expressions, components } = collectExpressions(
    source,
    ast.fragment,
    macroBindings.components,
    macroBindings.reactiveStrings,
    parserPlugins,
    (expressionSource) =>
      expressionUsesMacroBinding(
        expressionSource,
        expressionLang,
        macroBindings,
      ),
  );

  return {
    instance,
    module,
    expressions,
    components,
  };
}
