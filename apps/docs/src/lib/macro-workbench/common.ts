export const WORKBENCH_LOCALE_CODES = ["en", "ja"] as const;

export type MacroWorkbenchLocaleCode = (typeof WORKBENCH_LOCALE_CODES)[number];
