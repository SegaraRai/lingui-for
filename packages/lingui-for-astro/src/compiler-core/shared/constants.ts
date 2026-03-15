export const PACKAGE_MACRO = "lingui-for-astro/macro";
export const PACKAGE_MACRO_ALIASES = [
  PACKAGE_MACRO,
  "@lingui/core/macro",
  "@lingui/react/macro",
  "@lingui/macro",
] as const;
export const PACKAGE_RUNTIME = "lingui-for-astro/runtime";

export const SYNTHETIC_PREFIX_EXPRESSION = "__lingui_for_astro_expr_";
export const SYNTHETIC_PREFIX_COMPONENT = "__lingui_for_astro_component_";

export const RUNTIME_BINDING_GET_LINGUI_CONTEXT = "__l4a_getLinguiContext";
export const RUNTIME_BINDING_CONTEXT = "__l4a_ctx";
export const RUNTIME_BINDING_I18N = "__l4a_i18n";
export const RUNTIME_BINDING_RUNTIME_TRANS = "L4aRuntimeTrans";
