import type { LinguiConfig } from "@lingui/conf";

/**
 * Parser/lowering mode used for script-like inputs handled by the compiler core.
 *
 * `"js"` covers JavaScript-family files such as `.js`, `.jsx`, `.mjs`, and `.cjs`.
 * `"ts"` covers TypeScript-family files such as `.ts`, `.tsx`, `.mts`, and `.cts`.
 */
export type ScriptLang = "js" | "ts";

/**
 * The two `<script>` variants that may exist inside a `.svelte` file.
 *
 * `"instance"` refers to the normal component script.
 * `"module"` refers to `<script module>`.
 */
export type ScriptKind = "instance" | "module";

/**
 * Common options accepted by compiler-core transform and extraction entry points.
 *
 * @property filename Logical source filename used for parser behavior and generated source maps.
 * @property linguiConfig Optional partial Lingui configuration merged with package defaults before
 * transforming or extracting messages.
 */
export type LinguiSvelteTransformOptions = {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
};
