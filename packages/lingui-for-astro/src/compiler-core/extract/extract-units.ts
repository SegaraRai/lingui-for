import MagicString from "magic-string";

import type { ExtractionUnit } from "lingui-for-shared/compiler";

import { lowerComponentMacro } from "../lower/component-macro.ts";
import {
  EXPR_PREFIX,
  WRAPPED_SUFFIX,
  createSyntheticMacroImports,
} from "../lower/common.ts";
import { createAstroPlan, type AstroPlan } from "../plan/index.ts";
import {
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import type { LinguiAstroTransformOptions } from "../shared/types.ts";

function buildExtractionUnit(
  fullSource: string,
  filename: string,
  snippetStart: number,
  snippetEnd: number,
  prefix: string,
  suffix: string,
): ExtractionUnit {
  const ms = new MagicString(fullSource, { filename });
  if (snippetStart > 0) {
    ms.remove(0, snippetStart);
  }
  if (snippetEnd < fullSource.length) {
    ms.remove(snippetEnd, fullSource.length);
  }
  if (prefix.length > 0) {
    ms.prepend(prefix);
  }
  const code = ms.toString() + suffix;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = ms.generateMap({
    source: filename,
    file: filename,
    includeContent: true,
    hires: true,
  }) as any;
  // MagicString computes sources as a path relative to `file`, which collapses
  // to just the basename when source === file. Override with the absolute path
  // so that Lingui can correctly relativize against rootDir.
  map.sources = [filename];
  return { code, map };
}

export function createAstroExtractionUnits(
  source: string,
  options: LinguiAstroTransformOptions,
): ExtractionUnit[] {
  const plan = createAstroPlan(source, options);
  return createAstroExtractionUnitsFromPlan(plan);
}

/**
 * Returns true when the frontmatter content contains at least one macro call
 * or tagged-template usage (i.e. something beyond bare import declarations).
 * This avoids emitting an extraction unit for import-only frontmatters.
 */
function frontmatterHasMacroCalls(
  content: string,
  macroImports: ReadonlyMap<string, string>,
): boolean {
  if (macroImports.size === 0) return false;
  // Strip import declarations so we don't match the package name inside them.
  const withoutImports = content.replace(
    /^[ \t]*import\b[^;]*;[ \t]*(\r?\n)?/gm,
    "",
  );
  return [...macroImports.keys()].some((name) =>
    new RegExp("\\b" + name + "\\s*[`(]").test(withoutImports),
  );
}

export function createAstroExtractionUnitsFromPlan(
  plan: AstroPlan,
): ExtractionUnit[] {
  const units: ExtractionUnit[] = [];
  const filename = plan.options.filename;

  const frontmatterItem = plan.items.find(
    (
      item,
    ): item is Extract<
      AstroPlan["items"][number],
      { kind: "frontmatter-macro-block" }
    > => item.kind === "frontmatter-macro-block",
  );

  if (
    frontmatterItem &&
    plan.frontmatter &&
    frontmatterHasMacroCalls(plan.frontmatter.content, plan.macroImports)
  ) {
    units.push(
      buildExtractionUnit(
        plan.source,
        filename,
        plan.frontmatter.contentRange.start,
        plan.frontmatter.contentRange.end,
        "",
        "",
      ),
    );
  }

  for (const item of plan.items) {
    if (item.kind === "template-expression") {
      const prefix = `${createSyntheticMacroImports(plan.macroImports)}${EXPR_PREFIX}`;
      units.push(
        buildExtractionUnit(
          plan.source,
          filename,
          item.innerRange.start,
          item.innerRange.end,
          prefix,
          WRAPPED_SUFFIX,
        ),
      );
    }

    if (item.kind === "component-macro") {
      // Use Plan A lowering for component macros to correctly handle nested core
      // macro calls (e.g. selectOrdinal inside Plural attribute values).
      // Build a source map by overwriting the original component range with the
      // lowered code so that Lingui can trace origin back to the correct file and
      // line (using the source map) rather than falling back to a raw filename.
      const lowered = lowerComponentMacro(
        plan.source.slice(item.range.start, item.range.end),
        plan.macroImports,
        plan.options,
        {
          extract: true,
          runtimeBindings: {
            i18n: RUNTIME_BINDING_I18N,
            runtimeTrans: RUNTIME_BINDING_RUNTIME_TRANS,
          },
        },
      );
      const ms = new MagicString(plan.source, { filename });
      if (item.range.start > 0) {
        ms.remove(0, item.range.start);
      }
      if (item.range.end < plan.source.length) {
        ms.remove(item.range.end, plan.source.length);
      }
      ms.overwrite(item.range.start, item.range.end, lowered.code);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = ms.generateMap({
        source: filename,
        file: filename,
        includeContent: false,
        hires: true,
      }) as any;
      map.sources = [filename];
      units.push({ code: lowered.code, map });
    }
  }

  return units;
}
