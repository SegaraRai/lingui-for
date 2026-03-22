import MagicString from "magic-string";

import type { ExtractionUnit } from "lingui-for-shared/compiler";

import {
  createSyntheticMacroImports,
  lowerComponentMacro,
} from "../lower/snippet-lowering.ts";
import { createSveltePlan } from "../plan/index.ts";
import type { MacroBindings } from "../shared/macro-bindings.ts";
import {
  SYNTHETIC_PREFIX_COMPONENT,
  SYNTHETIC_PREFIX_EXPRESSION,
} from "../shared/constants.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";

/**
 * Validates that script macro expressions are using valid Svelte reactive-string
 * syntax (`$t`, `t.eager`, etc.) and throws for bare usages that would lose
 * locale reactivity or be semantically incorrect in a `.svelte` file.
 */
function validateScriptExpression(expression: {
  source: string;
  requiresLinguiContext: boolean;
  stripRanges: ReadonlyArray<unknown>;
}): void {
  if (!expression.requiresLinguiContext || expression.stripRanges.length > 0) {
    return;
  }
  // Bare reactive-string macro usage without $-prefix or .eager.
  const localName =
    expression.source.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)?.[1] ?? "macro";
  const reactiveName = `$${localName}`;
  const replacement =
    localName === "t"
      ? `\`$${localName}(...)\`, \`$${localName}\`...\`\`, \`${localName}.eager(...)\`, or \`${localName}.eager\`...\`\``
      : `\`${reactiveName}(...)\` or \`${localName}.eager(...)\``;
  const detail =
    localName === "t"
      ? "Bare `t` in `.svelte` files is not allowed because it loses locale reactivity."
      : `Bare \`${localName}\` in \`.svelte\` files is only allowed when building a descriptor, for example inside \`msg(...)\`, \`defineMessage(...)\`, \`$t(...)\`, or a \`message:\` field.`;
  throw new Error(`${detail} Use ${replacement} instead.`);
}

export function createExtractionUnits(
  source: string,
  options: LinguiSvelteTransformOptions,
): ExtractionUnit[] {
  const plan = createSveltePlan(source, options);

  // Validate script expressions before building extraction units.
  for (const expression of plan.instanceMacros.expressions) {
    validateScriptExpression(expression);
  }
  for (const expression of plan.moduleMacros.expressions) {
    validateScriptExpression(expression);
  }

  const units: ExtractionUnit[] = [];

  function buildExpressionUnit(
    snippetStart: number,
    snippetEnd: number,
    macroBindings: MacroBindings,
    stripRanges: ReadonlyArray<{ start: number; end: number }>,
  ): ExtractionUnit {
    const prefix = `${createSyntheticMacroImports(macroBindings)}const ${SYNTHETIC_PREFIX_EXPRESSION}0 = (\n`;
    const ms = new MagicString(plan.source, { filename: plan.filename });
    if (snippetStart > 0) {
      ms.remove(0, snippetStart);
    }
    if (snippetEnd < plan.source.length) {
      ms.remove(snippetEnd, plan.source.length);
    }
    // Apply AST-derived strip ranges to remove Svelte-specific syntax
    // ($-reactive prefix, .eager member) at their exact positions so that
    // message text containing $ is never incorrectly altered.
    for (const range of stripRanges) {
      ms.remove(range.start, range.end);
    }
    ms.prepend(prefix);
    const code = ms.toString() + "\n);";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = ms.generateMap({
      source: plan.filename,
      file: plan.filename,
      includeContent: true,
      hires: true,
    }) as any;
    // MagicString computes sources as a path relative to `file`, which collapses
    // to just the basename when source === file. Override with the absolute path
    // so that Lingui can correctly relativize against rootDir.
    map.sources = [plan.filename];
    return { code, map };
  }

  plan.moduleMacros.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.start,
        expression.end,
        plan.moduleBindings,
        expression.stripRanges,
      ),
    );
  });

  plan.instanceMacros.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.start,
        expression.end,
        plan.instanceBindings,
        expression.stripRanges,
      ),
    );
  });

  plan.analysis.expressions.forEach((expression) => {
    units.push(
      buildExpressionUnit(
        expression.start,
        expression.end,
        plan.macroBindings,
        expression.stripRanges,
      ),
    );
  });

  // Component macros are lowered via Plan A (transformProgram with extract:true)
  // to correctly handle nested core macros (e.g. selectOrdinal inside Plural
  // attribute values). A source map is built by overwriting the component range
  // with the lowered code so that MagicString maps every position in the
  // lowered code back to the component's start position in the original source.
  plan.analysis.components.forEach((component) => {
    const lowered = lowerComponentMacro(
      component.source,
      component.start,
      plan,
      { extract: true },
    );
    const componentEnd = component.start + component.source.length;
    const ms = new MagicString(plan.source, { filename: plan.filename });
    if (component.start > 0) {
      ms.remove(0, component.start);
    }
    if (componentEnd < plan.source.length) {
      ms.remove(componentEnd, plan.source.length);
    }
    ms.overwrite(component.start, componentEnd, lowered.code);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = ms.generateMap({
      source: plan.filename,
      file: plan.filename,
      includeContent: false,
      hires: false,
    }) as any;
    map.sources = [plan.filename];
    units.push({ code: lowered.code, map });
  });

  return units;
}
