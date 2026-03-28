import type { ParserOptions } from "@babel/core";

export function getParserPlugins(options?: {
  readonly typescript?: boolean;
}): NonNullable<ParserOptions["plugins"]> {
  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    ...(options?.typescript ? (["typescript"] as const) : []),
    "jsx",
  ];
}
