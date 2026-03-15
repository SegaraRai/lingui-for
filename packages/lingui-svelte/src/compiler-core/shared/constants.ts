export const MACRO_PACKAGE = "lingui-for-svelte/macro";
export const RUNTIME_PACKAGE = "lingui-for-svelte/runtime";
export const SYNTHETIC_EXPRESSION_PREFIX = "__lingui_for_svelte_expr_";
export const SYNTHETIC_COMPONENT_PREFIX = "__lingui_for_svelte_component_";
export const REACTIVE_TRANSLATION_WRAPPER =
  "__lingui_for_svelte_reactive_translation__";
export const DEFAULT_CONTEXT_BINDING = "__l4s_ctx";
export const DEFAULT_I18N_BINDING = "__l4s_i18n";
export const DEFAULT_TRANSLATOR_BINDING = "__l4s_translate";
export const DEFAULT_RUNTIME_TRANS_COMPONENT_BINDING = "L4sRuntimeTrans";
export const GET_LINGUI_CONTEXT_EXPORT = "getLinguiContext";
export const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const;
export const EXPRESSION_KEYS = new Set(["expression", "test", "key", "tag"]);
export const COMPONENT_MACRO_NAMES = new Set([
  "Trans",
  "Plural",
  "Select",
  "SelectOrdinal",
]);
