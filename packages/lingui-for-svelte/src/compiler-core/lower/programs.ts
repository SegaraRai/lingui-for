import type { SveltePlan } from "../plan/svelte-plan.ts";
import { createScriptFilename } from "../shared/paths.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";

export type LoweringProgram = {
  code: string;
  filename: string;
  lang: "js" | "ts";
};

export function createModuleProgramFromPlan(
  plan: SveltePlan,
): LoweringProgram | null {
  const module = plan.analysis.module;

  if (!module) {
    return null;
  }

  return {
    code: module.content,
    filename: createScriptFilename(plan.filename, "module", module.lang),
    lang: module.lang,
  };
}

export function createCombinedProgramFromPlan(
  plan: SveltePlan,
): LoweringProgram | null {
  if (
    !plan.analysis.instance &&
    plan.analysis.expressions.length === 0 &&
    plan.analysis.components.length === 0
  ) {
    return null;
  }

  const instanceLang = plan.analysis.instance?.lang ?? "ts";
  const combined = buildCombinedProgram(
    plan.source,
    plan.filename,
    plan.analysis.instance,
    plan.analysis.expressions,
    plan.analysis.components,
  );

  return {
    code: combined.code,
    filename: createScriptFilename(plan.filename, "instance", instanceLang),
    lang: instanceLang,
  };
}
