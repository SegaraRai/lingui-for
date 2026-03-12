export const MACRO_PACKAGE = "lingui-svelte/macro";
export const RUNTIME_PACKAGE = "lingui-svelte/runtime";
export const SYNTHETIC_EXPRESSION_PREFIX = "__lingui_svelte_expr_";
export const SYNTHETIC_MACRO_IMPORT = `import { Trans, defineMessage, msg, plural, select, selectOrdinal, t, useLingui } from "${MACRO_PACKAGE}";\n`;
export const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const;
export const EXPRESSION_KEYS = new Set(["expression", "test", "key", "tag"]);
