/** Canonical package specifier for Lingui's core runtime module. */
export const LINGUI_CORE_PACKAGE = "@lingui/core";

/** Canonical package specifier for Lingui's core-only macro entry. */
export const LINGUI_CORE_MACRO_PACKAGE = "@lingui/core/macro";

/** Canonical package specifier for Lingui's React macro entry. */
export const LINGUI_REACT_MACRO_PACKAGE = "@lingui/react/macro";

/** Canonical package specifier for Lingui's generic macro entry. */
export const LINGUI_DEPRECATED_MACRO_PACKAGE = "@lingui/macro";

/** Named export used by Lingui to expose the global translation runtime. */
export const LINGUI_I18N_EXPORT = "i18n";

/** Member name used to invoke Lingui translation on an i18n instance. */
export const LINGUI_TRANSLATE_METHOD = "_";

/** Named export used by framework runtimes to expose the lowered Trans component. */
export const LINGUI_RUNTIME_TRANS_EXPORT = "RuntimeTrans";

/** Macro import name for Lingui's tagged and callable translation helper. */
export const LINGUI_MACRO_T = "t";

/** Macro import name for Lingui's plural ICU helper. */
export const LINGUI_MACRO_PLURAL = "plural";

/** Macro import name for Lingui's select ICU helper. */
export const LINGUI_MACRO_SELECT = "select";

/** Macro import name for Lingui's selectOrdinal ICU helper. */
export const LINGUI_MACRO_SELECT_ORDINAL = "selectOrdinal";

/** Macro import name for Lingui's rich-text Trans component. */
export const LINGUI_MACRO_TRANS = "Trans";

/** Macro import name for Lingui's plural component helper. */
export const LINGUI_MACRO_PLURAL_COMPONENT = "Plural";

/** Macro import name for Lingui's select component helper. */
export const LINGUI_MACRO_SELECT_COMPONENT = "Select";

/** Macro import name for Lingui's selectOrdinal component helper. */
export const LINGUI_MACRO_SELECT_ORDINAL_COMPONENT = "SelectOrdinal";

/** Macro import name for Lingui's object-based message descriptor builder. */
export const LINGUI_MACRO_DEFINE_MESSAGE = "defineMessage";

/** Macro import name for Lingui's tagged message descriptor builder. */
export const LINGUI_MACRO_MSG = "msg";

/** Standard core macro packages recognized by Lingui config. */
export const LINGUI_STANDARD_CORE_MACRO_PACKAGES = [
  LINGUI_CORE_MACRO_PACKAGE,
  LINGUI_DEPRECATED_MACRO_PACKAGE,
] as const;

/** Standard JSX macro packages recognized by Lingui config. */
export const LINGUI_STANDARD_JSX_MACRO_PACKAGES = [
  LINGUI_REACT_MACRO_PACKAGE,
  LINGUI_DEPRECATED_MACRO_PACKAGE,
] as const;

/** Component-style macro imports that lower to runtime rich-text rendering. */
export const LINGUI_COMPONENT_MACRO_IMPORTS = [
  LINGUI_MACRO_TRANS,
  LINGUI_MACRO_PLURAL_COMPONENT,
  LINGUI_MACRO_SELECT_COMPONENT,
  LINGUI_MACRO_SELECT_ORDINAL_COMPONENT,
] as const;

/** Direct string-producing macro imports that yield translated strings. */
export const LINGUI_DIRECT_STRING_MACRO_IMPORTS = [
  LINGUI_MACRO_T,
  LINGUI_MACRO_PLURAL,
  LINGUI_MACRO_SELECT,
  LINGUI_MACRO_SELECT_ORDINAL,
] as const;

/** All Lingui macro imports supported by the framework compilers. */
export const LINGUI_ALL_MACRO_IMPORTS = [
  ...LINGUI_COMPONENT_MACRO_IMPORTS,
  LINGUI_MACRO_DEFINE_MESSAGE,
  LINGUI_MACRO_MSG,
  ...LINGUI_DIRECT_STRING_MACRO_IMPORTS,
] as const;
