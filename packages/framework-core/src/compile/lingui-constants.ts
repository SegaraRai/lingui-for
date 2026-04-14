/** Canonical package specifier for Lingui's core runtime module. */
export const LINGUI_CORE_PACKAGE = "@lingui/core";

/** Canonical package specifier for Lingui's core-only macro entry. */
const LINGUI_CORE_MACRO_PACKAGE = "@lingui/core/macro";

/** Canonical package specifier for Lingui's generic macro entry. */
const LINGUI_DEPRECATED_MACRO_PACKAGE = "@lingui/macro";

/** Standard core macro packages recognized by Lingui config. */
export const LINGUI_STANDARD_CORE_MACRO_PACKAGES = [
  LINGUI_CORE_MACRO_PACKAGE,
  LINGUI_DEPRECATED_MACRO_PACKAGE,
] as const;

/** Named export used by Lingui to expose the global translation runtime. */
export const LINGUI_I18N_EXPORT = "i18n";

/** Member name used to invoke Lingui translation on an i18n instance. */
export const LINGUI_TRANSLATE_METHOD = "_";
